// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Plumbing shared by the Builder tab: endpoint paths and child logger. */
import { log as rootLog, } from "../logger";

/** Child logger for this tab. */
export const log = rootLog.child({ module: "comfyui-builder", },);

/** The builder HTTP surface. */
export const BUILDER_PATH = "/api/v1/comfyui-builder";

/** The image-edit template registry the step picker reads. */
export const TEMPLATES_PATH = "/api/v1/image-edit/templates?backend=comfyui";
