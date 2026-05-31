import { EventEmitter } from 'events';
import { MqttConfig, ShadowUpdateRequest, ShadowUpdateResponse, ShadowDelta } from '../types/shadow';
import { ShadowConflictError } from '../errors';
export interface MqttConnectorEvents {
    (event: 'update', data: {
        thingName: string;
        request: ShadowUpdateRequest;
    }): void;
    (event: 'get', data: {
        thingName: string;
        clientToken?: string;
    }): void;
    (event: 'connected'): void;
    (event: 'reconnected'): void;
    (event: 'error', error: Error): void;
}
export declare class MqttConnector extends EventEmitter {
    private client;
    private config;
    private isFirstConnection;
    private processedClientTokens;
    constructor(config: MqttConfig);
    connect(): Promise<void>;
    private subscribeToTopics;
    private handleMessage;
    private handleUpdate;
    private handleGet;
    private isDuplicateClientToken;
    private evictExpiredTokens;
    publishAccepted(thingName: string, response: ShadowUpdateResponse): void;
    publishRejected(thingName: string, error: {
        code: string;
        message: string;
        clientToken?: string;
    }): void;
    publishDelta(delta: ShadowDelta): void;
    publishGetAccepted(thingName: string, response: ShadowUpdateResponse & {
        version: number;
    }): void;
    publishConflict(thingName: string, error: ShadowConflictError): void;
    disconnect(): Promise<void>;
    isConnected(): boolean;
}
