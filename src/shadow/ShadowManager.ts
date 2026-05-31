import {
  ShadowDocument,
  ShadowUpdateRequest,
  ShadowUpdateResponse,
  ShadowDelta,
  ShadowCallback,
  ShadowRollbackRequest,
  ShadowRollbackResponse,
  ChangeSource,
} from '../types/shadow';
import { MergeEngine } from '../engine/MergeEngine';
import { CallbackManager } from '../callbacks/CallbackManager';
import { AuditManager } from '../audit/AuditManager';
import { MqttConnector } from '../mqtt/MqttConnector';
import {
  ShadowConflictError,
  ShadowNotFoundError,
  ShadowValidationError,
} from '../errors';

const STALE_MESSAGE_THRESHOLD_MS = 30_000;

export class ShadowManager {
  private shadows: Map<string, ShadowDocument> = new Map();
  private callbackManager: CallbackManager;
  private auditManager: AuditManager;
  private mqttConnector: MqttConnector | null = null;
  private maxObservedVersions: Map<string, number> = new Map();
  private connectionEpoch: number = Date.now();

  constructor(
    callbackManager: CallbackManager,
    auditManager: AuditManager = new AuditManager()
  ) {
    this.callbackManager = callbackManager;
    this.auditManager = auditManager;
  }

  public setMqttConnector(connector: MqttConnector): void {
    this.mqttConnector = connector;
  }

  public getAuditManager(): AuditManager {
    return this.auditManager;
  }

  public onMqttReconnect(): void {
    this.connectionEpoch = Date.now();
    console.log(
      `[Shadow] MQTT reconnected, updated connectionEpoch to ${this.connectionEpoch}. ` +
      `Max observed versions preserved to prevent version regression.`
    );
  }

  public getShadow(thingName: string): ShadowDocument {
    const shadow = this.shadows.get(thingName);
    if (!shadow) {
      throw new ShadowNotFoundError(thingName);
    }
    return shadow;
  }

  public getOrCreateShadow(thingName: string): ShadowDocument {
    let shadow = this.shadows.get(thingName);
    if (!shadow) {
      shadow = MergeEngine.createEmptyDocument(thingName);
      const maxVersion = this.maxObservedVersions.get(thingName);
      if (maxVersion !== undefined && maxVersion >= shadow.version) {
        shadow.version = maxVersion + 1;
        console.log(
          `[Shadow] Restored version for thing ${thingName} from maxObservedVersion ${maxVersion}, starting at ${shadow.version}`
        );
      }
      this.shadows.set(thingName, shadow);
      console.log(`[Shadow] Created new shadow for thing ${thingName}, version ${shadow.version}`);
    }
    return shadow;
  }

