// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema/integrations.ts — external integrations config types

/** Email (IMAP/SMTP) integration. Unconfigured = empty strings. */
export interface IntegrationEmailConfig {
  /** Enable the email adapter. Default false. */
  enabled: boolean;
  /** IMAP host. Empty = unconfigured. */
  imapHost: string;
  /** IMAP port. Default 993 (implicit TLS). */
  imapPort: number;
  /** IMAP username. */
  imapUser: string;
  /** IMAP password. Env-only: EMAIL_IMAP_PASS. */
  imapPass: string;
  /** SMTP host. Empty = unconfigured. */
  smtpHost: string;
  /** SMTP port. Default 587 (STARTTLS). */
  smtpPort: number;
  /** SMTP username. */
  smtpUser: string;
  /** SMTP password. Env-only: EMAIL_SMTP_PASS. */
  smtpPass: string;
  /** Opportunistic PGP encryption for outbound email. Default false. */
  pgpEnabled: boolean;
}

/** Matrix adapter config (client or appservice mode). */
export interface IntegrationMatrixConfig {
  /** Enable the Matrix adapter. Default false. */
  enabled: boolean;
  /** Homeserver base URL. Empty = unconfigured. */
  homeserver: string;
  /** Access token. Env-only: MATRIX_ACCESS_TOKEN. */
  accessToken: string;
  /** Run as appservice instead of a plain client. Default false. */
  appservice: boolean;
}

/** XMPP adapter config. */
export interface IntegrationXmppConfig {
  /** Enable the XMPP adapter. Default false. */
  enabled: boolean;
  /** Bare JID to connect as. */
  jid: string;
  /** Account password. Env-only: XMPP_PASSWORD. */
  password: string;
}

/** Telegram bot adapter config. */
export interface IntegrationTelegramConfig {
  /** Enable the Telegram adapter. Default false. */
  enabled: boolean;
  /** Bot API token from @BotFather. Env-only: TELEGRAM_BOT_TOKEN. */
  botToken: string;
}

/** Discord bot adapter config. */
export interface IntegrationDiscordConfig {
  /** Enable the Discord adapter. Default false. */
  enabled: boolean;
  /** Bot token. Env-only: DISCORD_BOT_TOKEN. */
  botToken: string;
}

/** IRC adapter config. */
export interface IntegrationIrcConfig {
  /** Enable the IRC adapter. Default false. */
  enabled: boolean;
  /** IRC server host (optionally host:port). */
  server: string;
  /** Nickname to use. */
  nick: string;
  /** Optional SASL password. Env-only: IRC_PASSWORD. */
  password: string;
}

/** Nostr relay config. */
export interface IntegrationNostrConfig {
  /** Enable the Nostr adapter. Default false. */
  enabled: boolean;
  /** Relay WebSocket URLs to connect to. Default empty. */
  relayUrls: string[];
}

/** External integrations master config. Everything off by default (opt-in). */
export interface IntegrationsConfig {
  /** Master switch — no adapter loads unless this is true. Default false. */
  enabled: boolean;
  /** Email (IMAP/SMTP) family. */
  email: IntegrationEmailConfig;
  /** Matrix family. */
  matrix: IntegrationMatrixConfig;
  /** XMPP family. */
  xmpp: IntegrationXmppConfig;
  /** Telegram family. */
  telegram: IntegrationTelegramConfig;
  /** Discord family. */
  discord: IntegrationDiscordConfig;
  /** IRC family. */
  irc: IntegrationIrcConfig;
  /** Nostr family. */
  nostr: IntegrationNostrConfig;
}
