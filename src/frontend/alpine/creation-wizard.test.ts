import "./i18n.test-helper";
import { afterEach, expect, mock, test, } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { describeOrSkip, ISOLATED, } from "../../test-utils/isolate-only";
import { creationWizard, } from "./creation-wizard";

let fetchCalls: { url: string; opts: RequestInit }[] = [];
let fetchHandler: ((url: string, opts: RequestInit,) => Response) | null = null;

if (ISOLATED) {
  mock.module("./htmx", () => ({
    apiFetch: async (url: string, opts?: RequestInit,) => {
      fetchCalls.push({ url, opts: opts ?? {}, },);
      if (!fetchHandler) { return new Response("{}", { status: 200, },); }
      return fetchHandler(url, opts ?? {},);
    },
  }),);
}

/**
 * @param status
 * @param body
 */
function mockFetch(status: number, body: unknown = {},) {
  fetchHandler = (_url, _opts,) => Response.json(body, { status, },);
}

/** */
function mockFetchNetworkError() {
  fetchHandler = () => {
    throw new Error("network",);
  };
}

afterEach(() => {
  fetchCalls = [];
  fetchHandler = null;
},);

/** Minimal Alpine context for testing the creation wizard slice in isolation. */
function buildCtx(): { ctx: Record<string, unknown>; toasts: { type: string; message: string }[] } {
  const toasts: { type: string; message: string }[] = [];
  const ctx: Record<string, unknown> = {
    wizardDraft: null,
    wizardPreviewOpen: false,
    wizardStep: 1,
    wizardTotalSteps: 3,
    activeChat: "chat-1",
    messages: [],
    $dispatch(event: string, detail: Record<string, unknown>,) {
      if (event === "show-toast") {
        toasts.push({ type: detail.type as string, message: detail.message as string, },);
      }
    },
    loadMessages: mock(async () => {},),
    wizardResetSteps() {
      ctx.wizardStep = 1;
    },
    toasts,
  };

  return { ctx, toasts, };
}

describeOrSkip("creationWizard.confirmWizard", () => {
  test("rejects when wizardId does not match the current draft (cross-talk guard)", async () => {
    const { ctx, toasts, } = buildCtx();
    ctx.wizardDraft = {
      wizardId: "wiz-current",
      entityType: "character",
      label: "Char",
      fields: { name: "Alice", },
    };

    ctx.wizardPreviewOpen = true;

    await creationWizard.confirmWizard!.call(ctx as never, "wiz-stale",);

    // No fetch issued — stale wizardId must not trigger create-entity.
    expect(fetchCalls.length,).toBe(0,);
    // Draft is preserved — the active wizard is unchanged.
    expect((ctx.wizardDraft as { wizardId?: string } | null)?.wizardId,).toBe("wiz-current",);
    expect(ctx.wizardPreviewOpen,).toBe(true,);
    expect(toasts.length,).toBe(0,);
  });

  test("confirms when wizardId matches the current draft", async () => {
    mockFetch(200,);
    const { ctx, toasts, } = buildCtx();
    ctx.wizardDraft = {
      wizardId: "wiz-A",
      entityType: "character",
      label: "Char",
      fields: { name: "Alice", },
    };

    ctx.wizardPreviewOpen = true;

    await creationWizard.confirmWizard!.call(ctx as never, "wiz-A",);

    expect(fetchCalls.length,).toBe(1,);
    expect(ctx.wizardDraft,).toBeNull();
    expect(ctx.wizardPreviewOpen,).toBe(false,);
    expect(ctx.wizardStep,).toBe(1,);
    expect(toasts.some((t,) => t.type === "success"),).toBe(true,);
  });
},);

describeOrSkip("creationWizard.cancelWizard", () => {
  test("clears draft regardless of wizardId argument", async () => {
    const { ctx, } = buildCtx();
    ctx.wizardDraft = {
      wizardId: "wiz-A",
      entityType: "character",
      label: "Char",
      fields: { name: "Alice", },
    };

    ctx.wizardPreviewOpen = true;

    await creationWizard.cancelWizard!.call(ctx as never,);

    expect(ctx.wizardDraft,).toBeNull();
    expect(ctx.wizardPreviewOpen,).toBe(false,);
  });
},);

// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Regression: creation-wizard.cancelWizard must not take a wizardId
 * parameter (BUG-character-creation-wizard-bug-wizardid-unused). The
 * unused-parameter signature (`cancelWizard(_wizardId: string)`) was
 * always ignored; the canonical fix is to drop the parameter and have
 * callers call `cancelWizard()` with no argument.
 */