  public async updateShadow(
    request: ShadowUpdateRequest
  ): Promise<ShadowUpdateResponse> {
    this.validateUpdateRequest(request);

    if (this.isStaleMessage(request)) {
      console.warn(
        `[Shadow] Rejecting stale message for thing ${request.thingName}, ` +
        `message timestamp=${request.timestamp}, connectionEpoch=${this.connectionEpoch}`
      );
      throw new ShadowValidationError(
        `Stale message rejected: message timestamp precedes current connection epoch`
      );
    }

    const { thingName, state, clientToken, version, operator, source } = request;
    const timestamp = Date.now();
    const current = this.getOrCreateShadow(thingName);
    const previousShadow = { ...current };

    if (MergeEngine.checkVersionConflict(current.version, version)) {
      const error = new ShadowConflictError(
        thingName,
        current.version,
        version!,
        clientToken
      );
      if (this.mqttConnector) {
        this.mqttConnector.publishConflict(thingName, error);
      }
      throw error;
    }

    let newReported = current.reported;
    let newReportedMetadata = current.metadata.reported;
    let newDesired = current.desired;
    let newDesiredMetadata = current.metadata.desired;
    let deltaChanged = false;

    if (state.reported) {
      const result = MergeEngine.mergeReported(
        current,
        state.reported,
        timestamp
      );
      newReported = result.state;
      newReportedMetadata = result.metadata;
      deltaChanged = true;
    }

    if (state.desired) {
      const result = MergeEngine.mergeDesired(
        current,
        state.desired,
        timestamp,
        version
      );
      newDesired = result.state;
      newDesiredMetadata = result.metadata;
      deltaChanged = true;
    }

    const newDelta = MergeEngine.calculateDelta(newReported, newDesired);
    const oldDelta = current.delta;
    const deltaStateChanged = JSON.stringify(newDelta) !== JSON.stringify(oldDelta);

    let newVersion = current.version + 1;

    const maxObserved = this.maxObservedVersions.get(thingName) || 0;
    if (newVersion <= maxObserved) {
      console.warn(
        `[Shadow] Version regression detected for thing ${thingName}: ` +
        `calculated version ${newVersion} <= maxObserved ${maxObserved}. ` +
        `Correcting to ${maxObserved + 1}`
      );
      newVersion = maxObserved + 1;
    }

    this.maxObservedVersions.set(thingName, newVersion);

    const updatedShadow: ShadowDocument = {
      thingName,
      version: newVersion,
      reported: newReported,
      desired: newDesired,
      delta: newDelta,
      metadata: {
        reported: newReportedMetadata,
        desired: newDesiredMetadata,
      },
      timestamp,
    };

    this.shadows.set(thingName, updatedShadow);
    console.log(
      `[Shadow] Updated shadow for thing ${thingName}, version ${newVersion}`
    );

    const changeSource: ChangeSource = source || (operator ? 'api' : 'mqtt');
    this.auditManager.recordUpdate(
      previousShadow,
      updatedShadow,
      state,
      changeSource,
      operator,
      clientToken
    );

    const response: ShadowUpdateResponse = {
      thingName,
      version: newVersion,
      state: {
        reported: state.reported,
        desired: state.desired,
        delta: deltaStateChanged ? newDelta : undefined,
      },
      metadata: {
        reported: state.reported ? newReportedMetadata : undefined,
        desired: state.desired ? newDesiredMetadata : undefined,
      },
      timestamp,
      clientToken,
      operator,
      source: changeSource,
    };

    if (this.mqttConnector) {
      this.mqttConnector.publishAccepted(thingName, response);
    }

    if (deltaStateChanged && Object.keys(newDelta).length > 0) {
      const deltaMessage: ShadowDelta = {
        thingName,
        version: newVersion,
        state: newDelta,
        metadata: this.extractDeltaMetadata(newDelta, newDesiredMetadata),
        timestamp,
      };

      if (this.mqttConnector) {
        this.mqttConnector.publishDelta(deltaMessage);
      }

      if (this.callbackManager.hasCallbacks(thingName)) {
        await this.callbackManager.notify(deltaMessage);
      }
    }

    return response;
  }

  public async rollbackToVersion(
    request: ShadowRollbackRequest
  ): Promise<ShadowRollbackResponse> {
    const { thingName, targetVersion, operator, reason } = request;

    const current = this.getShadow(thingName);

    if (targetVersion >= current.version) {
      throw new ShadowValidationError(
        `Target version ${targetVersion} must be less than current version ${current.version}`
      );
    }

    const snapshot = this.auditManager.getSnapshotAtVersion(thingName, targetVersion);
    if (!snapshot) {
      throw new ShadowNotFoundError(
        `No snapshot found for version ${targetVersion} of thing ${thingName}`
      );
    }

    const previousShadow = { ...current };
    const timestamp = Date.now();

    let newVersion = current.version + 1;
    const maxObserved = this.maxObservedVersions.get(thingName) || 0;
    if (newVersion <= maxObserved) {
      newVersion = maxObserved + 1;
    }
    this.maxObservedVersions.set(thingName, newVersion);

    const newDelta = MergeEngine.calculateDelta(snapshot.reported, snapshot.desired);

    const rolledBackShadow: ShadowDocument = {
      thingName,
      version: newVersion,
      reported: { ...snapshot.reported },
      desired: { ...snapshot.desired },
      delta: newDelta,
      metadata: {
        reported: {},
        desired: {},
      },
      timestamp,
    };

    this.shadows.set(thingName, rolledBackShadow);
    console.log(
      `[Shadow] Rolled back ${thingName} from v${previousShadow.version} to v${newVersion} (target v${targetVersion})`
    );

    this.auditManager.recordRollback(
      previousShadow,
      rolledBackShadow,
      targetVersion,
      operator,
      reason
    );

    if (this.mqttConnector) {
      const deltaMessage: ShadowDelta = {
        thingName,
        version: newVersion,
        state: newDelta,
        metadata: {},
        timestamp,
      };
      this.mqttConnector.publishDelta(deltaMessage);

      const updateResponse: ShadowUpdateResponse = {
        thingName,
        version: newVersion,
        state: {
          reported: snapshot.reported,
          desired: snapshot.desired,
          delta: newDelta,
        },
        metadata: {
          reported: {},
          desired: {},
        },
        timestamp,
        operator,
        source: 'rollback',
      };
      this.mqttConnector.publishAccepted(thingName, updateResponse);
    }

    if (Object.keys(newDelta).length > 0 && this.callbackManager.hasCallbacks(thingName)) {
      const deltaMessage: ShadowDelta = {
        thingName,
        version: newVersion,
        state: newDelta,
        metadata: {},
        timestamp,
      };
      await this.callbackManager.notify(deltaMessage);
    }

    return {
      thingName,
      previousVersion: previousShadow.version,
      newVersion,
      targetVersion,
      state: {
        reported: { ...rolledBackShadow.reported },
        desired: { ...rolledBackShadow.desired },
        delta: { ...rolledBackShadow.delta },
      },
      timestamp,
      operator,
      reason,
    };
  }

