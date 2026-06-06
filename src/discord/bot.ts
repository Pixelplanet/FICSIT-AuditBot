/**
 * Post a summary to Discord via a logged-in bot (discord.js) to a specific
 * channel. The client is connected on demand and reused across posts.
 */
import {
  Client,
  GatewayIntentBits,
  type TextChannel,
} from 'discord.js';
import type { SummaryResult } from '../summary/format.js';
import { toDiscordEmbed } from './embed.js';

export class DiscordBot {
  private client?: Client;
  private ready?: Promise<void>;

  constructor(
    private readonly token: string,
    private readonly channelId: string,
  ) {}

  private async ensureReady(): Promise<Client> {
    if (this.client && this.ready) {
      await this.ready;
      return this.client;
    }

    const client = new Client({ intents: [GatewayIntentBits.Guilds] });
    this.client = client;
    this.ready = new Promise<void>((resolveReady, rejectReady) => {
      client.once('clientReady', () => resolveReady());
      client.once('error', rejectReady);
    });

    await client.login(this.token);
    await this.ready;
    return client;
  }

  async post(summary: SummaryResult): Promise<void> {
    const client = await this.ensureReady();
    const channel = await client.channels.fetch(this.channelId);
    if (!channel || !channel.isTextBased()) {
      throw new Error(`Discord channel ${this.channelId} is not a text channel.`);
    }
    await (channel as TextChannel).send({ embeds: [toDiscordEmbed(summary.embed)] });
  }

  async destroy(): Promise<void> {
    if (this.client) {
      await this.client.destroy();
      this.client = undefined;
      this.ready = undefined;
    }
  }
}
