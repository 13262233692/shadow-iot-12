"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = exports.DeviceShadowService = void 0;
const DeviceShadowService_1 = require("./DeviceShadowService");
Object.defineProperty(exports, "DeviceShadowService", { enumerable: true, get: function () { return DeviceShadowService_1.DeviceShadowService; } });
const config_1 = require("./config");
async function main() {
    const service = new DeviceShadowService_1.DeviceShadowService(config_1.config);
    service.getShadowManager().registerGlobalCallback((delta) => {
        console.log(`[Global Callback] Delta for ${delta.thingName}:`, JSON.stringify(delta.state));
    });
    await service.start();
    process.on('SIGINT', async () => {
        console.log('\n[Main] Received SIGINT, shutting down...');
        await service.stop();
        process.exit(0);
    });
    process.on('SIGTERM', async () => {
        console.log('\n[Main] Received SIGTERM, shutting down...');
        await service.stop();
        process.exit(0);
    });
}
main().catch((err) => {
    console.error('[Main] Failed to start service:', err);
    process.exit(1);
});
__exportStar(require("./types/shadow"), exports);
__exportStar(require("./errors"), exports);
var config_2 = require("./config");
Object.defineProperty(exports, "config", { enumerable: true, get: function () { return config_2.config; } });
//# sourceMappingURL=index.js.map