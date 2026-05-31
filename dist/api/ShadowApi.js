"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShadowApi = void 0;
const express_1 = __importDefault(require("express"));
const errors_1 = require("../errors");
class ShadowApi {
    constructor(shadowManager) {
        this.app = (0, express_1.default)();
        this.shadowManager = shadowManager;
        this.setupMiddleware();
        this.setupRoutes();
        this.setupErrorHandler();
    }
    setupMiddleware() {
        this.app.use(express_1.default.json());
        this.app.use((req, res, next) => {
            console.log(`[API] ${req.method} ${req.url}`);
            next();
        });
    }
    setupRoutes() {
        const router = express_1.default.Router();
        router.get('/health', this.healthCheck.bind(this));
        router.get('/things', this.listThings.bind(this));
        router.get('/things/:thingName/shadow', this.getShadow.bind(this));
        router.put('/things/:thingName/shadow', this.updateShadow.bind(this));
        router.delete('/things/:thingName/shadow', this.deleteShadow.bind(this));
        router.get('/things/:thingName/shadow/delta', this.getDelta.bind(this));
        router.get('/things/:thingName/shadow/audit', this.getAuditLog.bind(this));
        router.get('/things/:thingName/shadow/versions', this.getAvailableVersions.bind(this));
        router.get('/things/:thingName/shadow/versions/:version', this.getVersionSnapshot.bind(this));
        router.post('/things/:thingName/shadow/rollback', this.rollbackToVersion.bind(this));
        router.get('/stats', this.getStats.bind(this));
        router.get('/audit/stats', this.getAuditStats.bind(this));
        this.app.use('/api/v1', router);
    }
    setupErrorHandler() {
        this.app.use((err, req, res, next) => {
            console.error('[API] Error:', err);
            if (err instanceof errors_1.ShadowConflictError) {
                return res.status(409).json(err.toJSON());
            }
            if (err instanceof errors_1.ShadowNotFoundError) {
                return res.status(404).json({
                    code: err.code || 'NotFound',
                    message: err.message,
                });
            }
            if (err instanceof errors_1.ShadowValidationError) {
                return res.status(400).json({
                    code: err.code || 'ValidationError',
                    message: err.message,
                });
            }
            res.status(500).json({
                code: 'InternalError',
                message: err.message || 'An unexpected error occurred',
            });
        });
    }
    healthCheck(req, res) {
        res.json({
            status: 'ok',
            timestamp: Date.now(),
        });
    }
    listThings(req, res) {
        const things = this.shadowManager.listThings();
        res.json({
            things,
            count: things.length,
        });
    }
    getShadow(req, res) {
        const { thingName } = req.params;
        const shadow = this.shadowManager.getShadow(thingName);
        res.json(shadow);
    }
    async updateShadow(req, res, next) {
        try {
            const { thingName } = req.params;
            const { state, clientToken, version, operator } = req.body;
            const request = {
                thingName,
                state: state || {},
                clientToken,
                version,
                operator,
                source: 'api',
            };
            const response = await this.shadowManager.updateShadow(request);
            res.status(200).json(response);
        }
        catch (err) {
            next(err);
        }
    }
    deleteShadow(req, res) {
        const { thingName } = req.params;
        const deleted = this.shadowManager.deleteShadow(thingName);
        if (!deleted) {
            throw new errors_1.ShadowNotFoundError(thingName);
        }
        res.status(204).send();
    }
    getDelta(req, res) {
        const { thingName } = req.params;
        const shadow = this.shadowManager.getShadow(thingName);
        res.json({
            thingName,
            version: shadow.version,
            state: shadow.delta,
            metadata: shadow.metadata.desired,
            timestamp: shadow.timestamp,
        });
    }
    getAuditLog(req, res) {
        const { thingName } = req.params;
        const { fromVersion, toVersion, fromTime, toTime, operatorId, changeSource, limit, offset, } = req.query;
        const query = {
            thingName,
            fromVersion: fromVersion ? parseInt(fromVersion) : undefined,
            toVersion: toVersion ? parseInt(toVersion) : undefined,
            fromTime: fromTime ? parseInt(fromTime) : undefined,
            toTime: toTime ? parseInt(toTime) : undefined,
            operatorId: operatorId,
            changeSource: changeSource,
            limit: limit ? parseInt(limit) : undefined,
            offset: offset ? parseInt(offset) : undefined,
        };
        const result = this.shadowManager.getAuditManager().query(query);
        res.json(result);
    }
    getAvailableVersions(req, res) {
        const { thingName } = req.params;
        this.shadowManager.getShadow(thingName);
        const versions = this.shadowManager.getAuditManager().getVersions(thingName);
        const earliest = this.shadowManager.getAuditManager().getEarliestVersion(thingName);
        const latest = this.shadowManager.getAuditManager().getLatestVersion(thingName);
        res.json({
            thingName,
            versions,
            count: versions.length,
            earliestVersion: earliest,
            latestVersion: latest,
        });
    }
    getVersionSnapshot(req, res) {
        const { thingName, version } = req.params;
        const versionNum = parseInt(version);
        if (isNaN(versionNum)) {
            throw new errors_1.ShadowValidationError('version must be a number');
        }
        const snapshot = this.shadowManager.getAuditManager().getSnapshotAtVersion(thingName, versionNum);
        if (!snapshot) {
            throw new errors_1.ShadowNotFoundError(`No snapshot found for version ${versionNum} of thing ${thingName}`);
        }
        res.json(snapshot);
    }
    async rollbackToVersion(req, res, next) {
        try {
            const { thingName } = req.params;
            const { targetVersion, operator, reason } = req.body;
            if (targetVersion === undefined) {
                throw new errors_1.ShadowValidationError('targetVersion is required');
            }
            if (typeof targetVersion !== 'number') {
                throw new errors_1.ShadowValidationError('targetVersion must be a number');
            }
            const request = {
                thingName,
                targetVersion,
                operator,
                reason,
            };
            const response = await this.shadowManager.rollbackToVersion(request);
            res.status(200).json(response);
        }
        catch (err) {
            next(err);
        }
    }
    getStats(req, res) {
        res.json({
            shadowCount: this.shadowManager.getShadowCount(),
        });
    }
    getAuditStats(req, res) {
        const stats = this.shadowManager.getAuditManager().getStats();
        res.json(stats);
    }
    getApp() {
        return this.app;
    }
    listen(port, host) {
        return new Promise((resolve) => {
            if (host) {
                this.app.listen(port, host, () => {
                    console.log(`[API] Server listening on http://${host}:${port}`);
                    resolve();
                });
            }
            else {
                this.app.listen(port, () => {
                    console.log(`[API] Server listening on http://localhost:${port}`);
                    resolve();
                });
            }
        });
    }
}
exports.ShadowApi = ShadowApi;
//# sourceMappingURL=ShadowApi.js.map