// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * ComfyUI model discovery — role-based model names from the `/models` folder
 * endpoints. Operators pin names in `configs/config.generation.toml`; admins
 * and users can override the selection from the settings frontends.
 */
import { COMFYUI_MODEL_EXTENSIONS, isComfyUIModelName, } from "@loop-lore/core/config/schema/providers";
import { getLogger, } from "../../logger/index";

/** Model slots a ComfyUI video workflow needs. */
export type ComfyUIModelRole = keyof typeof COMFYUI_MODEL_EXTENSIONS;

export const COMFYUI_MODEL_ROLES = ["clip", "diffusion", "vae",] as const;

/** ComfyUI folder aliases, in preference order. */
export const COMFYUI_MODEL_FOLDERS: Record<ComfyUIModelRole, readonly string[]> = {
  clip: ["clip", "clip_gguf", "text_encoders",],
  diffusion: ["diffusion_models", "unet", "unet_gguf",],
  vae: ["vae",],
};

export { COMFYUI_MODEL_EXTENSIONS, };

export interface ComfyUIModelCandidates {
  clip: string[];
  diffusion: string[];
  vae: string[];
}

/** Model selection overrides: config file, system_config, or users.settings. */
export interface ComfyUIModelOverrides {
  clip?: string;
  diffusion?: string;
  vae?: string;
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
}

/** Minimal client surface needed by discovery (no dependency on the HTTP client). */
export interface ComfyUIModelClient {
  listModelFolders(): Promise<string[]>;
  listModelFolder(folder: string,): Promise<string[]>;
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
 * Discover model names from the ComfyUI folder endpoints. Missing aliases and
 * failing requests are skipped with a warning; a reachable instance with only
 * some folders still produces usable candidates.
 * @param client - ComfyUI model-folder client
 * @returns candidates keyed by role
 */
export async function discoverComfyUIModels(client: ComfyUIModelClient,): Promise<ComfyUIModelCandidates> {
  const folders = await client.listModelFolders();
  if (!Array.isArray(folders,)) {
    throw new Error("ComfyUI /models did not return a folder list",);
  }

  const available = new Set(folders,);
  const discovered = {} as Record<ComfyUIModelRole, string[]>;
  for (const role of COMFYUI_MODEL_ROLES) {
    const names: string[] = [];
    for (const folder of COMFYUI_MODEL_FOLDERS[role]) {
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
  return {
    clip: clipRole.candidates,
    diffusion: diffusionRole.candidates,
    vae: vaeRole.candidates,
    noVae,
    clipRole,
    diffusionRole,
    vaeRole,
  };
}
