// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * env-scrub tests: loop-lore's own secrets are dropped before a harness child
 * spawns, third-party keys survive, and on-disk secret basenames are refused.
 *
 * Resource contract (parallel-safe): pure — no subprocess, no ports, no
 * filesystem, no module state.
 */
import { describe, expect, it, } from "bun:test";
import { isSecretBasename, scrubEnv, } from "./env-scrub";

describe("scrubEnv", () => {
  it("removes loop-lore secrets but keeps a third-party API key", () => {
    const input: NodeJS.ProcessEnv = {
      NSFW_PII_SECRET: "nsfw",
      TELEMETRY_PII_SECRET: "telemetry",
      SERVER_ENCRYPTION_KEY: "smk",
      ASSETS_SIGNED_URL_SECRET: "signed",
      ANTHROPIC_API_KEY: "third-party",
      PATH: "/usr/bin",
    };

    const safe = scrubEnv(input,);

    expect(safe.NSFW_PII_SECRET,).toBeUndefined();
    expect(safe.TELEMETRY_PII_SECRET,).toBeUndefined();
    expect(safe.SERVER_ENCRYPTION_KEY,).toBeUndefined();
    expect(safe.ASSETS_SIGNED_URL_SECRET,).toBeUndefined();
    expect(safe.ANTHROPIC_API_KEY,).toBe("third-party",);
    expect(safe.PATH,).toBe("/usr/bin",);
    expect(input.NSFW_PII_SECRET,).toBe("nsfw",);
  });

  it("keeps keys it does not know", () => {
    expect(scrubEnv({ CUSTOM_FLAG: "1", },),).toEqual({ CUSTOM_FLAG: "1", },);
  });
});

describe("isSecretBasename", () => {
  it("matches secret basenames case-insensitively", () => {
    for (
      const name of [
        "env.yaml",
        "ENV.YAML",
        "configs/env.toml",
        ".credentials.env",
        ".env.local",
        "config.local.json",
        "certs/tls.PEM",
        "private.key",
        "id.p12",
        "C:\\keys\\server.KEY",
      ]
    ) {
      expect(isSecretBasename(name,),).toBe(true,);
    }
  });

  it("allows ordinary file basenames", () => {
    for (const name of ["notes.md", "config.yaml", "environment", "keyboard.txt", "README",]) {
      expect(isSecretBasename(name,),).toBe(false,);
    }
  });
});
