/**
 * Convert our internal {@link SummaryEmbed} into the JSON embed shape accepted
 * by both the Discord REST webhook API and discord.js.
 */
import type { SummaryEmbed } from '../summary/format.js';

const MAX_FIELD_VALUE = 1024;
const MAX_FIELDS = 25;

export interface DiscordEmbedJson {
  title: string;
  description: string;
  color: number;
  fields: { name: string; value: string; inline?: boolean }[];
  timestamp?: string;
}

export function toDiscordEmbed(embed: SummaryEmbed): DiscordEmbedJson {
  return {
    title: truncate(embed.title, 256),
    description: truncate(embed.description, 4096),
    color: embed.color,
    fields: embed.fields.slice(0, MAX_FIELDS).map((f) => ({
      name: truncate(f.name, 256),
      value: truncate(f.value, MAX_FIELD_VALUE),
      inline: f.inline,
    })),
    timestamp: embed.timestamp,
  };
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + '…';
}
