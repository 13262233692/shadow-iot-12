"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShadowManager = void 0;
const MergeEngine_1 = require("../engine/MergeEngine");
const AuditManager_1 = require("../audit/AuditManager");
const errors_1 = require("../errors");
const STALE_MESSAGE_THRESHOLD_MS = 30000;
class ShadowManager {
    constructor(callbackManager, auditManager = new AuditManager_1.AuditManager()) {
        this.shadows = new Map();
        this.mqttConnector = null;
        this.maxObservedVersions = new Map();
        this.connectionEpoch = Date.now();
        this.callbackManager = callbackManager;
        this.auditManager = auditManager;
    }
    setMqttConnector(connector) {
        this.mqttConnector = connector;
    }
    getAuditManager() {
        return this.auditManager;
    }
    onMqttReconnect() {
        this.connectionEpoch = Date.now();
        console.log(`[Shadow] MQTT reconnected, updated connectionEpoch to ${this.connectionEpoch}. ` +
            `Max observed versions preserved to prevent version regression.`);
    }
    getShadow(thingName) {
        const shadow = this.shadows.get(thingName);
        if (!shadow) {
            throw new errors_1.ShadowNotFoundError(thingName);
        }
        return shadow;
    }
    getOrCreateShadow(thingName) {
        let shadow = this.shadows.get(thingName);
        if (!shadow) {
            shadow = MergeEngine_1.MergeEngine.createEmptyDocument(thingName);
            const maxVersion = this.maxObservedVersions.get(thingName);
            if (maxVersion !== undefined && maxVersion >= shadow.version) {
                shadow.version = maxVersion + 1;
                console.log(`[Shadow] Restored version for thing ${thingName} from maxObservedVersion ${maxVersion}, starting at ${shadow.version}`);
            }
            this.shadows.set(thingName, shadow);
            console.log(`[Shadow] Created new shadow for thing ${thingName}, version ${shadow.version}`);
        }
        return shadow;
    }
    async updateShadow(request) {
        this.validateUpdateRequest(request);
        if (this.isStaleMessage(request)) {
            console.warn(`[Shadow] Rejecting stale message for thing ${request.thingName}, ` +
                `message timestamp=${request.timestamp}, connectionEpoch=${this.connectionEpoch}`);
            throw new errors_1.ShadowValidationError(`Stale message rejected: message timestamp precedes current connection epoch`);
        }
        const { thingName, state, clientToken, version, operator, source } = request;
        const timestamp = Date.now();
        const current = this.getOrCreateShadow(thingName);
        const previousShadow = { ...current };
        if (MergeEngine_1.MergeEngine.checkVersionConflict(current.version, version)) {
            const error = new errors_1.ShadowConflictError(thingName, current.version, version, clientToken);
            if (this.mqttConnector) {
                this.mqttConnector.publishConflict(thingName, error);
            }
            throw error;
        }
        let newReported = current.reported;
        let newReportedMetadata = current.metadata.reported;
        let newDesired = current.desired;
        let newDesiredMetadata = current.metadata.desired;
        let deltaChanged = false;
        if (state.reported) {
            const result = MergeEngine_1.MergeEngine.mergeReported(current, state.reported, timestamp);
            newReported = result.state;
            newReportedMetadata = result.metadata;
            deltaChanged = true;
        }
        if (state.desired) {
            const result = MergeEngine_1.MergeEngine.mergeDesired(current, state.desired, timestamp, version);
            newDesired = result.state;
            newDesiredMetadata = result.metadata;
            deltaChanged = true;
        }
        const newDelta = MergeEngine_1.MergeEngine.calculateDelta(newReported, newDesired);
        const oldDelta = current.delta;
        const deltaStateChanged = JSON.stringify(newDelta) !== JSON.stringify(oldDelta);
        let newVersion = current.version + 1;
        const maxObserved = this.maxObservedVersions.get(thingName) || 0;
        if (newVersion <= maxObserved) {
            console.warn(`[Shadow] Version regression detected for thing ${thingName}: ` +
                `calculated version ${newVersion} <= maxObserved ${maxObserved}. ` +
                `Correcting to ${maxObserved + 1}`);
            newVersion = maxObserved + 1;
        }
        this.maxObservedVersions.set(thingName, newVersion);
        const updatedShadow = {
            thingName,
            version: newVersion,
            reported: newReported,
            desired: newDesired,
            delta: newDelta,
            metadata: {
                reported: newReportedMetadata,
                desired: newDesiredMetadata,
            },
            timestamp,
        };
        this.shadows.set(thingName, updatedShadow);
        console.log(`[Shadow] Updated shadow for thing ${thingName}, version ${newVersion}`);
        const changeSource = source || (operator ? 'api' : 'mqtt');
        this.auditManager.recordUpdate(previousShadow, updatedShadow, state, changeSource, operator, clientToken);
        const response = {
            thingName,
            version: newVersion,
            state: {
                reported: state.reported,
                desired: state.desired,
                delta: deltaStateChanged ? newDelta : undefined,
            },
            metadata: {
                reported: state.reported ? newReportedMetadata : undefined,
                desired: state.desired ? newDesiredMetadata : undefined,
            },
            timestamp,
            clientToken,
            operator,
            source: changeSource,
        };
        if (this.mqttConnector) {
            this.mqttConnector.publishAccepted(thingName, response);
        }
        if (deltaStateChanged && Object.keys(newDelta).length > 0) {
            const deltaMessage = {
                thingName,
                version: newVersion,
                state: newDelta,
                metadata: this.extractDeltaMetadata(newDelta, newDesiredMetadata),
                timestamp,
            };
            if (this.mqttConnector) {
                this.mqttConnector.publishDelta(deltaMessage);
            }
            if (this.callbackManager.hasCallbacks(thingName)) {
                await this.callbackManager.notify(deltaMessage);
            }
        }
        return response;
    }
    async rollbackToVersion(request) {
        const { thingName, targetVersion, operator, reason } = request;
        const current = this.getShadow(thingName);
        if (targetVersion >= current.version) {
            throw new errors_1.ShadowValidationError(`Target version ${targetVersion} must be less than current version ${current.version}`);
        }
        const snapshot = this.auditManager.getSnapshotAtVersion(thingName, targetVersion);
        if (!snapshot) {
            throw new errors_1.ShadowNotFoundError(`No snapshot found for version ${targetVersion} of thing ${thingName}`);
        }
        const previousShadow = { ...current };
        const timestamp = Date.now();
        let newVersion = current.version + 1;
        const maxObserved = this.maxObservedVersions.get(thingName) || 0;
        if (newVersion <= maxObserved) {
            newVersion = maxObserved + 1;
        }
        this.maxObservedVersions.set(thingName, newVersion);
        const newDelta = MergeEngine_1.MergeEngine.calculateDelta(snapshot.reported, snapshot.desired);
        const rolledBackShadow = {
            thingName,
            version: newVersion,
            reported: { ...snapshot.reported },
            desired: { ...snapshot.desired },
            delta: newDelta,
            metadata: {
                reported: {},
                desired: {},
            },
            timestamp,
        };
        this.shadows.set(thingName, rolledBackShadow);
        console.log(`[Shadow] Rolled back ${thingName} from v${previousShadow.version} to v${newVersion} (target v${targetVersion})`);
        this.auditManager.recordRollback(previousShadow, rolledBackShadow, targetVersion, operator, reason);
        if (this.mqttConnector) {
            const deltaMessage = {
                thingName,
                version: newVersion,
                state: newDelta,
                metadata: {},
                timestamp,
            };
            this.mqttConnector.publishDelta(deltaMessage);
            const updateResponse = {
                thingName,
                version: newVersion,
                state: {
                    reported: snapshot.reported,
                    desired: snapshot.desired,
                    delta: newDelta,
                },
                metadata: {
                    reported: {},
                    desired: {},
                },
                timestamp,
                operator,
                source: 'rollback',
            };
            this.mqttConnector.publishAccepted(thingName, updateResponse);
        }
        if (Object.keys(newDelta).length > 0 && this.callbackManager.hasCallbacks(thingName)) {
            const deltaMessage = {
                thingName,
                version: newVersion,
                state: newDelta,
                metadata: {},
                timestamp,
            };
            await this.callbackManager.notify(deltaMessage);
        }
        return {
            thingName,
            previousVersion: previousShadow.version,
            newVersion,
            targetVersion,
            state: {
                reported: { ...rolledBackShadow.reported },
                desired: { ...rolledBackShadow.desired },
                delta: { ...rolledBackShadow.delta },
            },
            timestamp,
            operator,
            reason,
        };
    }
    isStaleMessage(request) {
        if (request.timestamp === undefined) {
            return false;
        }
        if (request.timestamp < this.connectionEpoch - STALE_MESSAGE_THRESHOLD_MS) {
            return true;
        }
        return false;
    }
    extractDeltaMetadata(delta, desiredMetadata) {
        const metadata = {};
        const extract = (obj, path = '') => {
            for (const key of Object.keys(obj)) {
                const currentPath = path ? `${path}.${key}` : key;
                const value = obj[key];
                if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                    extract(value, currentPath);
                }
                else {
                    if (desiredMetadata[currentPath]) {
                        metadata[currentPath] = desiredMetadata[currentPath];
                    }
                }
            }
        };
        extract(delta);
        return metadata;
    }
    validateUpdateRequest(request) {
        if (!request.thingName || typeof request.thingName !== 'string') {
            throw new errors_1.ShadowValidationError('thingName is required and must be a string');
        }
        if (!request.state || typeof request.state !== 'object') {
            throw new errors_1.ShadowValidationError('state is required and must be an object');
        }
        if (!request.state.reported && !request.state.desired) {
            throw new errors_1.ShadowValidationError('At least one of state.reported or state.desired must be provided');
        }
        if (request.version !== undefined && typeof request.version !== 'number') {
            throw new errors_1.ShadowValidationError('version must be a number');
        }
        if (request.version !== undefined && request.version <= 0) {
            throw new errors_1.ShadowValidationError('version must be a positive number');
        }
    }
    deleteShadow(thingName) {
        const existed = this.shadows.has(thingName);
        if (existed) {
            this.shadows.delete(thingName);
            this.maxObservedVersions.delete(thingName);
            this.auditManager.clearAuditLog(thingName);
            console.log(`[Shadow] Deleted shadow for thing ${thingName}`);
        }
        return existed;
    }
    listThings() {
        return Array.from(this.shadows.keys());
    }
    registerCallback(thingName, callback) {
        return this.callbackManager.register(thingName, callback);
    }
    registerGlobalCallback(callback) {
        return this.callbackManager.registerGlobal(callback);
    }
    unregisterCallback(registrationId) {
        return this.callbackManager.unregister(registrationId);
    }
    getShadowCount() {
        return this.shadows.size;
    }
    getMaxObservedVersion(thingName) {
        return this.maxObservedVersions.get(thingName);
    }
}
exports.ShadowManager = ShadowManager;
//# sourceMappingURL=ShadowManager.js.map