// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Admin route validation schemas.
 */

import { t, } from "elysia";
import { OptionalId, } from "./primitives";

// ── Admin routes ───────────────────────────────────────────

export const ADMIN_ROLES = ["admin", "user", "viewer",] as const;

export const AdminRoleUpdateBody = t.Object({
  // Plain string + runtime check in the route: Elysia 1.4 compiles t.UnionEnum
  // with "default": <first member>, so an ABSENT role would be silently
  // replaced by "admin" instead of failing validation.
  role: t.String(),
},);
export const AdminSystemConfigBody = t.Object({
  key: t.String({ minLength: 1, },),
  value: t.String(),
  description: t.Optional(t.String(),),
},);
/**
 * Body for POST /api/admin/system-config/import — accept a YAML/TOML payload
 * produced by the matching export endpoint. `format` selects the parser;
 * `content` is the raw file text (≤1MB enforced in the route).
 */
export const AdminSystemConfigImportBody = t.Object({
  format: t.Union([t.Literal("yaml"), t.Literal("toml")],),
  content: t.String({ maxLength: 1024 * 1024, },),
});

/**
 * Body for POST /api/v1/admin/setup/providers — an operator-entered provider
 * instance. `apiKey` is optional: omitting it on an update keeps the stored
 * (sealed) key, an empty string clears it. `allowedHosts` is the operator's
 * explicit host approval; when omitted the base URL's own host is approved. Its
 * entries are bare hostnames — no scheme, path, port or userinfo.
 */
/**
 * Provider kinds the first-run wizard can materialize. Optional on the wire —
 * absent means openai-compatible, the only kind the wizard wrote before.
 * An unknown kind fails validation (400); it never silently defaults.
 */
export const ServerProviderKindSchema = t.Union(
  [t.Literal("openai-compatible"), t.Literal("anthropic"), t.Literal("ollama-native"),],
);

export const AdminSetupProviderBody = t.Object({
  name: t.String({ minLength: 1, maxLength: 64, pattern: "^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$", },),
  label: t.String({ minLength: 1, maxLength: 200, },),
  baseUrl: t.String({ minLength: 1, maxLength: 2048, },),
  model: t.String({ minLength: 1, maxLength: 200, },),
  kind: t.Optional(ServerProviderKindSchema,),
  apiKey: t.Optional(t.String({ maxLength: 4096, },),),
  allowedHosts: t.Optional(t.Array(t.String({ minLength: 1, maxLength: 253, },),),),
  setDefault: t.Optional(t.Boolean(),),
},);

/** A stored provider instance — never carries key material. */
export const AdminServerProviderDescriptor = t.Object({
  name: t.String(),
  label: t.String(),
  baseUrl: t.String(),
  model: t.String(),
  kind: t.Optional(ServerProviderKindSchema,),
  allowedHosts: t.Array(t.String()),
  hasApiKey: t.Boolean(),
  /** Whether the instance is live in the provider registry. */
  state: t.Union([t.Literal("live"), t.Literal("error"),],),
  /** Why the instance is not live — present only in the error state. */
  error: t.Optional(t.String()),
},);

/** Response body of GET /api/v1/admin/setup/providers. */
export const AdminSetupProvidersResponse = t.Object({
  providers: t.Array(AdminServerProviderDescriptor,),
  meta: t.Optional(t.Any(),),
},);

/** Response body of POST /api/v1/admin/setup/providers. */
export const AdminSetupProviderResponse = t.Object({
  ok: t.Boolean(),
  provider: AdminServerProviderDescriptor,
  meta: t.Optional(t.Any(),),
},);

// ── sd.cpp discovery / setup (admin sd-status surface) ────────

/**
 * Body for POST /api/admin/sd-status/sdcpp/setup — an operator-entered sd.cpp
 * instance. `apiKey` is optional: omitting it on an update keeps the stored
 * (sealed) key, an empty string clears it. `defaults` fields fall back to the
 * sd.cpp generation defaults when omitted.
 */
