<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC-RESEARCH-MATH-AI-BRIDGE — LLM ↔ math contract

Status: **Draft**

## Goal

Make the LLM a faithful narrator of resolved interactions, not the
arbiter of outcomes. Ship a typed `DiceResult` / `InteractionResult`
contract the prompt section consumes verbatim.

## Why

Today the LLM often narrates outcomes that disagree with the recorded
roll (`roll.raw_total=1` narrated as success, `roll.raw_total=20`
narrated as a non-critical success). The ledger has the truth; the
prompt does not enforce it.

## Sub-systems

- `src/rpg/interaction/contract/dice-result.ts` — typed `DiceResult`
  (sides, count, kept, raw, total, modifiers, advantage, outcome).
- `src/assistant/prompt/sections/interaction-context.ts` — render
  the contract verbatim; ban free-form "outcome" text.
- `src/assistant/commands/interaction.ts` — only call
  `resolveInteraction`; the assistant response must include the
  returned `DiceResult` JSON, not synthesize its own.

## Acceptance criteria

- A regression test asserts the prompt section contains the recorded
  `roll.raw_total` even when the LLM previously narrated otherwise.
- A lint rule (or review check) flags any prompt that uses the words
  "roll" + "success" outside the contract rendering.

## Out of scope

- LLM fine-tuning to enforce compliance (a downstream concern).
