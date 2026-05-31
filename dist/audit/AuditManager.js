"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditManager = void 0;
const DEFAULT_MAX_AUDIT_ENTRIES_PER_THING = 1000;
class AuditManager {
    constructor(maxEntriesPerThing = DEFAULT_MAX_AUDIT_ENTRIES_PER_THING) {
        this.auditLogs = new Map();
        this.maxEntriesPerThing = maxEntriesPerThing;
    }
    recordUpdate(previousShadow, newShadow, diff, changeSource, operator, clientToken, reason) {
        const changeType = this.determineChangeType(previousShadow, newShadow);
        const entry = {
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
        console.log(`[Audit] Recorded change for ${newShadow.thingName}: ` +
            `v${previousShadow.version} -> v${newShadow.version}, ` +
            `type=${changeType}, source=${changeSource}` +
            (operator ? `, operator=${operator.id}` : ''));
        return entry;
    }
    recordRollback(previousShadow, newShadow, targetVersion, operator, reason) {
        const entry = {
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
        console.log(`[Audit] Recorded rollback for ${newShadow.thingName}: ` +
            `v${previousShadow.version} -> v${newShadow.version} (target v${targetVersion}), ` +
            (operator ? `operator=${operator.id}` : ''));
        return entry;
    }
    appendEntry(entry) {
        let entries = this.auditLogs.get(entry.thingName);
        if (!entries) {
            entries = [];
            this.auditLogs.set(entry.thingName, entries);
        }
        entries.push(entry);
        if (entries.length > this.maxEntriesPerThing) {
            const removed = entries.splice(0, entries.length - this.maxEntriesPerThing);
            console.log(`[Audit] Purged ${removed.length} old audit entries for ${entry.thingName}, ` +
                `keeping last ${this.maxEntriesPerThing}`);
        }
    }
    determineChangeType(previous, current) {
        const reportedChanged = JSON.stringify(previous.reported) !== JSON.stringify(current.reported);
        const desiredChanged = JSON.stringify(previous.desired) !== JSON.stringify(current.desired);
        if (reportedChanged && desiredChanged)
            return 'both';
        if (reportedChanged)
            return 'reported';
        return 'desired';
    }
    getEntry(thingName, version) {
        const entries = this.auditLogs.get(thingName);
        if (!entries)
            return undefined;
        return entries.find((e) => e.version === version);
    }
    getSnapshotAtVersion(thingName, version) {
        const entry = this.getEntry(thingName, version);
        if (!entry)
            return undefined;
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
    query(query) {
        let results = [];
        const thingNames = query.thingName
            ? [query.thingName]
            : Array.from(this.auditLogs.keys());
        for (const thingName of thingNames) {
            const entries = this.auditLogs.get(thingName) || [];
            let filtered = entries;
            if (query.fromVersion !== undefined) {
                filtered = filtered.filter((e) => e.version >= query.fromVersion);
            }
            if (query.toVersion !== undefined) {
                filtered = filtered.filter((e) => e.version <= query.toVersion);
            }
            if (query.fromTime !== undefined) {
                filtered = filtered.filter((e) => e.timestamp >= query.fromTime);
            }
            if (query.toTime !== undefined) {
                filtered = filtered.filter((e) => e.timestamp <= query.toTime);
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
    getVersions(thingName) {
        const entries = this.auditLogs.get(thingName) || [];
        return entries.map((e) => e.version).sort((a, b) => b - a);
    }
    getLatestVersion(thingName) {
        const entries = this.auditLogs.get(thingName) || [];
        if (entries.length === 0)
            return undefined;
        return entries[entries.length - 1].version;
    }
    getEarliestVersion(thingName) {
        const entries = this.auditLogs.get(thingName) || [];
        if (entries.length === 0)
            return undefined;
        return entries[0].version;
    }
    clearAuditLog(thingName) {
        const existed = this.auditLogs.has(thingName);
        if (existed) {
            this.auditLogs.delete(thingName);
            console.log(`[Audit] Cleared audit log for ${thingName}`);
        }
        return existed;
    }
    clearAll() {
        this.auditLogs.clear();
        console.log('[Audit] Cleared all audit logs');
    }
    getStats() {
        const entriesPerThing = {};
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
exports.AuditManager = AuditManager;
//# sourceMappingURL=AuditManager.js.map