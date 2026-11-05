// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/integrations/loop-lore-facade/index.ts — the facade module barrel.

export * from "./audit";
export * from "./authz";
export { type ChatFacadeDeps, FacadeListMessagesBody, FacadeSendMessageBody, registerChatOps, } from "./ops/chat";
export { type GenerationFacadeDeps, registerGenerationOps, } from "./ops/generation";
export * from "./rate-limit";
export * from "./registry";
export * from "./types";
