// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Creation-wizard command-action dispatch.
 *
 * The `wizard-*` / `create-entity-preview` actions drive the creation-wizard
 * draft preview panel from response payloads. Kept apart from `dispatch.ts`
 * (the general chat-action router) so each file stays under 250L.
 */

import { browserRandomUUIDv7, } from "../../browser";
import { t, } from "../i18n";
import { log as rootLog, } from "../logger";

const log = rootLog.child({ module: "chat-actions", },);

/** */
export type ActionHandler = (
  ctx: any,
  payload: Record<string, unknown> | null,
  chatId: string,
) => Promise<void> | void;

export const wizardActionHandlers: Record<string, ActionHandler> = {
  "wizard-preview": (ctx, payload,) => {
    if (!payload) { return; }
    const wizardId = payload.wizardId as string;
    const entityType = payload.entityType as string;
    const label = payload.label as string;
    const fields = payload.fields as Record<string, string | undefined> | undefined;
    if (!wizardId || !entityType || !fields) {
      log.warn("wizard-preview: missing required payload fields", { payload, },);
      return;
    }
    // Store wizard draft in Alpine state for the preview panel
    ctx.wizardDraft = { wizardId, entityType, label, fields, };
    ctx.wizardPreviewOpen = true;
    log.info("wizard-preview: draft ready", { wizardId, entityType, },);
  },

  "wizard-confirm": (ctx, payload, _chatId,) => {
    if (!payload) { return; }
    const wizardId = payload.wizardId as string;
    if (!wizardId) { return; }
    // The confirm action sends the wizard ID; backend saves and returns create-entity
    ctx.wizardPreviewOpen = false;
    ctx.wizardDraft = null;
    ctx.$dispatch?.("show-toast", { type: "info", message: t("toasts.wizardConfirmed",), },);
  },

  "wizard-cancel": (ctx, payload,) => {
    if (!payload) { return; }
    const wizardId = payload.wizardId as string;
    ctx.wizardPreviewOpen = false;
    ctx.wizardDraft = null;
    log.info("wizard-cancel: draft discarded", { wizardId, },);
  },

  "create-entity-preview": (ctx, payload,) => {
    if (!payload || typeof payload !== "object") { return; }
    const draft = payload as {
      kind?: string;
      data?: Record<string, unknown>;
      description?: string;
      worldId?: string | null;
      userId?: string | null;
      warnings?: string[];
    };
    const kind = draft.kind ?? "entity";
    const data = draft.data ?? {};
    const fields: Record<string, string | undefined> = {};
    for (const [k, v,] of Object.entries(data,)) {
      if (typeof v === "string") { fields[k] = v; }
    }
    // UUIDv7 gives chronological ordering; the wizard id is opaque to the server.
    ctx.wizardDraft = {
      wizardId: `preview_${kind}_${browserRandomUUIDv7()}`,
      entityType: kind,
      label: kind.charAt(0,).toUpperCase() + kind.slice(1,),
      fields,
      worldId: draft.worldId ?? undefined,
      userId: draft.userId ?? undefined,
      description: draft.description,
      warnings: draft.warnings,
    };
    ctx.wizardPreviewOpen = true;
    log.info("create-entity-preview: draft ready", { kind, },);
  },
};
