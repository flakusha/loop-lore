// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Provider-wizard preset catalog — the contracts the markup and the backend
 * rely on.
 *
 * - MODEL_ROLES feeds the role picker; every id is PUT to
 *   /api/v1/admin/model-roles/:role and the backend accepts only the
 *   admin-manageable roles (VALID_ROLES in src/admin/model-roles.ts).
 * - PROVIDER_PRESETS feeds the preset picker: the ids are the option values
 *   (a duplicate id would make two options indistinguishable) and each entry
 *   needs a label, a base URL and a model to pre-fill the form.
 * - deriveProviderName produces the instance name, which the backend validates
 *   against `^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$`.
 */
import { describe, expect, test, } from "bun:test";
import { deriveProviderName, MODEL_ROLES, PROVIDER_PRESETS, } from "./presets";

/** The provider-name pattern the backend enforces. */
const PROVIDER_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/u;

describe("model roles", () => {
  test("offers exactly the admin-manageable roles", () => {
    expect([...MODEL_ROLES,],).toEqual([
      "main",
      "auxiliary",
      "captioning",
      "classifier",
      "translator",
    ],);
  });

  test("every role id is a unique lowercase token", () => {
    for (const role of MODEL_ROLES) {
      expect(role,).toMatch(/^[a-z][a-z0-9_]*$/u,);
    }

    expect(new Set(MODEL_ROLES,).size,).toBe(MODEL_ROLES.length,);
  });
});

describe("provider presets", () => {
  test("every preset carries an id, a label, a base URL and a model", () => {
    for (const preset of PROVIDER_PRESETS) {
      expect(preset.id.trim(),).not.toBe("",);
      expect(preset.label.trim(),).not.toBe("",);
      expect(preset.baseUrl,).toMatch(/^https?:\/\/\S+$/u,);
      expect(preset.model.trim(),).not.toBe("",);
    }
  });

  test("preset ids are unique", () => {
    const ids = PROVIDER_PRESETS.map((preset,) => preset.id);
    expect(new Set(ids,).size,).toBe(ids.length,);
  });

  test("the local presets point at a loopback host", () => {
    const local = PROVIDER_PRESETS.filter((preset,) => preset.baseUrl.startsWith("http://localhost",));
    expect(local.length,).toBeGreaterThan(0,);
  });
});

describe("deriveProviderName", () => {
  test("derives the instance name from the host of the base URL", () => {
    expect(deriveProviderName("https://api.openai.com/v1",),).toBe("api.openai.com",);
    expect(deriveProviderName("http://localhost:11434/v1",),).toBe("localhost-11434",);
  });

  test("the derived name always satisfies the backend name pattern", () => {
    for (
      const url of [
        "https://api.openai.com/v1",
        "https://api.together.xyz/v1",
        "http://localhost:1234/v1",
        "https://EXAMPLE.com/v1",
        "https://host.with.many.dots.example/v1",
      ]
    ) {
      expect(deriveProviderName(url,),).toMatch(PROVIDER_NAME_RE,);
    }
  });

  test("a leading symbol is dropped so the name starts alphanumeric", () => {
    const name = deriveProviderName("https://-api.example.com/v1",);
    expect(name,).toBe("api.example.com",);
    expect(name,).toMatch(PROVIDER_NAME_RE,);
  });

  test("a long host is cut to the 64 characters the backend allows", () => {
    const name = deriveProviderName(`https://${"a".repeat(80,)}.example.com/v1`,);
    expect(name.length,).toBe(64,);
    expect(name,).toMatch(PROVIDER_NAME_RE,);
  });

  test("an unusable base URL falls back to a valid name", () => {
    expect(deriveProviderName("",),).toBe("custom",);
    expect(deriveProviderName("https://",),).toBe("custom",);
  });
});
