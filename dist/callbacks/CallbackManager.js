"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CallbackManager = void 0;
const uuid_1 = require("uuid");
class CallbackManager {
    constructor() {
        this.callbacks = new Map();
        this.globalCallbacks = [];
    }
    register(thingName, callback) {
        const id = (0, uuid_1.v4)();
        const registration = { id, thingName, callback };
        if (!this.callbacks.has(thingName)) {
            this.callbacks.set(thingName, []);
        }
        this.callbacks.get(thingName).push(registration);
        console.log(`[Callback] Registered callback ${id} for thing ${thingName}`);
        return id;
    }
    registerGlobal(callback) {
        const id = (0, uuid_1.v4)();
        const registration = { id, thingName: '*', callback };
        this.globalCallbacks.push(registration);
        console.log(`[Callback] Registered global callback ${id}`);
        return id;
    }
    unregister(registrationId) {
        for (const [thingName, registrations] of this.callbacks.entries()) {
            const index = registrations.findIndex((r) => r.id === registrationId);
            if (index !== -1) {
                registrations.splice(index, 1);
                if (registrations.length === 0) {
                    this.callbacks.delete(thingName);
                }
                console.log(`[Callback] Unregistered callback ${registrationId} for thing ${thingName}`);
                return true;
            }
        }
        const globalIndex = this.globalCallbacks.findIndex((r) => r.id === registrationId);
        if (globalIndex !== -1) {
            this.globalCallbacks.splice(globalIndex, 1);
            console.log(`[Callback] Unregistered global callback ${registrationId}`);
            return true;
        }
        return false;
    }
    async notify(delta) {
        const registrations = this.callbacks.get(delta.thingName) || [];
        const allRegistrations = [...registrations, ...this.globalCallbacks];
        if (allRegistrations.length === 0) {
            return;
        }
        console.log(`[Callback] Notifying ${allRegistrations.length} callbacks for thing ${delta.thingName}`);
        const promises = allRegistrations.map(async (registration) => {
            try {
                await registration.callback(delta);
            }
            catch (err) {
                console.error(`[Callback] Error in callback ${registration.id} for thing ${delta.thingName}:`, err);
            }
        });
        await Promise.allSettled(promises);
    }
    getCallbacks(thingName) {
        return this.callbacks.get(thingName) || [];
    }
    getGlobalCallbacks() {
        return this.globalCallbacks;
    }
    clearAll() {
        this.callbacks.clear();
        this.globalCallbacks = [];
        console.log('[Callback] All callbacks cleared');
    }
    hasCallbacks(thingName) {
        return ((this.callbacks.get(thingName)?.length || 0) > 0 ||
            this.globalCallbacks.length > 0);
    }
}
exports.CallbackManager = CallbackManager;
//# sourceMappingURL=CallbackManager.js.map