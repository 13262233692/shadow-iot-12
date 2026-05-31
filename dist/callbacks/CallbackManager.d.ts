import { ShadowDelta, ShadowCallback } from '../types/shadow';
interface CallbackRegistration {
    id: string;
    thingName: string;
    callback: ShadowCallback;
}
export declare class CallbackManager {
    private callbacks;
    private globalCallbacks;
    register(thingName: string, callback: ShadowCallback): string;
    registerGlobal(callback: ShadowCallback): string;
    unregister(registrationId: string): boolean;
    notify(delta: ShadowDelta): Promise<void>;
    getCallbacks(thingName: string): CallbackRegistration[];
    getGlobalCallbacks(): CallbackRegistration[];
    clearAll(): void;
    hasCallbacks(thingName: string): boolean;
}
export {};
