/**
 * Dispatch a summary to all configured Discord delivery methods (webhook and/or
 * bot). Failures in one method do not prevent the others from being attempted.
 */
import type { AppConfig } from '../config.js';
import type { SummaryResult } from '../summary/format.js';
import { postViaWebhook } from './webhook.js';
import { DiscordBot } from './bot.js';

export class DiscordDispatcher {
  private bot?: DiscordBot;

  constructor(private readonly config: AppConfig) {
    const { botToken, channelId } = config.discord;
    if (botToken && channelId) {
      this.bot = new DiscordBot(botToken, channelId);
    }
  }

  /** Returns true if at least one delivery succeeded. */
  async dispatch(summary: SummaryResult): Promise<boolean> {
    const tasks: Promise<void>[] = [];
    const { webhookUrl } = this.config.discord;

    if (webhookUrl) {
      tasks.push(postViaWebhook(webhookUrl, summary));
    }
    if (this.bot) {
      tasks.push(this.bot.post(summary));
    }

    if (tasks.length === 0) return false;

    const results = await Promise.allSettled(tasks);
    let anySuccess = false;
    for (const result of results) {
      if (result.status === 'fulfilled') {
        anySuccess = true;
      } else {
        console.error('[discord] delivery failed:', result.reason);
      }
    }
    return anySuccess;
  }

  async shutdown(): Promise<void> {
    await this.bot?.destroy();
  }
}
