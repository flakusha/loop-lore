// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Catalog for the opt-in rtk/lean-ctx tools. Publishes names and domains only —
 * full tool schemas stay on the provider request, where the role gate emits
 * them. Emits nothing unless LOOP_LORE_EXTERNAL_TOOLS=1.
 */
import { externalToolsEnabled, } from "../../../harness/external-tools";
import { wrapSection, } from "../../xml-utils";
import type { SectionBuilder, } from "../types";

export const externalToolsSection: SectionBuilder = {
  name: "externalTools",
  enabled: () => externalToolsEnabled(),
  build: () => [{
    role: "system",
    content: wrapSection(
      "external_tools",
      [
        "For source-code and text-document work, use the registered tools `rtk_run` and `ctx_call`.",
        "rtk_run takes a read-only rtk argv array (read, grep, rg, find, ls, tree, diff, json, wc, status, gain).",
        "ctx_call takes {tool, args}; allowed tools are ctx_read, ctx_patch, ctx_glob, ctx_search, ctx_tree, ctx_delta, ctx_compose, ctx_callgraph and ctx_graph.",
        "Anchored hashes for ctx_patch come from a prior ctx_read. Never invent a shell, file-read or file-write tool.",
      ].join("\n",),
    ),
  },],
};
