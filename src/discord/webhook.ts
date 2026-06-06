/**
 * Post a summary to Discord via an incoming webhook URL. Uses the global
 * `fetch` available in Node 18+. No extra dependency required.
 */
import type { SummaryResult } from '../summary/format.js';
import { toDiscordEmbed } from './embed.js';

export async function postViaWebhook(
  webhookUrl: string,
  summary: SummaryResult,
): Promise<void> {
  const body = {
    // Keep content short; the embed carries the detail.
    content: '',
    embeds: [toDiscordEmbed(summary.embed)],
  };

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Webhook POST failed: ${response.status} ${response.statusText} ${text}`);
  }
}
