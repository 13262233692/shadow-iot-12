import { ShadowState, ShadowMetadata, ShadowDocument } from '../types/shadow';
import { ShadowConflictError } from '../errors';

export class MergeEngine {
  public static mergeReported(
    current: ShadowDocument,
    reported: ShadowState,
    timestamp: number
  ): { state: ShadowState; metadata: ShadowMetadata } {
    const mergedState = this.deepMerge(current.reported, reported);
    const mergedMetadata = this.updateMetadata(
      current.metadata.reported,
      reported,
      timestamp
    );
    return { state: mergedState, metadata: mergedMetadata };
  }

  public static mergeDesired(
    current: ShadowDocument,
    desired: ShadowState,
    timestamp: number,
    expectedVersion?: number
  ): { state: ShadowState; metadata: ShadowMetadata } {
    if (expectedVersion !== undefined && expectedVersion !== current.version) {
      throw new ShadowConflictError(
        current.thingName,
        current.version,
        expectedVersion
      );
    }

    const mergedState = this.deepMerge(current.desired, desired);
    const mergedMetadata = this.updateMetadata(
      current.metadata.desired,
      desired,
      timestamp
    );
    return { state: mergedState, metadata: mergedMetadata };
  }

  public static calculateDelta(
    reported: ShadowState,
    desired: ShadowState
  ): ShadowState {
    const delta: ShadowState = {};
    this.calculateDeltaRecursive(reported, desired, delta);
    return delta;
  }

  private static calculateDeltaRecursive(
    reported: ShadowState,
    desired: ShadowState,
    delta: ShadowState,
    path: string = ''
  ): void {
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

      if (
        typeof desiredValue === 'object' &&
        desiredValue !== null &&
        !Array.isArray(desiredValue)
      ) {
        if (
          typeof reportedValue === 'object' &&
          reportedValue !== null &&
          !Array.isArray(reportedValue)
        ) {
          this.calculateDeltaRecursive(
            reportedValue,
            desiredValue,
            delta,
            currentPath
          );
        } else {
          this.setNestedValue(delta, currentPath, desiredValue);
        }
      } else {
        if (JSON.stringify(desiredValue) !== JSON.stringify(reportedValue)) {
          this.setNestedValue(delta, currentPath, desiredValue);
        }
      }
    }
  }

  private static setNestedValue(
    obj: ShadowState,
    path: string,
    value: any
  ): void {
    const keys = path.split('.');
    let current = obj;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!current[key] || typeof current[key] !== 'object') {
        current[key] = {};
      }
      current = current[key] as ShadowState;
    }

    current[keys[keys.length - 1]] = value;
  }

  private static deepMerge(
    target: ShadowState,
    source: ShadowState
  ): ShadowState {
    const result = { ...target };

    for (const key of Object.keys(source)) {
      const sourceValue = source[key];

      if (sourceValue === null) {
        delete result[key];
        continue;
      }

      if (
        typeof sourceValue === 'object' &&
        !Array.isArray(sourceValue) &&
        sourceValue !== null
      ) {
        if (
          typeof result[key] === 'object' &&
          !Array.isArray(result[key]) &&
          result[key] !== null
        ) {
          result[key] = this.deepMerge(result[key] as ShadowState, sourceValue);
        } else {
          result[key] = { ...sourceValue };
        }
      } else {
        result[key] = sourceValue;
      }
    }

    return result;
  }

  private static updateMetadata(
    currentMetadata: ShadowMetadata,
    updates: ShadowState,
    timestamp: number
  ): ShadowMetadata {
    const metadata = { ...currentMetadata };
    this.updateMetadataRecursive(metadata, updates, timestamp);
    return metadata;
  }

  private static updateMetadataRecursive(
    metadata: ShadowMetadata,
    updates: ShadowState,
    timestamp: number,
    path: string = ''
  ): void {
    for (const key of Object.keys(updates)) {
      const value = updates[key];
      const currentPath = path ? `${path}.${key}` : key;

      if (
        typeof value === 'object' &&
        !Array.isArray(value) &&
        value !== null
      ) {
        this.updateMetadataRecursive(metadata, value, timestamp, currentPath);
      } else {
        metadata[currentPath] = { timestamp };
      }
    }
  }

  public static checkVersionConflict(
    currentVersion: number,
    requestedVersion?: number
  ): boolean {
    if (requestedVersion === undefined) {
      return false;
    }
    return requestedVersion !== currentVersion;
  }

  public static createEmptyDocument(thingName: string): ShadowDocument {
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
