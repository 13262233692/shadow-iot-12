import {
  AuditLogEntry,
  AuditLogQuery,
  AuditLogResult,
  ShadowState,
  ShadowDocument,
  ChangeSource,
  Operator,
} from '../types/shadow';

const DEFAULT_MAX_AUDIT_ENTRIES_PER_THING = 1000;

export class AuditManager {
  private auditLogs: Map<string, AuditLogEntry[]> = new Map();
  private maxEntriesPerThing: number;

  constructor(maxEntriesPerThing: number = DEFAULT_MAX_AUDIT_ENTRIES_PER_THING) {
    this.maxEntriesPerThing = maxEntriesPerThing;
  }

  public recordUpdate(
    previousShadow: ShadowDocument,
    newShadow: ShadowDocument,
    diff: { reported?: ShadowState; desired?: ShadowState },
    changeSource: ChangeSource,
    operator?: Operator,
    clientToken?: string,
    reason?: string
  ): AuditLogEntry {
    const changeType = this.determineChangeType(
      previousShadow,
      newShadow
    );

    const entry: AuditLogEntry = {
      thingName: newShadow.thingName,
      version: newShadow.version,
      previousVersion: previousShadow.version,
      state: {
        reported: { ...newShadow.reported },
        desired: { ...newShadow.desired },
        delta: { ...newShadow.delta },
      },
      changeType,
      changeSource,
      operator,
      timestamp: newShadow.timestamp,
      clientToken,
      reason,
      diff,
    };

    this.appendEntry(entry);
    console.log(
      `[Audit] Recorded change for ${newShadow.thingName}: ` +
      `v${previousShadow.version} -> v${newShadow.version}, ` +
      `type=${changeType}, source=${changeSource}` +
      (operator ? `, operator=${operator.id}` : '')
    );

    return entry;
  }

  public recordRollback(
    previousShadow: ShadowDocument,
    newShadow: ShadowDocument,
    targetVersion: number,
    operator?: Operator,
    reason?: string
  ): AuditLogEntry {
    const entry: AuditLogEntry = {
      thingName: newShadow.thingName,
      version: newShadow.version,
      previousVersion: previousShadow.version,
      state: {
        reported: { ...newShadow.reported },
        desired: { ...newShadow.desired },
        delta: { ...newShadow.delta },
      },
      changeType: 'rollback',
      changeSource: 'rollback',
      operator,
      timestamp: newShadow.timestamp,
      reason: reason || `Rollback to version ${targetVersion}`,
      diff: {
        reported: newShadow.reported,
        desired: newShadow.desired,
      },
    };

    this.appendEntry(entry);
    console.log(
      `[Audit] Recorded rollback for ${newShadow.thingName}: ` +
      `v${previousShadow.version} -> v${newShadow.version} (target v${targetVersion}), ` +
      (operator ? `operator=${operator.id}` : '')
    );

    return entry;
  }

  private appendEntry(entry: AuditLogEntry): void {
    let entries = this.auditLogs.get(entry.thingName);
    if (!entries) {
      entries = [];
      this.auditLogs.set(entry.thingName, entries);
    }

    entries.push(entry);

    if (entries.length > this.maxEntriesPerThing) {
      const removed = entries.splice(0, entries.length - this.maxEntriesPerThing);
      console.log(
        `[Audit] Purged ${removed.length} old audit entries for ${entry.thingName}, ` +
        `keeping last ${this.maxEntriesPerThing}`
      );
    }
  }

  private determineChangeType(
    previous: ShadowDocument,
    current: ShadowDocument
  ): 'reported' | 'desired' | 'both' {
    const reportedChanged =
      JSON.stringify(previous.reported) !== JSON.stringify(current.reported);
    const desiredChanged =
      JSON.stringify(previous.desired) !== JSON.stringify(current.desired);

    if (reportedChanged && desiredChanged) return 'both';
    if (reportedChanged) return 'reported';
    return 'desired';
  }

  public getEntry(thingName: string, version: number): AuditLogEntry | undefined {
    const entries = this.auditLogs.get(thingName);
    if (!entries) return undefined;
    return entries.find((e) => e.version === version);
  }

  public getSnapshotAtVersion(
    thingName: string,
    version: number
  ): ShadowDocument | undefined {
    const entry = this.getEntry(thingName, version);
    if (!entry) return undefined;

    return {
      thingName: entry.thingName,
      version: entry.version,
      reported: entry.state.reported,
      desired: entry.state.desired,
      delta: entry.state.delta,
      metadata: {
        reported: {},
        desired: {},
      },
      timestamp: entry.timestamp,
    };
  }

  public query(query: AuditLogQuery): AuditLogResult {
    let results: AuditLogEntry[] = [];

    const thingNames = query.thingName
      ? [query.thingName]
      : Array.from(this.auditLogs.keys());

    for (const thingName of thingNames) {
      const entries = this.auditLogs.get(thingName) || [];
      let filtered = entries;

      if (query.fromVersion !== undefined) {
        filtered = filtered.filter((e) => e.version >= query.fromVersion!);
      }
      if (query.toVersion !== undefined) {
        filtered = filtered.filter((e) => e.version <= query.toVersion!);
      }
      if (query.fromTime !== undefined) {
        filtered = filtered.filter((e) => e.timestamp >= query.fromTime!);
      }
      if (query.toTime !== undefined) {
        filtered = filtered.filter((e) => e.timestamp <= query.toTime!);
      }
      if (query.operatorId !== undefined) {
        filtered = filtered.filter((e) => e.operator?.id === query.operatorId);
      }
      if (query.changeSource !== undefined) {
        filtered = filtered.filter((e) => e.changeSource === query.changeSource);
      }

      results = results.concat(filtered);
    }

    results.sort((a, b) => b.timestamp - a.timestamp);

    const total = results.length;
    const offset = query.offset || 0;
    const limit = query.limit || 50;

    const paginated = results.slice(offset, offset + limit);

    return {
      entries: paginated,
      total,
      limit,
      offset,
    };
  }

  public getVersions(thingName: string): number[] {
    const entries = this.auditLogs.get(thingName) || [];
    return entries.map((e) => e.version).sort((a, b) => b - a);
  }

  public getLatestVersion(thingName: string): number | undefined {
    const entries = this.auditLogs.get(thingName) || [];
    if (entries.length === 0) return undefined;
    return entries[entries.length - 1].version;
  }

  public getEarliestVersion(thingName: string): number | undefined {
    const entries = this.auditLogs.get(thingName) || [];
    if (entries.length === 0) return undefined;
    return entries[0].version;
  }

  public clearAuditLog(thingName: string): boolean {
    const existed = this.auditLogs.has(thingName);
    if (existed) {
      this.auditLogs.delete(thingName);
      console.log(`[Audit] Cleared audit log for ${thingName}`);
    }
    return existed;
  }

  public clearAll(): void {
    this.auditLogs.clear();
    console.log('[Audit] Cleared all audit logs');
  }

  public getStats(): {
    totalEntries: number;
    thingCount: number;
    entriesPerThing: Record<string, number>;
  } {
    const entriesPerThing: Record<string, number> = {};
    let totalEntries = 0;

    for (const [thingName, entries] of this.auditLogs.entries()) {
      entriesPerThing[thingName] = entries.length;
      totalEntries += entries.length;
    }

    return {
      totalEntries,
      thingCount: this.auditLogs.size,
      entriesPerThing,
    };
  }
}
