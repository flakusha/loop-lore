// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * ComfyUI model discovery — role-based model names from the `/models` folder
 * registry and, when available, loader COMBO options in `/object_info` (both
 * are populated from ComfyUI's `folder_paths`). Operators pin names in
 * `configs/config.generation.toml`; admins and users can override the
 * selection from the settings frontends. The same substrate serves video and
 * image providers.
 */
import { COMFYUI_MODEL_EXTENSIONS, isComfyUIModelName, } from "@loop-lore/core/config/schema/providers";
import { getLogger, } from "../../logger/index";

/** Model slots shared by ComfyUI video and image workflows. */
export type ComfyUIModelRole = keyof typeof COMFYUI_MODEL_EXTENSIONS;

export const COMFYUI_MODEL_ROLES = [
  "clip",
  "diffusion",
  "vae",
  "checkpoint",
  "clip_vision",
  "loras",
] as const;

/** Legacy folder aliases, used only when the registry has no exact role key. */
export const COMFYUI_MODEL_FOLDERS: Record<ComfyUIModelRole, readonly string[]> = {
  clip: ["clip", "clip_gguf", "text_encoders",],
  diffusion: ["diffusion_models", "unet", "unet_gguf",],
  vae: ["vae",],
  checkpoint: ["checkpoints",],
  clip_vision: ["clip_vision",],
  loras: ["loras",],
};

export { COMFYUI_MODEL_EXTENSIONS, };

export interface ComfyUIModelCandidates {
  clip: string[];
  diffusion: string[];
  vae: string[];
  checkpoint: string[];
  clip_vision: string[];
  loras: string[];
}

/** Model selection overrides: config file, system_config, or users.settings. */
export interface ComfyUIModelOverrides {
  clip?: string;
  diffusion?: string;
  vae?: string;
  checkpoint?: string;
  clip_vision?: string;
  loras?: string;
  noVae?: boolean;
}

export type ComfyUIModelSource = "user" | "admin" | "config" | "discovery" | "none";

export interface ComfyUIModelRoleView {
  candidates: string[];
  selected: string | null;
  source: ComfyUIModelSource;
}

export interface ComfyUIModelView extends ComfyUIModelCandidates {
  noVae: boolean;
  clipRole: ComfyUIModelRoleView;
  diffusionRole: ComfyUIModelRoleView;
  vaeRole: ComfyUIModelRoleView;
  checkpointRole: ComfyUIModelRoleView;
  clipVisionRole: ComfyUIModelRoleView;
  lorasRole: ComfyUIModelRoleView;
}

/** Minimal node shape read from /object_info (no dependency on the HTTP client). */
export interface ComfyUIObjectInfoNode {
  input?: { required?: Record<string, unknown>; optional?: Record<string, unknown> };
}

/** Minimal client surface needed by discovery (no dependency on the HTTP client). */
export interface ComfyUIModelClient {
  listModelFolders(): Promise<string[]>;
  listModelFolder(folder: string,): Promise<string[]>;
  /** Optional live /object_info snapshot; its COMBO options outrank aliases. */
  getNodeInfo?(): Promise<Readonly<Record<string, ComfyUIObjectInfoNode>>>;
}

/**
 * Loader inputs whose COMBO options are populated from the `folder_paths`
 * registry. Loader class names are discovery hints only — never capability
 * flags and never used to rewrite graphs.
 */
const MODEL_LOADER_INPUTS: Readonly<Record<ComfyUIModelRole, readonly { node: string; input: string }[]>> = {
  clip: [{ node: "CLIPLoader", input: "clip_name", }, { node: "CLIPLoaderGGUF", input: "clip_name", },],
  diffusion: [{ node: "UNETLoader", input: "unet_name", }, { node: "UNETLoaderGGUF", input: "unet_name", },],
  vae: [{ node: "VAELoader", input: "vae_name", },],
  checkpoint: [{ node: "CheckpointLoaderSimple", input: "ckpt_name", },],
  clip_vision: [{ node: "CLIPVisionLoader", input: "clip_name", },],
  loras: [{ node: "LoraLoader", input: "lora_name", }, { node: "LoraLoaderModelOnly", input: "lora_name", },],
};

/** @param raw - one COMBO input value from /object_info
 * @returns option names in the legacy, bare or v3 dict COMBO shape */
function comboOptions(raw: unknown,): string[] {
  if (!Array.isArray(raw,)) { return []; }
  // Legacy /object_info encodes a COMBO as [[name, ...], {}].
  if (Array.isArray(raw[0],)) {
    return (raw[0] as unknown[]).filter((name,): name is string => typeof name === "string");
  }

  if (raw[0] !== "COMBO") { return []; }
  const options: unknown = raw[1];
  const list = Array.isArray(options,)
    ? options
    : options !== null && typeof options === "object"
    ? (options as { options?: unknown }).options
    : undefined;

  return Array.isArray(list,)
    ? list.filter((name,): name is string => typeof name === "string")
    : [];
}

/** @param info - /object_info snapshot
 * @param role - model slot
 * @returns file names advertised by the loader COMBO options */
function registryOptions(
  info: Readonly<Record<string, ComfyUIObjectInfoNode>>,
  role: ComfyUIModelRole,
): string[] {
  const names: string[] = [];
  for (const hint of MODEL_LOADER_INPUTS[role]) {
    const inputs = info[hint.node]?.input;
    const raw = inputs?.required?.[hint.input] ?? inputs?.optional?.[hint.input];
    names.push(...comboOptions(raw,),);
  }

  return names;
}

/** @param role - model slot
 * @param name - candidate file name
 * @returns whether the file extension fits the role */
export const hasComfyUIModelExtension = isComfyUIModelName;

/**
 * @param role - model slot
 * @param name - configured file name
 * @throws {Error} When the extension is not allowed for the role
 */
export function assertComfyUIModelName(role: ComfyUIModelRole, name: string,): void {
  if (typeof name !== "string" || !hasComfyUIModelExtension(role, name,)) {
    throw new Error(
      `Invalid ComfyUI ${role} model "${String(name,)}" — expected ${COMFYUI_MODEL_EXTENSIONS[role].join(", ",)}`,
    );
  }
}

/** @param role - model slot
 * @param names - raw names from one or more folders
 * @returns sorted, deduplicated names with valid extensions */
export function filterComfyUIModelNames(role: ComfyUIModelRole, names: readonly string[],): string[] {
  return [...new Set(names.filter((name,) => typeof name === "string" && hasComfyUIModelExtension(role, name,)),),]
    .sort();
}

/**
 * @param client - ComfyUI model-folder client
 * @param available - folder keys advertised by /models
 * @param role - model slot
 * @returns names from the exact registry key, else its legacy aliases
 */
async function listRoleFolders(
  client: ComfyUIModelClient,
  available: ReadonlySet<string>,
  role: ComfyUIModelRole,
): Promise<string[]> {
  const names: string[] = [];
  const toTry = available.has(role,) ? [role,] : COMFYUI_MODEL_FOLDERS[role];
  for (const folder of toTry) {
    if (!available.has(folder,)) { continue; }
    try {
      names.push(...await client.listModelFolder(folder,),);
    } catch (error) {
      getLogger().child({ module: "comfyui-model-discovery", },).warn(
        "ComfyUI model folder unavailable",
        { folder, error: (error as Error).message, },
      );
    }
  }

  return names;
}

/**
 * Discover model names from the ComfyUI `/models` registry, or from loader
 * COMBO options in `/object_info` when that snapshot is available. Options
 * come straight from `folder_paths` and win over legacy folder aliases;
 * aliases are only used when the live options are absent or empty. Missing
 * folders and failing requests are skipped with a warning.
 * @param client - ComfyUI model-folder client
 * @returns candidates keyed by role
 */
export async function discoverComfyUIModels(client: ComfyUIModelClient,): Promise<ComfyUIModelCandidates> {
  const folders = await client.listModelFolders();
  if (!Array.isArray(folders,)) {
    throw new Error("ComfyUI /models did not return a folder list",);
  }

  const available = new Set(folders,);
  let info: Readonly<Record<string, ComfyUIObjectInfoNode>> | undefined;
  if (client.getNodeInfo) {
    try {
      info = await client.getNodeInfo();
    } catch (error) {
      getLogger().child({ module: "comfyui-model-discovery", },).warn(
        "ComfyUI object_info unavailable — using folder aliases",
        { error: (error as Error).message, },
      );
    }
  }

  const discovered = {} as Record<ComfyUIModelRole, string[]>;
  for (const role of COMFYUI_MODEL_ROLES) {
    const names: string[] = info === undefined ? [] : registryOptions(info, role,);
    if (names.length === 0) { names.push(...await listRoleFolders(client, available, role,),); }
    discovered[role] = filterComfyUIModelNames(role, names,);
  }

  return discovered;
}

/**
 * Merge discovered names with pinned selections. Precedence: user → admin →
 * config → first discovered name. A user name no longer present on the engine
 * is ignored; admin/config pins are trusted (they may name a model a proxy
 * hides from `/models`) but must still pass the extension check.
 * @param args - discovery result and the three override layers
 * @returns view model for API responses and workflow wiring
 */
export function resolveComfyUIModels(args: {
  discovered: ComfyUIModelCandidates;
  config?: ComfyUIModelOverrides;
  admin?: ComfyUIModelOverrides;
  user?: ComfyUIModelOverrides;
},): ComfyUIModelView {
  const { discovered, config, admin, user, } = args;
  const noVae = user?.noVae ?? admin?.noVae ?? config?.noVae ?? false;

  /** @param role */
  const resolveRole = (role: ComfyUIModelRole,): ComfyUIModelRoleView => {
    const candidates = discovered[role] ?? [];
    if (role === "vae" && noVae) {
      return { candidates: [], selected: null, source: "none", };
    }

    const userName = user?.[role];
    if (userName && candidates.includes(userName,)) {
      return { candidates, selected: userName, source: "user", };
    }

    const adminName = admin?.[role];
    if (adminName !== undefined) {
      assertComfyUIModelName(role, adminName,);
      return { candidates, selected: adminName, source: "admin", };
    }

    const configName = config?.[role];
    if (configName !== undefined) {
      assertComfyUIModelName(role, configName,);
      return { candidates, selected: configName, source: "config", };
    }

    return { candidates, selected: candidates[0] ?? null, source: candidates.length > 0 ? "discovery" : "none", };
  };

  const clipRole = resolveRole("clip",);
  const diffusionRole = resolveRole("diffusion",);
  const vaeRole = resolveRole("vae",);
  const checkpointRole = resolveRole("checkpoint",);
  const clipVisionRole = resolveRole("clip_vision",);
  const lorasRole = resolveRole("loras",);
  return {
    clip: clipRole.candidates,
    diffusion: diffusionRole.candidates,
    vae: vaeRole.candidates,
    checkpoint: checkpointRole.candidates,
    clip_vision: clipVisionRole.candidates,
    loras: lorasRole.candidates,
    noVae,
    clipRole,
    diffusionRole,
    vaeRole,
    checkpointRole,
    clipVisionRole,
    lorasRole,
  };
}
