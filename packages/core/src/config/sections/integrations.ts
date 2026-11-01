// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/sections/integrations.ts — Integrations config section

import type { IntegrationsConfig, } from "../schema";

export const INTEGRATIONS_DEFAULTS = {
  enabled: false,
  email: {
    enabled: false,
    imapHost: "",
    imapPort: 993,
    imapUser: "",
    imapPass: "",
    smtpHost: "",
    smtpPort: 587,
    smtpUser: "",
    smtpPass: "",
    pgpEnabled: false,
  },
  matrix: {
    enabled: false,
    homeserver: "",
    accessToken: "",
    appservice: false,
  },
  xmpp: {
    enabled: false,
    jid: "",
    password: "",
  },
  telegram: {
    enabled: false,
    botToken: "",
  },
  discord: {
    enabled: false,
    botToken: "",
  },
  irc: {
    enabled: false,
    server: "",
    nick: "",
    password: "",
  },
  nostr: {
    enabled: false,
    relayUrls: [],
  },
} satisfies IntegrationsConfig;

export type IntegrationsSection = IntegrationsConfig;
export const integrationsMeta = {
  type: "object" as const,
  description: "External integrations (email, Matrix, XMPP, Telegram, Discord, IRC, Nostr)",
  sensitive: [
    "email.imapPass",
    "email.smtpPass",
    "matrix.accessToken",
    "xmpp.password",
    "telegram.botToken",
    "discord.botToken",
    "irc.password",
  ] as const,
  properties: {
    enabled: {
      type: "boolean",
      default: INTEGRATIONS_DEFAULTS.enabled,
      description: "Master switch. No adapter loads unless this is true.",
    },
    email: {
      type: "object",
      description: "Email (IMAP/SMTP) integration. Opt-in; disabled by default.",
      properties: {
        enabled: { type: "boolean", default: INTEGRATIONS_DEFAULTS.email.enabled, },
        imapHost: { type: "string", default: INTEGRATIONS_DEFAULTS.email.imapHost, },
        imapPort: { type: "integer", default: INTEGRATIONS_DEFAULTS.email.imapPort, },
        imapUser: { type: "string", default: INTEGRATIONS_DEFAULTS.email.imapUser, },
        imapPass: {
          type: "string",
          default: INTEGRATIONS_DEFAULTS.email.imapPass,
          description: "IMAP password. Env-only: EMAIL_IMAP_PASS. SECRET — never log or echo.",
        },
        smtpHost: { type: "string", default: INTEGRATIONS_DEFAULTS.email.smtpHost, },
        smtpPort: { type: "integer", default: INTEGRATIONS_DEFAULTS.email.smtpPort, },
        smtpUser: { type: "string", default: INTEGRATIONS_DEFAULTS.email.smtpUser, },
        smtpPass: {
          type: "string",
          default: INTEGRATIONS_DEFAULTS.email.smtpPass,
          description: "SMTP password. Env-only: EMAIL_SMTP_PASS. SECRET — never log or echo.",
        },
        pgpEnabled: { type: "boolean", default: INTEGRATIONS_DEFAULTS.email.pgpEnabled, },
      },
      required: [
        "enabled",
        "imapHost",
        "imapPort",
        "imapUser",
        "imapPass",
        "smtpHost",
        "smtpPort",
        "smtpUser",
        "smtpPass",
        "pgpEnabled",
      ] as const,
    },
    matrix: {
      type: "object",
      description: "Matrix integration (client or appservice). Opt-in; disabled by default.",
      properties: {
        enabled: { type: "boolean", default: INTEGRATIONS_DEFAULTS.matrix.enabled, },
        homeserver: { type: "string", default: INTEGRATIONS_DEFAULTS.matrix.homeserver, },
        accessToken: {
          type: "string",
          default: INTEGRATIONS_DEFAULTS.matrix.accessToken,
          description: "Matrix access token. Env-only: MATRIX_ACCESS_TOKEN. SECRET — never log or echo.",
        },
        appservice: { type: "boolean", default: INTEGRATIONS_DEFAULTS.matrix.appservice, },
      },
      required: ["enabled", "homeserver", "accessToken", "appservice",] as const,
    },
    xmpp: {
      type: "object",
      description: "XMPP integration. Opt-in; disabled by default.",
      properties: {
        enabled: { type: "boolean", default: INTEGRATIONS_DEFAULTS.xmpp.enabled, },
        jid: { type: "string", default: INTEGRATIONS_DEFAULTS.xmpp.jid, },
        password: {
          type: "string",
          default: INTEGRATIONS_DEFAULTS.xmpp.password,
          description: "XMPP password. Env-only: XMPP_PASSWORD. SECRET — never log or echo.",
        },
      },
      required: ["enabled", "jid", "password",] as const,
    },
    telegram: {
      type: "object",
      description: "Telegram bot integration. Opt-in; disabled by default.",
      properties: {
        enabled: { type: "boolean", default: INTEGRATIONS_DEFAULTS.telegram.enabled, },
        botToken: {
          type: "string",
          default: INTEGRATIONS_DEFAULTS.telegram.botToken,
          description: "Telegram bot token. Env-only: TELEGRAM_BOT_TOKEN. SECRET — never log or echo.",
        },
      },
      required: ["enabled", "botToken",] as const,
    },
    discord: {
      type: "object",
      description: "Discord bot integration. Opt-in; disabled by default.",
      properties: {
        enabled: { type: "boolean", default: INTEGRATIONS_DEFAULTS.discord.enabled, },
        botToken: {
          type: "string",
          default: INTEGRATIONS_DEFAULTS.discord.botToken,
          description: "Discord bot token. Env-only: DISCORD_BOT_TOKEN. SECRET — never log or echo.",
        },
      },
      required: ["enabled", "botToken",] as const,
    },
    irc: {
      type: "object",
      description: "IRC integration. Opt-in; disabled by default.",
      properties: {
        enabled: { type: "boolean", default: INTEGRATIONS_DEFAULTS.irc.enabled, },
        server: { type: "string", default: INTEGRATIONS_DEFAULTS.irc.server, },
        nick: { type: "string", default: INTEGRATIONS_DEFAULTS.irc.nick, },
        password: {
          type: "string",
          default: INTEGRATIONS_DEFAULTS.irc.password,
          description: "Optional SASL password. Env-only: IRC_PASSWORD. SECRET — never log or echo.",
        },
      },
      required: ["enabled", "server", "nick", "password",] as const,
    },
    nostr: {
      type: "object",
      description: "Nostr integration. Opt-in; disabled by default.",
      properties: {
        enabled: { type: "boolean", default: INTEGRATIONS_DEFAULTS.nostr.enabled, },
        relayUrls: {
          type: "array",
          items: { type: "string", },
          default: INTEGRATIONS_DEFAULTS.nostr.relayUrls,
        },
      },
      required: ["enabled", "relayUrls",] as const,
    },
  },
  required: [
    "enabled",
    "email",
    "matrix",
    "xmpp",
    "telegram",
    "discord",
    "irc",
    "nostr",
  ] as const,
};
