/**
 * Application entry point. Loads layered config, restores state, starts the
 * runtime (processes the current canonical save and watches for changes), and
 * — when enabled — serves the configuration + preview web UI.
 */
import { ConfigManager, hasDiscordDelivery, type AppConfig } from './config.js';
import { createRuntime, type Runtime } from './runtime.js';
import { startWebServer, type WebServerHandle } from './web/server.js';

async function main(): Promise<void> {
  const configManager = new ConfigManager();
  await configManager.load();
  const config = configManager.get();
  logStartup(config);

  const runtime = createRuntime(configManager);
  await runtime.store.load();

  let web: WebServerHandle | undefined;
  if (config.webEnabled) {
    web = await startWebServer(configManager, runtime);
  } else {
    console.log('[web] Web UI disabled (WEB_ENABLED=false).');
  }

  await runtime.start();

  await setupShutdown(runtime, web);
}

function logStartup(config: AppConfig): void {
  console.log('Satisfactory Save Summary Bot');
  console.log(`  Saves dir:       ${config.savesDir}`);
  console.log(`  Canonical:       *${config.canonicalSaveSuffix}`);
  console.log(`  State dir:       ${config.stateDir}`);
  console.log(`  Post to Discord: ${config.postToDiscord}`);
  console.log(`  Web UI:          ${config.webEnabled ? `port ${config.webPort}` : 'disabled'}`);
  if (config.postToDiscord && !hasDiscordDelivery(config)) {
    console.warn(
      '  ⚠️  POST_TO_DISCORD is true but no webhook/bot is configured. ' +
        'Summaries will only show in the preview/console.',
    );
  }
}

async function setupShutdown(runtime: Runtime, web: WebServerHandle | undefined): Promise<void> {
  return new Promise<void>((resolveShutdown) => {
    const shutdown = async (signal: string) => {
      console.log(`\n[shutdown] Received ${signal}, cleaning up …`);
      await web?.close().catch(() => undefined);
      await runtime.shutdown().catch(() => undefined);
      resolveShutdown();
      process.exit(0);
    };
    process.on('SIGINT', () => void shutdown('SIGINT'));
    process.on('SIGTERM', () => void shutdown('SIGTERM'));
  });
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