  private isStaleMessage(request: ShadowUpdateRequest): boolean {
    if (request.timestamp === undefined) {
      return false;
    }
    if (request.timestamp < this.connectionEpoch - STALE_MESSAGE_THRESHOLD_MS) {
      return true;
    }
    return false;
  }

  private extractDeltaMetadata(
    delta: ShadowDelta['state'],
    desiredMetadata: Record<string, { timestamp: number }>
  ): ShadowDelta['metadata'] {
    const metadata: ShadowDelta['metadata'] = {};

    const extract = (
      obj: Record<string, any>,
      path: string = ''
    ) => {
      for (const key of Object.keys(obj)) {
        const currentPath = path ? `${path}.${key}` : key;
        const value = obj[key];

        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          extract(value, currentPath);
        } else {
          if (desiredMetadata[currentPath]) {
            metadata[currentPath] = desiredMetadata[currentPath];
          }
        }
      }
    };

    extract(delta);
    return metadata;
  }

  private validateUpdateRequest(request: ShadowUpdateRequest): void {
    if (!request.thingName || typeof request.thingName !== 'string') {
      throw new ShadowValidationError('thingName is required and must be a string');
    }

    if (!request.state || typeof request.state !== 'object') {
      throw new ShadowValidationError('state is required and must be an object');
    }

    if (!request.state.reported && !request.state.desired) {
      throw new ShadowValidationError(
        'At least one of state.reported or state.desired must be provided'
      );
    }

    if (request.version !== undefined && typeof request.version !== 'number') {
      throw new ShadowValidationError('version must be a number');
    }

    if (request.version !== undefined && request.version <= 0) {
      throw new ShadowValidationError('version must be a positive number');
    }
  }

  public deleteShadow(thingName: string): boolean {
    const existed = this.shadows.has(thingName);
    if (existed) {
      this.shadows.delete(thingName);
      this.maxObservedVersions.delete(thingName);
      this.auditManager.clearAuditLog(thingName);
      console.log(`[Shadow] Deleted shadow for thing ${thingName}`);
    }
    return existed;
  }

  public listThings(): string[] {
    return Array.from(this.shadows.keys());
  }

  public registerCallback(thingName: string, callback: ShadowCallback): string {
    return this.callbackManager.register(thingName, callback);
  }

  public registerGlobalCallback(callback: ShadowCallback): string {
    return this.callbackManager.registerGlobal(callback);
  }

  public unregisterCallback(registrationId: string): boolean {
    return this.callbackManager.unregister(registrationId);
  }

  public getShadowCount(): number {
    return this.shadows.size;
  }

  public getMaxObservedVersion(thingName: string): number | undefined {
    return this.maxObservedVersions.get(thingName);
  }
}
