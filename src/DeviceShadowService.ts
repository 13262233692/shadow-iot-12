import { CallbackManager } from './callbacks/CallbackManager';
import { MqttConnector } from './mqtt/MqttConnector';
import { ShadowManager } from './shadow/ShadowManager';
import { ShadowApi } from './api/ShadowApi';
import { AuditManager } from './audit/AuditManager';
import { ServiceConfig, ShadowUpdateRequest } from './types/shadow';

export class DeviceShadowService {
  private config: ServiceConfig;
  private callbackManager: CallbackManager;
  private auditManager: AuditManager;
  private mqttConnector: MqttConnector;
  private shadowManager: ShadowManager;
  private shadowApi: ShadowApi;
  private started: boolean = false;

  constructor(config: ServiceConfig) {
    this.config = config;
    this.callbackManager = new CallbackManager();
    this.auditManager = new AuditManager();
    this.mqttConnector = new MqttConnector(config.mqtt);
    this.shadowManager = new ShadowManager(this.callbackManager, this.auditManager);
    this.shadowApi = new ShadowApi(this.shadowManager);
  }

  public async start(): Promise<void> {
    if (this.started) {
      console.log('[Service] Already started');
      return;
    }

    console.log('[Service] Starting Device Shadow Service...');

    this.setupMqttEventHandlers();
    this.shadowManager.setMqttConnector(this.mqttConnector);

    try {
      await this.mqttConnector.connect();
    } catch (err) {
      const error = err as Error;
      console.warn('[Service] MQTT connection failed, continuing without MQTT:', error.message);
    }

    await this.shadowApi.listen(this.config.api.port, this.config.api.host);

    this.started = true;
    console.log('[Service] Device Shadow Service started successfully');
  }

  private setupMqttEventHandlers(): void {
    this.mqttConnector.on(
      'update',
      async (data: { thingName: string; request: ShadowUpdateRequest }) => {
        try {
          await this.shadowManager.updateShadow(data.request);
        } catch (err) {
          console.error('[Service] Error processing MQTT update:', err);
        }
      }
    );

    this.mqttConnector.on(
      'get',
      (data: { thingName: string; clientToken?: string }) => {
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
        } catch (err) {
          const error = err as Error;
          console.error('[Service] Error processing MQTT get:', error);
          this.mqttConnector.publishRejected(data.thingName, {
            code: 'NotFound',
            message: error.message,
            clientToken: data.clientToken,
          });
        }
      }
    );

    this.mqttConnector.on('connected', () => {
      console.log('[Service] MQTT connector connected (first connection)');
    });

    this.mqttConnector.on('reconnected', () => {
      console.log('[Service] MQTT connector reconnected - syncing shadow state');
      this.shadowManager.onMqttReconnect();
    });

    this.mqttConnector.on('error', (err: Error) => {
      console.error('[Service] MQTT connector error:', err);
    });
  }

  public async stop(): Promise<void> {
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

  public getAuditManager(): AuditManager {
    return this.auditManager;
  }

  public getShadowManager(): ShadowManager {
    return this.shadowManager;
  }

  public getMqttConnector(): MqttConnector {
    return this.mqttConnector;
  }

  public getCallbackManager(): CallbackManager {
    return this.callbackManager;
  }

  public getApi(): ShadowApi {
    return this.shadowApi;
  }

  public isStarted(): boolean {
    return this.started;
  }
}