export const AdminSdCppSetupBody = t.Object({
  name: t.String({ minLength: 1, maxLength: 64, pattern: "^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$", },),
  label: t.Optional(t.String({ minLength: 1, maxLength: 200, },),),
  baseUrl: t.String({ minLength: 1, maxLength: 2048, },),
  purpose: t.Optional(t.Union([t.Literal("generate"), t.Literal("edit"), t.Literal("both")],),),
  defaults: t.Optional(t.Object({
    width: t.Optional(t.Number(),),
    height: t.Optional(t.Number(),),
    steps: t.Optional(t.Number(),),
    cfgScale: t.Optional(t.Number(),),
    sampler: t.Optional(t.String({ minLength: 1, maxLength: 100, },),),
    negativePrompt: t.Optional(t.String({ maxLength: 4000, },),),
  },),),
  apiKey: t.Optional(t.String({ maxLength: 4096, },),),
},);

/** A stored sd.cpp setup descriptor — never carries key material. */
export const AdminSdCppSetupDescriptor = t.Object({
  name: t.String(),
  label: t.String(),
  baseUrl: t.String(),
  purpose: t.Union([t.Literal("generate"), t.Literal("edit"), t.Literal("both")],),
  defaults: t.Object({
    width: t.Number(),
    height: t.Number(),
    steps: t.Number(),
    cfgScale: t.Number(),
    sampler: t.String(),
    negativePrompt: t.Optional(t.String(),),
  },),
  hasApiKey: t.Boolean(),
},);

/** Response body of POST /api/admin/sd-status/sdcpp/setup. */
export const AdminSdCppSetupResponse = t.Object({
  ok: t.Boolean(),
  provider: AdminSdCppSetupDescriptor,
  /** True — the saved instance joins the generation failover candidates
   * immediately; consumers that read only config-file providers (image-edit,
   * emotion avatars) do not consult stored setups yet. */
  generationLive: t.Boolean(),
},);

/** One probed sd.cpp instance in the discovery response. */
export const AdminSdCppDiscoveryEntry = t.Object({
  name: t.String(),
  baseUrl: t.String(),
  /** Where the candidate came from: config file, stored setup, or the
   * auto-spawned sd.cpp instance. */
  source: t.Union([t.Literal("config"), t.Literal("stored"), t.Literal("auto-start")],),
  /** Whether the generation failover path dispatches to this instance. */
  dispatching: t.Boolean(),
  reachable: t.Boolean(),
  latencyMs: t.Optional(t.Number(),),
  version: t.Optional(t.String(),),
  /** Loaded-model state from the native runtime status. */
  state: t.Optional(t.String(),),
  models: t.Optional(t.Array(t.String(),),),
  serverError: t.Optional(t.String(),),
  /** Structured skip reason when unreachable. */
  reason: t.Optional(t.String(),),
  detail: t.Optional(t.String(),),
  httpStatus: t.Optional(t.Number(),),
},);

/** Response body of GET /api/admin/sd-status/sdcpp. */
export const AdminSdCppDiscoveryResponse = t.Object({
  probedAt: t.String(),
  providers: t.Array(AdminSdCppDiscoveryEntry,),
},);

// ── ComfyUI discovery / setup (admin sd-status surface) ───────

/**
 * Body for POST /api/admin/sd-status/comfyui/setup — an operator-entered
 * ComfyUI instance. `apiKey` is optional (Bearer credential for
 * reverse-proxy-fronted engines): omitting it on an update keeps the stored
 * (sealed) key, an empty string clears it. `workflow` pins a workflow name
 * (filename without extension); `defaults` fields fall back to the ComfyUI
 * generation defaults when omitted.
 */
