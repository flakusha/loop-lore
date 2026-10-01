// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * ComfyUI builder component (Track A) — registers
 * `globalThis.comfyuiBuilder` for the admin Builder tab's
 * `x-data="comfyuiBuilder()"`, mirroring how `admin.ts` registers
 * `adminPage`. State is composed from the `./comfyui-builder/` halves
 * (admin-workflows list/form pattern) and ships inside `alpine-init.js`.
 */
import { comfyuiBuilderState, } from "./comfyui-builder/index";
import type { ComfyuiBuilder, } from "./comfyui-builder/types";

/** Factory shape Alpine sees via `x-data="comfyuiBuilder()"`. */
export type ComfyuiBuilderFactory = () => ComfyuiBuilder;

declare global {
  var comfyuiBuilder: ComfyuiBuilderFactory;
}

/**
 * Fresh top-level state per Alpine init; methods are shared by reference.
 * @returns {ComfyuiBuilderFactory} a fresh state object bound to the shared methods.
 */
globalThis.comfyuiBuilder = () => ({ ...comfyuiBuilderState, });
