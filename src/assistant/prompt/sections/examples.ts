// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Example messages section — parses the actor's `mes_example` into few-shot
 * GenerationMessage pairs.
 */
import type { GenerationMessage, } from "../../../generation/gen-types-options";
import type { SectionBuilder, } from "../types";

export const examplesSection: SectionBuilder = {
  name: "examples",
  enabled: (ctx,) => !!(ctx.params.includeExamples && ctx.actor.mes_example),
  build: (ctx,) => {
    const raw = ctx.actor.mes_example;
    if (!raw) { return []; }

    // mes_example format: <START> delimited role:content pairs
    const examples: GenerationMessage[] = [];
    const blocks: string[] = [];
    for (const b of raw.split("<START>",)) { if (b) { blocks.push(b,); } }

    for (const block of blocks) {
      const trimmed = block.trim();
      if (!trimmed) { continue; }

      const colonIdx = trimmed.indexOf(":",);
      if (colonIdx === -1) {
        examples.push({ role: "user", content: trimmed, },);
        continue;
      }

      const label = trimmed.slice(0, colonIdx,).trim().toLowerCase();
      const content = trimmed.slice(colonIdx + 1,).trim();
      if (["assistant", "character", "{{char}}",].includes(label,)) {
        examples.push({ role: "character", content, },);
      } else if (label === "user" || label === "{{user}}") {
        examples.push({ role: "user", content, },);
      } else {
        throw new Error(
          `examplesSection: unrecognized label "${label}" — expected assistant|character|{{char}}|user|{{user}}`,
        );
      }
    }

    return examples;
  },
};