describeOrSkip("creation-wizard.cancelWizard signature", () => {
  test("impl no longer takes a wizardId parameter", () => {
    const src = fs.readFileSync(
      path.join(import.meta.dir, "creation-wizard.ts",),
      "utf8",
    );

    expect(src,).toMatch(/async cancelWizard\(\):\s*Promise<void>/,);
    expect(src,).not.toMatch(/async cancelWizard\(_wizardId: string/,);
  });

  test("interface declares no-arg cancelWizard", () => {
    const src = fs.readFileSync(
      path.join(
        import.meta.dir,
        "chat-types",
        "wizard-state.ts",
      ),
      "utf8",
    );

    expect(src,).toMatch(/cancelWizard\(\):\s*Promise<void>/,);
    expect(src,).not.toMatch(/cancelWizard\(wizardId: string/,);
  });

  test("wizard-panel.html callers pass no argument", () => {
    const src = fs.readFileSync(
      path.join(
        import.meta.dir,
        "..",
        "..",
        "components",
        "chat",
        "wizard-panel.html",
      ),
      "utf8",
    );

    expect(src,).toContain('@click="cancelWizard()"',);
    expect(src,).not.toContain("cancelWizard(wizardDraft",);
  });

  test("ticket reference is captured in the impl", () => {
    const src = fs.readFileSync(
      path.join(import.meta.dir, "creation-wizard.ts",),
      "utf8",
    );

    expect(src,).toContain("BUG-character-creation-wizard-bug-wizardid-unused",);
  });
},);

describeOrSkip("creation-wizard — step navigation", () => {
  test("wizardNextStep advances and clamps at the last step", () => {
    const { ctx, } = buildCtx();
    ctx.wizardStep = 1;
    creationWizard.wizardNextStep!.call(ctx as never,);
    expect(ctx.wizardStep,).toBe(2,);
    ctx.wizardStep = 3;
    creationWizard.wizardNextStep!.call(ctx as never,);
    expect(ctx.wizardStep,).toBe(3,);
  });

  test("wizardPrevStep goes back and clamps at the first step", () => {
    const { ctx, } = buildCtx();
    ctx.wizardStep = 2;
    creationWizard.wizardPrevStep!.call(ctx as never,);
    expect(ctx.wizardStep,).toBe(1,);
    ctx.wizardStep = 1;
    creationWizard.wizardPrevStep!.call(ctx as never,);
    expect(ctx.wizardStep,).toBe(1,);
  });

  test("wizardResetSteps returns to the first step", () => {
    const { ctx, } = buildCtx();
    ctx.wizardStep = 3;
    creationWizard.wizardResetSteps!.call(ctx as never,);
    expect(ctx.wizardStep,).toBe(1,);
  });
},);

describeOrSkip("creation-wizard — updateWizardField", () => {
  test("updates a field on the draft", () => {
    const { ctx, } = buildCtx();
    ctx.wizardDraft = { wizardId: "wiz-A", fields: { name: "Alice", }, };
    creationWizard.updateWizardField!.call(ctx as never, "name", "Bob",);
    expect((ctx.wizardDraft as { fields: Record<string, string> }).fields.name,).toBe("Bob",);
  });

  test("no-ops without a draft", () => {
    const { ctx, } = buildCtx();
    ctx.wizardDraft = null;
    creationWizard.updateWizardField!.call(ctx as never, "name", "Bob",);
    expect(ctx.wizardDraft,).toBeNull();
  });
},);

describeOrSkip("creation-wizard — confirmWizard guards and errors", () => {
  test("no-ops without an active chat", async () => {
    const { ctx, } = buildCtx();
    ctx.wizardDraft = { wizardId: "wiz-A", fields: {}, };
    ctx.activeChat = null;
    await creationWizard.confirmWizard!.call(ctx as never, "wiz-A",);
    expect(fetchCalls,).toEqual([],);
  });

  test("surfaces the server error message on non-ok", async () => {
    mockFetch(422, { error: "bad data", },);
    const { ctx, toasts, } = buildCtx();
    ctx.wizardDraft = { wizardId: "wiz-A", fields: { name: "Bob", }, };
    await creationWizard.confirmWizard!.call(ctx as never, "wiz-A",);
    expect(toasts[0]?.type,).toBe("error",);
    expect(toasts[0]?.message,).toBe("bad data",);
  });

  test("shows a network error toast when the request throws", async () => {
    mockFetchNetworkError();
    const { ctx, toasts, } = buildCtx();
    ctx.wizardDraft = { wizardId: "wiz-A", fields: { name: "Bob", }, };
    await creationWizard.confirmWizard!.call(ctx as never, "wiz-A",);
    expect(toasts[0]?.type,).toBe("error",);
    expect(toasts[0]?.message,).toBe("Network error — could not create entity",);
  });
},);
