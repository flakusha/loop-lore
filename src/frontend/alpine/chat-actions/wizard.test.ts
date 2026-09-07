import { describe, expect, test, } from "bun:test";
import { wizardActionHandlers, } from "./wizard";

interface WizardCtx {
  wizardDraft: unknown;
  wizardPreviewOpen: boolean;
  toasts: { type: string; message: string }[];
  $dispatch?: (event: string, detail?: unknown,) => void;
}

function buildCtx(): WizardCtx {
  const ctx: WizardCtx = {
    wizardDraft: null,
    wizardPreviewOpen: false,
    toasts: [],
    $dispatch: (event, detail,) => {
      if (event === "show-toast") {
        const d = detail as { type: string; message: string };
        ctx.toasts.push({ type: d.type, message: d.message, },);
      }
    },
  };
  return ctx;
}

describe("wizardActionHandlers.wizard-preview", () => {
  test("stores the draft and opens the preview", () => {
    const ctx = buildCtx();
    wizardActionHandlers["wizard-preview"]!(ctx, {
      wizardId: "w1",
      entityType: "character",
      label: "New Character",
      fields: { name: "Aria", species: undefined, },
    }, "chat-1",);
    expect(ctx.wizardDraft,).toEqual({
      wizardId: "w1",
      entityType: "character",
      label: "New Character",
      fields: { name: "Aria", species: undefined, },
    },);
    expect(ctx.wizardPreviewOpen,).toBe(true,);
  });

  test("ignores payloads missing required fields", () => {
    const ctx = buildCtx();
    wizardActionHandlers["wizard-preview"]!(ctx, { wizardId: "w1", }, "chat-1",);
    expect(ctx.wizardDraft,).toBeNull();
    expect(ctx.wizardPreviewOpen,).toBe(false,);
  });

  test("ignores null payloads", () => {
    const ctx = buildCtx();
    wizardActionHandlers["wizard-preview"]!(ctx, null, "chat-1",);
    expect(ctx.wizardDraft,).toBeNull();
  });
});

describe("wizardActionHandlers.wizard-confirm", () => {
  test("closes the preview, clears the draft and toasts", () => {
    const ctx = buildCtx();
    ctx.wizardPreviewOpen = true;
    ctx.wizardDraft = { wizardId: "w1", };
    wizardActionHandlers["wizard-confirm"]!(ctx, { wizardId: "w1", }, "chat-1",);
    expect(ctx.wizardPreviewOpen,).toBe(false,);
    expect(ctx.wizardDraft,).toBeNull();
    expect(ctx.toasts,).toHaveLength(1,);
    expect(ctx.toasts[0]!.type,).toBe("info",);
  });

  test("requires a wizardId", () => {
    const ctx = buildCtx();
    ctx.wizardPreviewOpen = true;
    wizardActionHandlers["wizard-confirm"]!(ctx, null, "chat-1",);
    wizardActionHandlers["wizard-confirm"]!(ctx, {}, "chat-1",);
    expect(ctx.wizardPreviewOpen,).toBe(true,);
    expect(ctx.toasts,).toEqual([],);
  });
});

describe("wizardActionHandlers.wizard-cancel", () => {
  test("closes the preview and discards the draft without a toast", () => {
    const ctx = buildCtx();
    ctx.wizardPreviewOpen = true;
    ctx.wizardDraft = { wizardId: "w9", };
    wizardActionHandlers["wizard-cancel"]!(ctx, { wizardId: "w9", }, "chat-1",);
    expect(ctx.wizardPreviewOpen,).toBe(false,);
    expect(ctx.wizardDraft,).toBeNull();
    expect(ctx.toasts,).toEqual([],);
  });

  test("ignores null payloads", () => {
    const ctx = buildCtx();
    ctx.wizardPreviewOpen = true;
    wizardActionHandlers["wizard-cancel"]!(ctx, null, "chat-1",);
    expect(ctx.wizardPreviewOpen,).toBe(true,);
  });
});

describe("wizardActionHandlers.create-entity-preview", () => {
  test("builds a draft keeping only string fields and defaults the kind", () => {
    const ctx = buildCtx();
    wizardActionHandlers["create-entity-preview"]!(ctx, {
      data: { name: "Aria", level: 7, bio: "Brave", },
      description: "A test entity",
      worldId: "world-1",
      warnings: ["low-mana",],
    }, "chat-1",);
    const draft = ctx.wizardDraft as Record<string, unknown>;
    expect(draft.entityType,).toBe("entity",);
    expect(draft.label,).toBe("Entity",);
    expect(draft.fields,).toEqual({ name: "Aria", bio: "Brave", },);
    expect(draft.worldId,).toBe("world-1",);
    expect(draft.description,).toBe("A test entity",);
    expect(draft.warnings,).toEqual(["low-mana",],);
    // Prefix + non-empty unique suffix (uuid source may be mocked by sibling files).
    expect(String(draft.wizardId,),).toMatch(/^preview_entity_.+$/,);
    expect(ctx.wizardPreviewOpen,).toBe(true,);
  });

  test("uses the payload kind for the entity type and label casing", () => {
    const ctx = buildCtx();
    wizardActionHandlers["create-entity-preview"]!(ctx, { kind: "item", data: {}, }, "chat-1",);
    const draft = ctx.wizardDraft as Record<string, unknown>;
    expect(draft.entityType,).toBe("item",);
    expect(draft.label,).toBe("Item",);
    expect(String(draft.wizardId,),).toMatch(/^preview_item_/,);
    expect(draft.worldId,).toBeUndefined();
    expect(draft.description,).toBeUndefined();
  });

  test("ignores null and non-object payloads", () => {
    const ctx = buildCtx();
    wizardActionHandlers["create-entity-preview"]!(ctx, null, "chat-1",);
    expect(ctx.wizardDraft,).toBeNull();
    expect(ctx.wizardPreviewOpen,).toBe(false,);
  });
});
