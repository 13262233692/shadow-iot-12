import mqtt, { MqttClient } from 'mqtt';
import { EventEmitter } from 'events';
import {
  MqttConfig,
  ShadowUpdateRequest,
  ShadowUpdateResponse,
  ShadowDelta,
} from '../types/shadow';
import { ShadowConflictError } from '../errors';
import { v4 as uuidv4 } from 'uuid';

export interface MqttConnectorEvents {
  (event: 'update', data: { thingName: string; request: ShadowUpdateRequest }): void;
  (event: 'get', data: { thingName: string; clientToken?: string }): void;
  (event: 'connected'): void;
  (event: 'reconnected'): void;
  (event: 'error', error: Error): void;
}

const DEDUP_WINDOW_MS = 60_000;
const MAX_DEDUP_ENTRIES = 10000;

export class MqttConnector extends EventEmitter {
  private client: MqttClient | null = null;
  private config: MqttConfig;
  private isFirstConnection: boolean = true;
  private processedClientTokens: Map<string, number> = new Map();

  constructor(config: MqttConfig) {
    super();
    this.config = config;
  }

  public connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const options: mqtt.IClientOptions = {
        clientId: `shadow-service-${uuidv4()}`,
        clean: true,
      };

      if (this.config.username) {
        options.username = this.config.username;
      }
      if (this.config.password) {
        options.password = this.config.password;
      }

      this.client = mqtt.connect(this.config.brokerUrl, options);

      this.client.on('connect', () => {
        console.log('[MQTT] Connected to broker:', this.config.brokerUrl);
        this.subscribeToTopics().then(() => {
          if (this.isFirstConnection) {
            this.isFirstConnection = false;
            this.emit('connected');
          } else {
            console.log('[MQTT] Reconnected - emitting reconnected event');
            this.emit('reconnected');
          }
          resolve();
        });
      });

      this.client.on('error', (err) => {
        console.error('[MQTT] Connection error:', err);
        this.emit('error', err);
        reject(err);
      });

      this.client.on('message', (topic, message) => {
        this.handleMessage(topic, message.toString());
      });

      this.client.on('close', () => {
        console.warn('[MQTT] Connection closed');
      });

      this.client.on('reconnect', () => {
        console.log('[MQTT] Reconnecting...');
      });
    });
  }

  private async subscribeToTopics(): Promise<void> {
    if (!this.client) return;

    const prefix = this.config.topicPrefix || '$aws/things';
    const topics = [
      `${prefix}/+/shadow/update`,
      `${prefix}/+/shadow/get`,
    ];

    return new Promise((resolve, reject) => {
      this.client!.subscribe(topics, { qos: 1 }, (err) => {
        if (err) {
          console.error('[MQTT] Failed to subscribe:', err);
          reject(err);
        } else {
          console.log('[MQTT] Subscribed to topics:', topics);
          resolve();
        }
      });
    });
  }

  private handleMessage(topic: string, payload: string): void {
    const prefix = this.config.topicPrefix || '$aws/things';
    const updateRegex = new RegExp(`^${prefix}\\/([^/]+)\\/shadow\\/update$`);
    const getRegex = new RegExp(`^${prefix}\\/([^/]+)\\/shadow\\/get$`);

    let match = topic.match(updateRegex);
    if (match) {
      const thingName = match[1];
      this.handleUpdate(thingName, payload);
      return;
    }

    match = topic.match(getRegex);
    if (match) {
      const thingName = match[1];
      this.handleGet(thingName, payload);
      return;
    }
  }

  private handleUpdate(thingName: string, payload: string): void {
    try {
      const request: ShadowUpdateRequest = JSON.parse(payload);
      request.thingName = thingName;

      if (request.clientToken && this.isDuplicateClientToken(request.clientToken)) {
        console.warn(
          `[MQTT] Duplicate clientToken ${request.clientToken} for thing ${thingName}, ignoring`
        );
        return;
      }

      if (request.timestamp === undefined) {
        request.timestamp = Date.now();
      }

      if (request.source === undefined) {
        request.source = 'mqtt';
      }

      this.emit('update', { thingName, request });
    } catch (err) {
      console.error('[MQTT] Invalid JSON payload for update:', payload);
      this.publishRejected(thingName, {
        code: 'InvalidJson',
        message: 'Invalid JSON payload',
      });
    }
  }

  private handleGet(thingName: string, payload: string): void {
    try {
      const data = payload ? JSON.parse(payload) : {};
      this.emit('get', { thingName, clientToken: data.clientToken });
    } catch (err) {
      console.error('[MQTT] Invalid JSON payload for get:', payload);
    }
  }

  private isDuplicateClientToken(clientToken: string): boolean {
    const now = Date.now();
    const lastSeen = this.processedClientTokens.get(clientToken);
    if (lastSeen !== undefined && now - lastSeen < DEDUP_WINDOW_MS) {
      return true;
    }

    this.processedClientTokens.set(clientToken, now);
    this.evictExpiredTokens(now);

    return false;
  }

  private evictExpiredTokens(now: number): void {
    if (this.processedClientTokens.size < MAX_DEDUP_ENTRIES) {
      return;
    }

    for (const [token, timestamp] of this.processedClientTokens) {
      if (now - timestamp > DEDUP_WINDOW_MS) {
        this.processedClientTokens.delete(token);
      }
    }

    if (this.processedClientTokens.size >= MAX_DEDUP_ENTRIES) {
      const oldest = Array.from(this.processedClientTokens.entries())
        .sort((a, b) => a[1] - b[1]);
      const toRemove = oldest.slice(0, oldest.length - MAX_DEDUP_ENTRIES / 2);
      for (const [token] of toRemove) {
        this.processedClientTokens.delete(token);
      }
    }
  }

  public publishAccepted(
    thingName: string,
    response: ShadowUpdateResponse
  ): void {
    if (!this.client) return;

    const prefix = this.config.topicPrefix || '$aws/things';
    const topic = `${prefix}/${thingName}/shadow/update/accepted`;

    this.client.publish(topic, JSON.stringify(response), { qos: 1 });
  }

  public publishRejected(
    thingName: string,
    error: { code: string; message: string; clientToken?: string }
  ): void {
    if (!this.client) return;

    const prefix = this.config.topicPrefix || '$aws/things';
    const topic = `${prefix}/${thingName}/shadow/update/rejected`;

    this.client.publish(topic, JSON.stringify(error), { qos: 1 });
  }

  public publishDelta(delta: ShadowDelta): void {
    if (!this.client) return;

    const prefix = this.config.topicPrefix || '$aws/things';
    const topic = `${prefix}/${delta.thingName}/shadow/update/delta`;

    this.client.publish(topic, JSON.stringify(delta), { qos: 1 });
  }

  public publishGetAccepted(
    thingName: string,
    response: ShadowUpdateResponse & { version: number }
  ): void {
    if (!this.client) return;

    const prefix = this.config.topicPrefix || '$aws/things';
    const topic = `${prefix}/${thingName}/shadow/get/accepted`;

    this.client.publish(topic, JSON.stringify(response), { qos: 1 });
  }

  public publishConflict(thingName: string, error: ShadowConflictError): void {
    this.publishRejected(thingName, error.toJSON());
  }

  public disconnect(): Promise<void> {
    return new Promise((resolve) => {
      if (this.client) {
        this.client.end(false, {}, () => {
          console.log('[MQTT] Disconnected');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  public isConnected(): boolean {
    return this.client?.connected ?? false;
  }
}