export const AdminComfyUISetupBody = t.Object({
  name: t.String({ minLength: 1, maxLength: 64, pattern: "^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$", },),
  label: t.Optional(t.String({ minLength: 1, maxLength: 200, },),),
  baseUrl: t.String({ minLength: 1, maxLength: 2048, },),
  purpose: t.Optional(t.Union([t.Literal("generate"), t.Literal("edit"), t.Literal("both")],),),
  workflow: t.Optional(t.String({ minLength: 1, maxLength: 200, pattern: "^[A-Za-z0-9._-]+$", },),),
  defaults: t.Optional(t.Object({
    width: t.Optional(t.Number(),),
    height: t.Optional(t.Number(),),
    steps: t.Optional(t.Number(),),
    cfgScale: t.Optional(t.Number(),),
    sampler: t.Optional(t.String({ minLength: 1, maxLength: 100, },),),
    negativePrompt: t.Optional(t.String({ maxLength: 4000, },),),
  },),),
  apiKey: t.Optional(t.String({ maxLength: 4096, },),),
},);

/** A stored ComfyUI setup descriptor — never carries key material. */
export const AdminComfyUISetupDescriptor = t.Object({
  name: t.String(),
  label: t.String(),
  baseUrl: t.String(),
  purpose: t.Union([t.Literal("generate"), t.Literal("edit"), t.Literal("both")],),
  workflow: t.Optional(t.String(),),
  defaults: t.Object({
    width: t.Number(),
    height: t.Number(),
    steps: t.Number(),
    cfgScale: t.Number(),
    sampler: t.String(),
    negativePrompt: t.Optional(t.String(),),
  },),
  hasApiKey: t.Boolean(),
},);

/** Response body of POST /api/admin/sd-status/comfyui/setup. */
export const AdminComfyUISetupResponse = t.Object({
  ok: t.Boolean(),
  provider: AdminComfyUISetupDescriptor,
  /** True — the saved instance joins the generation failover candidates
   * immediately; consumers that read only config-file providers (image-edit,
   * emotion avatars) do not consult stored setups. */
  generationLive: t.Boolean(),
},);

/** One probed ComfyUI instance in the discovery response. */
export const AdminComfyUIDiscoveryEntry = t.Object({
  name: t.String(),
  baseUrl: t.String(),
  /** Where the candidate came from: config file or stored setup. */
  source: t.Union([t.Literal("config"), t.Literal("stored")],),
  /** Whether the generation failover path dispatches to this instance. */
  dispatching: t.Boolean(),
  reachable: t.Boolean(),
  latencyMs: t.Optional(t.Number(),),
  version: t.Optional(t.String(),),
  pythonVersion: t.Optional(t.String(),),
  pytorchVersion: t.Optional(t.String(),),
  /** Advertised compute devices (name/type pairs). */
  devices: t.Optional(t.Array(t.Object({
    name: t.Optional(t.String(),),
    type: t.Optional(t.String(),),
  },),),),
  /** Structured skip reason when unreachable. */
  reason: t.Optional(t.String(),),
  detail: t.Optional(t.String(),),
  httpStatus: t.Optional(t.Number(),),
},);

/** Response body of GET /api/admin/sd-status/comfyui. */
export const AdminComfyUIDiscoveryResponse = t.Object({
  probedAt: t.String(),
  providers: t.Array(AdminComfyUIDiscoveryEntry,),
},);

export const AdminModelRoleOverrideBody = t.Object({
  provider: t.String({ minLength: 1, },),
  model: t.String({ minLength: 1, },),
  temperature: t.Optional(t.Union([t.Number(), t.Null()],),),
  maxTokens: t.Optional(t.Union([t.Number(), t.Null()],),),
},);

export const AdminChatUpdateBody = t.Object({
  status: t.Optional(t.String(),),
  is_pinned: t.Optional(t.Union([t.Literal("pinned"), t.Literal("unpinned"), t.Literal("archived"),],),),
  world_id: OptionalId,
},);
