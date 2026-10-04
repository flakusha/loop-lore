// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/sections/integrations.test.ts — integrations section: all-off
// defaults, sensitive marking, env override wiring.

import { beforeAll, describe, expect, test, } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import { createLogger, } from "../../logger";
import { loadConfig, } from "../load";
import { INTEGRATIONS_DEFAULTS, integrationsMeta, } from "./integrations";

beforeAll(() => {
  createLogger({ level: "error", },);
},);

const SENSITIVE_PATHS = [
  "email.imapPass",
  "email.smtpPass",
  "matrix.accessToken",
  "xmpp.password",
  "telegram.botToken",
  "discord.botToken",
  "irc.password",
] as const;

describe("INTEGRATIONS_DEFAULTS", () => {
  test("master switch and every family default to disabled", () => {
    expect(INTEGRATIONS_DEFAULTS.enabled,).toBe(false,);
    expect(INTEGRATIONS_DEFAULTS.email.enabled,).toBe(false,);
    expect(INTEGRATIONS_DEFAULTS.matrix.enabled,).toBe(false,);
    expect(INTEGRATIONS_DEFAULTS.xmpp.enabled,).toBe(false,);
    expect(INTEGRATIONS_DEFAULTS.telegram.enabled,).toBe(false,);
    expect(INTEGRATIONS_DEFAULTS.discord.enabled,).toBe(false,);
    expect(INTEGRATIONS_DEFAULTS.irc.enabled,).toBe(false,);
    expect(INTEGRATIONS_DEFAULTS.nostr.enabled,).toBe(false,);
  });

  test("email ports default to 993 (IMAP) and 587 (SMTP)", () => {
    expect(INTEGRATIONS_DEFAULTS.email.imapPort,).toBe(993,);
    expect(INTEGRATIONS_DEFAULTS.email.smtpPort,).toBe(587,);
  });

  test("unconfigured families are empty strings / empty relay list", () => {
    expect(INTEGRATIONS_DEFAULTS.email.imapHost,).toBe("",);
    expect(INTEGRATIONS_DEFAULTS.matrix.homeserver,).toBe("",);
    expect(INTEGRATIONS_DEFAULTS.xmpp.jid,).toBe("",);
    expect(INTEGRATIONS_DEFAULTS.irc.server,).toBe("",);
    expect(INTEGRATIONS_DEFAULTS.nostr.relayUrls,).toEqual([],);
  });
});

describe("integrationsMeta.sensitive", () => {
  test("marks exactly the seven secret fields", () => {
    expect([...integrationsMeta.sensitive,].sort(),).toEqual(
      [...SENSITIVE_PATHS,].sort(),
    );
  });

  test("every sensitive property is documented as SECRET in the schema meta", () => {
    for (const path of SENSITIVE_PATHS) {
      const [family, field,] = path.split(".",);
      const familyMeta = integrationsMeta.properties[family as keyof typeof integrationsMeta.properties];
      expect(familyMeta,).toBeDefined();
      const { properties, } = familyMeta as { properties: Record<string, { description?: string }> };
      expect(properties[field as string]?.description ?? "",).toContain("SECRET",);
    }
  });
});

describe("integrations config loading", () => {
  test("zero [integrations] block in config file yields all-disabled defaults", () => {
    const dir = mkdtempSync(join(tmpdir(), "integrations-defaults-",),);
    try {
      writeFileSync(join(dir, "config.toml",), "[server]\nport = 3100\n",);
      const config = loadConfig(dir,);
      expect(config.integrations,).toEqual(INTEGRATIONS_DEFAULTS,);
    } finally {
      rmSync(dir, { recursive: true, force: true, },);
    }
  });

  test("TELEGRAM_BOT_TOKEN env var overrides the file value", () => {
    const dir = mkdtempSync(join(tmpdir(), "integrations-env-",),);
    const original = process.env.TELEGRAM_BOT_TOKEN;
    try {
      writeFileSync(
        join(dir, "config.toml",),
        '[integrations.telegram]\nenabled = true\nbotToken = "from-file"\n',
      );

      process.env.TELEGRAM_BOT_TOKEN = "from-env";
      const config = loadConfig(dir,);
      expect(config.integrations.telegram.botToken,).toBe("from-env",);
      expect(config.integrations.telegram.enabled,).toBe(true,);
    } finally {
      if (original === undefined) { delete process.env.TELEGRAM_BOT_TOKEN; }
      else { process.env.TELEGRAM_BOT_TOKEN = original; }

      rmSync(dir, { recursive: true, force: true, },);
    }
  });
});
