import { DeviceShadowService } from './DeviceShadowService';
import { config } from './config';
import { ShadowDelta } from './types/shadow';

async function main(): Promise<void> {
  const service = new DeviceShadowService(config);

  service.getShadowManager().registerGlobalCallback((delta: ShadowDelta) => {
    console.log(
      `[Global Callback] Delta for ${delta.thingName}:`,
      JSON.stringify(delta.state)
    );
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

export { DeviceShadowService };
export * from './types/shadow';
export * from './errors';
export { config } from './config';
