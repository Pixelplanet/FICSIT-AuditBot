/**
 * Post a summary to Discord via an incoming webhook URL. Uses the global
 * `fetch` available in Node 18+. No extra dependency required.
 */
import type { SummaryResult } from '../summary/format.js';
import { toDiscordEmbed, type DiscordImageAttachment } from './embed.js';

export async function postViaWebhook(
  webhookUrl: string,
  summary: SummaryResult,
  image?: DiscordImageAttachment,
): Promise<void> {
  const embed = toDiscordEmbed(summary.embed);
  if (image) {
    embed.image = { url: `attachment://${image.filename}` };
  }

  if (!image) {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: '', embeds: [embed] }),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Webhook POST failed: ${response.status} ${response.statusText} ${text}`);
    }
    return;
  }

  // Multipart upload so the embed can reference the attached image.
  const form = new FormData();
  form.append('payload_json', JSON.stringify({ content: '', embeds: [embed] }));
  form.append('files[0]', new Blob([image.buffer], { type: 'image/png' }), image.filename);

  const response = await fetch(webhookUrl, { method: 'POST', body: form });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Webhook POST failed: ${response.status} ${response.statusText} ${text}`);
  }
}
