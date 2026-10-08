// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Plugin UI mount points (FEAT-050) — server-rendered host containers.
 *
 * Views embed `{{plugin:<location>}}` where plugin components should mount;
 * {@link resolvePluginMounts} expands each directive into an inert container
 * per registered web-capable component. Only markup is emitted — binding
 * behaviour is the consumer's responsibility.
 */

import { getComponentsForMountPoint, } from "../../plugins/mount-points";
import { registry, } from "../../plugins/registry";
import type { UIComponentDefinition, } from "../../plugins/types";
import { jsonStringifyOr, } from "../../utils";
import { escapeHtml, } from "./escape-html";

/** Match `{{plugin:location}}` mount directives. */
const PLUGIN_MOUNT_RE = /\{\{plugin:([-\w.]+)\}\}/g;

/**
 * Render one inert host container. `props` ride in an HTML-escaped JSON data
 * attribute so consumers can bind after hydration.
 * @param component
 * @returns {string}
 */
function renderContainer(component: UIComponentDefinition,): string {
  const props = component.props == null
    ? ""
    : ` data-plugin-props="${escapeHtml(jsonStringifyOr(component.props,),)}"`;
  return `<div class="plugin-mount" data-plugin-component="${escapeHtml(component.name,)}" data-plugin-location="${
    escapeHtml(component.location,)
  }"${props}></div>`;
}

/**
 * Expand every `{{plugin:location}}` directive in `content`. TUI-only
 * components are never mounted into web views; locations without a
 * registered web component render nothing.
 * @param content
 * @returns {string}
 */
export function resolvePluginMounts(content: string,): string {
  return content.replaceAll(
    PLUGIN_MOUNT_RE,
    (_match, location: string,) =>
      getComponentsForMountPoint(registry.getAllUIComponents(), location,)
        .filter((c,) => c.type !== "tui")
        .map((c,) => renderContainer(c,))
        .join("",),
  );
}
