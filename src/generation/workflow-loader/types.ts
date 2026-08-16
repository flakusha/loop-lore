// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { SubstitutionVars, } from "../workflow-substitutor";

/** Options for loading and substituting a workflow */
export interface LoadWorkflowOptions {
  /** Workflow name (filename without extension, e.g. "txt2img") */
  name: string;
  /** Variable substitutions for {{placeholder}} replacement */
  vars?: SubstitutionVars;
  /** Node-targeted overrides (nodeId → field → value) */
  nodeOverrides?: Map<string, Record<string, unknown>>;
}
