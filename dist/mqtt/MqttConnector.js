"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MqttConnector = void 0;
const mqtt_1 = __importDefault(require("mqtt"));
const events_1 = require("events");
const uuid_1 = require("uuid");
const DEDUP_WINDOW_MS = 60000;
const MAX_DEDUP_ENTRIES = 10000;
class MqttConnector extends events_1.EventEmitter {
    constructor(config) {
        super();
        this.client = null;
        this.isFirstConnection = true;
        this.processedClientTokens = new Map();
        this.config = config;
    }
    connect() {
        return new Promise((resolve, reject) => {
            const options = {
                clientId: `shadow-service-${(0, uuid_1.v4)()}`,
                clean: true,
            };
            if (this.config.username) {
                options.username = this.config.username;
            }
            if (this.config.password) {
                options.password = this.config.password;
            }
            this.client = mqtt_1.default.connect(this.config.brokerUrl, options);
            this.client.on('connect', () => {
                console.log('[MQTT] Connected to broker:', this.config.brokerUrl);
                this.subscribeToTopics().then(() => {
                    if (this.isFirstConnection) {
                        this.isFirstConnection = false;
                        this.emit('connected');
                    }
                    else {
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
    async subscribeToTopics() {
        if (!this.client)
            return;
        const prefix = this.config.topicPrefix || '$aws/things';
        const topics = [
            `${prefix}/+/shadow/update`,
            `${prefix}/+/shadow/get`,
        ];
        return new Promise((resolve, reject) => {
            this.client.subscribe(topics, { qos: 1 }, (err) => {
                if (err) {
                    console.error('[MQTT] Failed to subscribe:', err);
                    reject(err);
                }
                else {
                    console.log('[MQTT] Subscribed to topics:', topics);
                    resolve();
                }
            });
        });
    }
    handleMessage(topic, payload) {
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
    handleUpdate(thingName, payload) {
        try {
            const request = JSON.parse(payload);
            request.thingName = thingName;
            if (request.clientToken && this.isDuplicateClientToken(request.clientToken)) {
                console.warn(`[MQTT] Duplicate clientToken ${request.clientToken} for thing ${thingName}, ignoring`);
                return;
            }
            if (request.timestamp === undefined) {
                request.timestamp = Date.now();
            }
            if (request.source === undefined) {
                request.source = 'mqtt';
            }
            this.emit('update', { thingName, request });
        }
        catch (err) {
            console.error('[MQTT] Invalid JSON payload for update:', payload);
            this.publishRejected(thingName, {
                code: 'InvalidJson',
                message: 'Invalid JSON payload',
            });
        }
    }
    handleGet(thingName, payload) {
        try {
            const data = payload ? JSON.parse(payload) : {};
            this.emit('get', { thingName, clientToken: data.clientToken });
        }
        catch (err) {
            console.error('[MQTT] Invalid JSON payload for get:', payload);
        }
    }
    isDuplicateClientToken(clientToken) {
        const now = Date.now();
        const lastSeen = this.processedClientTokens.get(clientToken);
        if (lastSeen !== undefined && now - lastSeen < DEDUP_WINDOW_MS) {
            return true;
        }
        this.processedClientTokens.set(clientToken, now);
        this.evictExpiredTokens(now);
        return false;
    }
    evictExpiredTokens(now) {
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
    publishAccepted(thingName, response) {
        if (!this.client)
            return;
        const prefix = this.config.topicPrefix || '$aws/things';
        const topic = `${prefix}/${thingName}/shadow/update/accepted`;
        this.client.publish(topic, JSON.stringify(response), { qos: 1 });
    }
    publishRejected(thingName, error) {
        if (!this.client)
            return;
        const prefix = this.config.topicPrefix || '$aws/things';
        const topic = `${prefix}/${thingName}/shadow/update/rejected`;
        this.client.publish(topic, JSON.stringify(error), { qos: 1 });
    }
    publishDelta(delta) {
        if (!this.client)
            return;
        const prefix = this.config.topicPrefix || '$aws/things';
        const topic = `${prefix}/${delta.thingName}/shadow/update/delta`;
        this.client.publish(topic, JSON.stringify(delta), { qos: 1 });
    }
    publishGetAccepted(thingName, response) {
        if (!this.client)
            return;
        const prefix = this.config.topicPrefix || '$aws/things';
        const topic = `${prefix}/${thingName}/shadow/get/accepted`;
        this.client.publish(topic, JSON.stringify(response), { qos: 1 });
    }
    publishConflict(thingName, error) {
        this.publishRejected(thingName, error.toJSON());
    }
    disconnect() {
        return new Promise((resolve) => {
            if (this.client) {
                this.client.end(false, {}, () => {
                    console.log('[MQTT] Disconnected');
                    resolve();
                });
            }
            else {
                resolve();
            }
        });
    }
    isConnected() {
        return this.client?.connected ?? false;
    }
}
exports.MqttConnector = MqttConnector;
//# sourceMappingURL=MqttConnector.js.map