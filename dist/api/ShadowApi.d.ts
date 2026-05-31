import { Express } from 'express';
import { ShadowManager } from '../shadow/ShadowManager';
export declare class ShadowApi {
    private app;
    private shadowManager;
    constructor(shadowManager: ShadowManager);
    private setupMiddleware;
    private setupRoutes;
    private setupErrorHandler;
    private healthCheck;
    private listThings;
    private getShadow;
    private updateShadow;
    private deleteShadow;
    private getDelta;
    private getAuditLog;
    private getAvailableVersions;
    private getVersionSnapshot;
    private rollbackToVersion;
    private getStats;
    private getAuditStats;
    getApp(): Express;
    listen(port: number, host?: string): Promise<void>;
}
