"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
exports.config = {
    mqtt: {
        brokerUrl: process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883',
        username: process.env.MQTT_USERNAME,
        password: process.env.MQTT_PASSWORD,
        topicPrefix: process.env.MQTT_TOPIC_PREFIX || '$aws/things',
    },
    api: {
        port: parseInt(process.env.API_PORT || '3000', 10),
        host: process.env.API_HOST || '0.0.0.0',
    },
};
//# sourceMappingURL=index.js.map