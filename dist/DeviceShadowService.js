"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeviceShadowService = void 0;
const CallbackManager_1 = require("./callbacks/CallbackManager");
const MqttConnector_1 = require("./mqtt/MqttConnector");
const ShadowManager_1 = require("./shadow/ShadowManager");
const ShadowApi_1 = require("./api/ShadowApi");
const AuditManager_1 = require("./audit/AuditManager");
class DeviceShadowService {
    constructor(config) {
        this.started = false;
        this.config = config;
        this.callbackManager = new CallbackManager_1.CallbackManager();
        this.auditManager = new AuditManager_1.AuditManager();
        this.mqttConnector = new MqttConnector_1.MqttConnector(config.mqtt);
        this.shadowManager = new ShadowManager_1.ShadowManager(this.callbackManager, this.auditManager);
        this.shadowApi = new ShadowApi_1.ShadowApi(this.shadowManager);
    }
    async start() {
        if (this.started) {
            console.log('[Service] Already started');
            return;
        }
        console.log('[Service] Starting Device Shadow Service...');
        this.setupMqttEventHandlers();
        this.shadowManager.setMqttConnector(this.mqttConnector);
        try {
            await this.mqttConnector.connect();
        }
        catch (err) {
            const error = err;
            console.warn('[Service] MQTT connection failed, continuing without MQTT:', error.message);
        }
        await this.shadowApi.listen(this.config.api.port, this.config.api.host);
        this.started = true;
        console.log('[Service] Device Shadow Service started successfully');
    }
    setupMqttEventHandlers() {
        this.mqttConnector.on('update', async (data) => {
            try {
                await this.shadowManager.updateShadow(data.request);
            }
            catch (err) {
                console.error('[Service] Error processing MQTT update:', err);
            }
        });
        this.mqttConnector.on('get', (data) => {
            try {
                const shadow = this.shadowManager.getShadow(data.thingName);
                this.mqttConnector.publishGetAccepted(data.thingName, {
                    thingName: data.thingName,
                    version: shadow.version,
                    state: {
                        reported: shadow.reported,
                        desired: shadow.desired,
                        delta: shadow.delta,
                    },
                    metadata: shadow.metadata,
                    timestamp: shadow.timestamp,
                    clientToken: data.clientToken,
                });
            }
            catch (err) {
                const error = err;
                console.error('[Service] Error processing MQTT get:', error);
                this.mqttConnector.publishRejected(data.thingName, {
                    code: 'NotFound',
                    message: error.message,
                    clientToken: data.clientToken,
                });
            }
        });
        this.mqttConnector.on('connected', () => {
            console.log('[Service] MQTT connector connected (first connection)');
        });
        this.mqttConnector.on('reconnected', () => {
            console.log('[Service] MQTT connector reconnected - syncing shadow state');
            this.shadowManager.onMqttReconnect();
        });
        this.mqttConnector.on('error', (err) => {
            console.error('[Service] MQTT connector error:', err);
        });
    }
    async stop() {
        if (!this.started) {
            return;
        }
        console.log('[Service] Stopping Device Shadow Service...');
        await this.mqttConnector.disconnect();
        this.callbackManager.clearAll();
        this.auditManager.clearAll();
        this.started = false;
        console.log('[Service] Device Shadow Service stopped');
    }
    getAuditManager() {
        return this.auditManager;
    }
    getShadowManager() {
        return this.shadowManager;
    }
    getMqttConnector() {
        return this.mqttConnector;
    }
    getCallbackManager() {
        return this.callbackManager;
    }
    getApi() {
        return this.shadowApi;
    }
    isStarted() {
        return this.started;
    }
}
exports.DeviceShadowService = DeviceShadowService;
//# sourceMappingURL=DeviceShadowService.js.map