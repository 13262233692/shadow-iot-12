import { CallbackManager } from './callbacks/CallbackManager';
import { MqttConnector } from './mqtt/MqttConnector';
import { ShadowManager } from './shadow/ShadowManager';
import { ShadowApi } from './api/ShadowApi';
import { AuditManager } from './audit/AuditManager';
import { ServiceConfig } from './types/shadow';
export declare class DeviceShadowService {
    private config;
    private callbackManager;
    private auditManager;
    private mqttConnector;
    private shadowManager;
    private shadowApi;
    private started;
    constructor(config: ServiceConfig);
    start(): Promise<void>;
    private setupMqttEventHandlers;
    stop(): Promise<void>;
    getAuditManager(): AuditManager;
    getShadowManager(): ShadowManager;
    getMqttConnector(): MqttConnector;
    getCallbackManager(): CallbackManager;
    getApi(): ShadowApi;
    isStarted(): boolean;
}
