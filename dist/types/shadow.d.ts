export interface ShadowState {
    [key: string]: any;
}
export interface ShadowMetadata {
    [key: string]: {
        timestamp: number;
    };
}
export interface ShadowDocument {
    thingName: string;
    version: number;
    reported: ShadowState;
    desired: ShadowState;
    delta: ShadowState;
    metadata: {
        reported: ShadowMetadata;
        desired: ShadowMetadata;
    };
    timestamp: number;
}
export type ChangeSource = 'mqtt' | 'api' | 'rollback' | 'system';
export interface Operator {
    id: string;
    name?: string;
    type: 'device' | 'user' | 'application' | 'system';
}
export interface ShadowUpdateRequest {
    thingName: string;
    state: {
        reported?: ShadowState;
        desired?: ShadowState;
    };
    clientToken?: string;
    version?: number;
    timestamp?: number;
    operator?: Operator;
    source?: ChangeSource;
}
export interface ShadowRollbackRequest {
    thingName: string;
    targetVersion: number;
    operator?: Operator;
    reason?: string;
}
export interface ShadowUpdateResponse {
    thingName: string;
    version: number;
    state: {
        reported?: ShadowState;
        desired?: ShadowState;
        delta?: ShadowState;
    };
    metadata: {
        reported?: ShadowMetadata;
        desired?: ShadowMetadata;
    };
    timestamp: number;
    clientToken?: string;
    operator?: Operator;
    source?: ChangeSource;
}
export interface AuditLogEntry {
    thingName: string;
    version: number;
    previousVersion: number;
    state: {
        reported: ShadowState;
        desired: ShadowState;
        delta: ShadowState;
    };
    changeType: 'reported' | 'desired' | 'both' | 'rollback';
    changeSource: ChangeSource;
    operator?: Operator;
    timestamp: number;
    clientToken?: string;
    reason?: string;
    diff: {
        reported?: ShadowState;
        desired?: ShadowState;
    };
}
export interface AuditLogQuery {
    thingName?: string;
    fromVersion?: number;
    toVersion?: number;
    fromTime?: number;
    toTime?: number;
    operatorId?: string;
    changeSource?: ChangeSource;
    limit?: number;
    offset?: number;
}
export interface AuditLogResult {
    entries: AuditLogEntry[];
    total: number;
    limit: number;
    offset: number;
}
export interface ShadowRollbackResponse {
    thingName: string;
    previousVersion: number;
    newVersion: number;
    targetVersion: number;
    state: {
        reported: ShadowState;
        desired: ShadowState;
        delta: ShadowState;
    };
    timestamp: number;
    operator?: Operator;
    reason?: string;
}
export interface ConflictError {
    code: string;
    message: string;
    clientToken?: string;
    currentVersion: number;
    requestedVersion: number;
}
export interface ShadowDelta {
    thingName: string;
    version: number;
    state: ShadowState;
    metadata: ShadowMetadata;
    timestamp: number;
}
export type ShadowCallback = (delta: ShadowDelta) => void | Promise<void>;
export interface MqttConfig {
    brokerUrl: string;
    username?: string;
    password?: string;
    topicPrefix?: string;
}
export interface ApiConfig {
    port: number;
    host?: string;
}
export interface ServiceConfig {
    mqtt: MqttConfig;
    api: ApiConfig;
}
