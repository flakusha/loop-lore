// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import type {
  isLlmGenerationConfigured as IsLlmGenerationConfigured,
  triggerAutoGeneration as TriggerAutoGeneration,
} from "../../generation/auto-gen";

/** Shared per-route options threaded into every chats sub-plugin. */
export interface HandlerOpts {
  database: Kysely<DB>;
  config: Config;
  /**
   * Test seams for the auto-generation hub, defaulting to the real
   * implementation. Injected rather than `mock.module`d because Bun's module
   * registry is process-global and has no unmock, so a module mock here also
   * served every later file importing the same hub — including
   * src/routes/messages/reply.ts, where a forced-true
   * `isLlmGenerationConfigured` made it take the generation branch and never
   * reach the assistant reply.
   */
  isLlmGenerationConfigured?: typeof IsLlmGenerationConfigured;
  triggerAutoGeneration?: typeof TriggerAutoGeneration;
}
