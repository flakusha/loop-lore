// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Ren'Py export plugin — core plugin shipped with loop-lore.
 *
 * Registers POST /api/renpy/export@v1: selected chats -> Ren'Py game overlay
 * zip (script.rpy, characters.rpy, README.md, avatar PNGs). Editing the
 * result in Ren'Py is out of scope for loop-lore — the zip is a one-way drop.
 *
 * License: Apache-2.0
 */
import type { PluginManifest, } from "../../../src/plugins/types";
import { EXPORT_PATH, makeExportHandler, } from "./routes";

export const plugin: PluginManifest = {
  name: "renpy-export",
  version: "1.0.0",
  description: "Export chats to a Ren'Py game overlay zip (one-way: script, characters, avatars)",
  author: "loop-lore team",
  license: "Apache-2.0",

  async onLoad(context,) {
    context.registerApiRoute({
      method: "POST",
      path: EXPORT_PATH,
      handler: makeExportHandler(context.db,),
      description: "Export chats to a Ren'Py overlay zip",
      requiresAuth: true,
    },);
  },
};
