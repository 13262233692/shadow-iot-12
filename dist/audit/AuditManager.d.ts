import { AuditLogEntry, AuditLogQuery, AuditLogResult, ShadowState, ShadowDocument, ChangeSource, Operator } from '../types/shadow';
export declare class AuditManager {
    private auditLogs;
    private maxEntriesPerThing;
    constructor(maxEntriesPerThing?: number);
    recordUpdate(previousShadow: ShadowDocument, newShadow: ShadowDocument, diff: {
        reported?: ShadowState;
        desired?: ShadowState;
    }, changeSource: ChangeSource, operator?: Operator, clientToken?: string, reason?: string): AuditLogEntry;
    recordRollback(previousShadow: ShadowDocument, newShadow: ShadowDocument, targetVersion: number, operator?: Operator, reason?: string): AuditLogEntry;
    private appendEntry;
    private determineChangeType;
    getEntry(thingName: string, version: number): AuditLogEntry | undefined;
    getSnapshotAtVersion(thingName: string, version: number): ShadowDocument | undefined;
    query(query: AuditLogQuery): AuditLogResult;
    getVersions(thingName: string): number[];
    getLatestVersion(thingName: string): number | undefined;
    getEarliestVersion(thingName: string): number | undefined;
    clearAuditLog(thingName: string): boolean;
    clearAll(): void;
    getStats(): {
        totalEntries: number;
        thingCount: number;
        entriesPerThing: Record<string, number>;
    };
}
