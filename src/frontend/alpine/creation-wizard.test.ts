import "./i18n.test-helper";
import { afterEach, describe, expect, mock, test, } from "bun:test";
import { creationWizard, } from "./creation-wizard";

let fetchCalls: { url: string; opts: RequestInit }[] = [];
let fetchHandler: ((url: string, opts: RequestInit,) => Response) | null = null;

mock.module("./htmx", () => ({
  apiFetch: async (url: string, opts?: RequestInit,) => {
    fetchCalls.push({ url, opts: opts ?? {}, },);
    if (!fetchHandler) { return new Response("{}", { status: 200, },); }
    return fetchHandler(url, opts ?? {},);
  },
}),);

function mockFetch(status: number, body: unknown = {},) {
  fetchHandler = (_url, _opts,) => Response.json(body, { status, },);
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
    loadMessages: mock(async () => {}),
    wizardResetSteps() {
      ctx.wizardStep = 1;
    },
    toasts,
  };
  return { ctx, toasts, };
}

describe("creationWizard.confirmWizard", () => {
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
  },);

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
    expect(toasts.some((t,) => t.type === "success",),).toBe(true,);
  },);
});

describe("creationWizard.cancelWizard", () => {
  test("clears draft regardless of wizardId argument", async () => {
    const { ctx, } = buildCtx();
    ctx.wizardDraft = {
      wizardId: "wiz-A",
      entityType: "character",
      label: "Char",
      fields: { name: "Alice", },
    };
    ctx.wizardPreviewOpen = true;

    await creationWizard.cancelWizard!.call(ctx as never, "wiz-A",);

    expect(ctx.wizardDraft,).toBeNull();
    expect(ctx.wizardPreviewOpen,).toBe(false,);
  },);
});
