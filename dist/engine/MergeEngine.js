"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MergeEngine = void 0;
const errors_1 = require("../errors");
class MergeEngine {
    static mergeReported(current, reported, timestamp) {
        const mergedState = this.deepMerge(current.reported, reported);
        const mergedMetadata = this.updateMetadata(current.metadata.reported, reported, timestamp);
        return { state: mergedState, metadata: mergedMetadata };
    }
    static mergeDesired(current, desired, timestamp, expectedVersion) {
        if (expectedVersion !== undefined && expectedVersion !== current.version) {
            throw new errors_1.ShadowConflictError(current.thingName, current.version, expectedVersion);
        }
        const mergedState = this.deepMerge(current.desired, desired);
        const mergedMetadata = this.updateMetadata(current.metadata.desired, desired, timestamp);
        return { state: mergedState, metadata: mergedMetadata };
    }
    static calculateDelta(reported, desired) {
        const delta = {};
        this.calculateDeltaRecursive(reported, desired, delta);
        return delta;
    }
    static calculateDeltaRecursive(reported, desired, delta, path = '') {
        const allKeys = new Set([...Object.keys(desired), ...Object.keys(reported)]);
        for (const key of allKeys) {
            const desiredValue = desired[key];
            const reportedValue = reported[key];
            const currentPath = path ? `${path}.${key}` : key;
            if (desiredValue === null || desiredValue === undefined) {
                if (reportedValue !== undefined) {
                    this.setNestedValue(delta, currentPath, desiredValue);
                }
                continue;
            }
            if (typeof desiredValue === 'object' &&
                desiredValue !== null &&
                !Array.isArray(desiredValue)) {
                if (typeof reportedValue === 'object' &&
                    reportedValue !== null &&
                    !Array.isArray(reportedValue)) {
                    this.calculateDeltaRecursive(reportedValue, desiredValue, delta, currentPath);
                }
                else {
                    this.setNestedValue(delta, currentPath, desiredValue);
                }
            }
            else {
                if (JSON.stringify(desiredValue) !== JSON.stringify(reportedValue)) {
                    this.setNestedValue(delta, currentPath, desiredValue);
                }
            }
        }
    }
    static setNestedValue(obj, path, value) {
        const keys = path.split('.');
        let current = obj;
        for (let i = 0; i < keys.length - 1; i++) {
            const key = keys[i];
            if (!current[key] || typeof current[key] !== 'object') {
                current[key] = {};
            }
            current = current[key];
        }
        current[keys[keys.length - 1]] = value;
    }
    static deepMerge(target, source) {
        const result = { ...target };
        for (const key of Object.keys(source)) {
            const sourceValue = source[key];
            if (sourceValue === null) {
                delete result[key];
                continue;
            }
            if (typeof sourceValue === 'object' &&
                !Array.isArray(sourceValue) &&
                sourceValue !== null) {
                if (typeof result[key] === 'object' &&
                    !Array.isArray(result[key]) &&
                    result[key] !== null) {
                    result[key] = this.deepMerge(result[key], sourceValue);
                }
                else {
                    result[key] = { ...sourceValue };
                }
            }
            else {
                result[key] = sourceValue;
            }
        }
        return result;
    }
    static updateMetadata(currentMetadata, updates, timestamp) {
        const metadata = { ...currentMetadata };
        this.updateMetadataRecursive(metadata, updates, timestamp);
        return metadata;
    }
    static updateMetadataRecursive(metadata, updates, timestamp, path = '') {
        for (const key of Object.keys(updates)) {
            const value = updates[key];
            const currentPath = path ? `${path}.${key}` : key;
            if (typeof value === 'object' &&
                !Array.isArray(value) &&
                value !== null) {
                this.updateMetadataRecursive(metadata, value, timestamp, currentPath);
            }
            else {
                metadata[currentPath] = { timestamp };
            }
        }
    }
    static checkVersionConflict(currentVersion, requestedVersion) {
        if (requestedVersion === undefined) {
            return false;
        }
        return requestedVersion !== currentVersion;
    }
    static createEmptyDocument(thingName) {
        const now = Date.now();
        return {
            thingName,
            version: 1,
            reported: {},
            desired: {},
            delta: {},
            metadata: {
                reported: {},
                desired: {},
            },
            timestamp: now,
        };
    }
}
exports.MergeEngine = MergeEngine;
//# sourceMappingURL=MergeEngine.js.map