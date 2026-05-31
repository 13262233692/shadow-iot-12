import { ShadowDelta, ShadowCallback } from '../types/shadow';
import { v4 as uuidv4 } from 'uuid';

interface CallbackRegistration {
  id: string;
  thingName: string;
  callback: ShadowCallback;
}

export class CallbackManager {
  private callbacks: Map<string, CallbackRegistration[]> = new Map();
  private globalCallbacks: CallbackRegistration[] = [];

  public register(
    thingName: string,
    callback: ShadowCallback
  ): string {
    const id = uuidv4();
    const registration: CallbackRegistration = { id, thingName, callback };

    if (!this.callbacks.has(thingName)) {
      this.callbacks.set(thingName, []);
    }
    this.callbacks.get(thingName)!.push(registration);

    console.log(`[Callback] Registered callback ${id} for thing ${thingName}`);
    return id;
  }

  public registerGlobal(callback: ShadowCallback): string {
    const id = uuidv4();
    const registration: CallbackRegistration = { id, thingName: '*', callback };
    this.globalCallbacks.push(registration);

    console.log(`[Callback] Registered global callback ${id}`);
    return id;
  }

  public unregister(registrationId: string): boolean {
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

    const globalIndex = this.globalCallbacks.findIndex(
      (r) => r.id === registrationId
    );
    if (globalIndex !== -1) {
      this.globalCallbacks.splice(globalIndex, 1);
      console.log(`[Callback] Unregistered global callback ${registrationId}`);
      return true;
    }

    return false;
  }

  public async notify(delta: ShadowDelta): Promise<void> {
    const registrations = this.callbacks.get(delta.thingName) || [];
    const allRegistrations = [...registrations, ...this.globalCallbacks];

    if (allRegistrations.length === 0) {
      return;
    }

    console.log(
      `[Callback] Notifying ${allRegistrations.length} callbacks for thing ${delta.thingName}`
    );

    const promises = allRegistrations.map(async (registration) => {
      try {
        await registration.callback(delta);
      } catch (err) {
        console.error(
          `[Callback] Error in callback ${registration.id} for thing ${delta.thingName}:`,
          err
        );
      }
    });

    await Promise.allSettled(promises);
  }

  public getCallbacks(thingName: string): CallbackRegistration[] {
    return this.callbacks.get(thingName) || [];
  }

  public getGlobalCallbacks(): CallbackRegistration[] {
    return this.globalCallbacks;
  }

  public clearAll(): void {
    this.callbacks.clear();
    this.globalCallbacks = [];
    console.log('[Callback] All callbacks cleared');
  }

  public hasCallbacks(thingName: string): boolean {
    return (
      (this.callbacks.get(thingName)?.length || 0) > 0 ||
      this.globalCallbacks.length > 0
    );
  }
}
