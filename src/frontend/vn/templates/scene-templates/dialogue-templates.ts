// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { VnTemplate, } from "../template-engine";

// ── Dialogue Templates ─────────────────────────────────────

export const DIALOGUE_TEMPLATES: VnTemplate[] = [
  {
    id: "narration",
    name: "Narration",
    description: "Story narration, no portrait",
    worldId: "__builtin__",
    category: "dialogue",
    version: 1,
    variables: [],
    body: {
      layout: "overlay",
      transition: "none",
      dialogueStyle: "narration",
      background: { scaling: "cover", },
      text: { typewriterSpeed: 40, pauseOnPunctuation: true, },
    },
    tags: ["narration", "slow",],
    createdAt: "2024-01-01T00:00:00Z",
    modifiedAt: "2024-01-01T00:00:00Z",
  },
  {
    id: "dialogue_normal",
    name: "Normal Dialogue",
    description: "Standard character speech",
    worldId: "__builtin__",
    category: "dialogue",
    version: 1,
    variables: [
      { name: "character_name", type: "string", required: true, description: "Speaking character", },
    ],
    body: {
      layout: "overlay",
      transition: "none",
      dialogueStyle: "standard",
      text: { typewriterSpeed: 30, pauseOnPunctuation: true, },
    },
    tags: ["dialogue", "normal",],
    createdAt: "2024-01-01T00:00:00Z",
    modifiedAt: "2024-01-01T00:00:00Z",
  },
  {
    id: "dialogue_tense",
    name: "Tense Dialogue",
    description: "Tense exchange, short lines",
    worldId: "__builtin__",
    category: "dialogue",
    version: 1,
    variables: [
      { name: "character_name", type: "string", required: true, description: "Speaking character", },
    ],
    body: {
      layout: "overlay",
      transition: "none",
      dialogueStyle: "whisper",
      text: { typewriterSpeed: 20, pauseOnPunctuation: false, },
    },
    tags: ["dialogue", "tense", "fast",],
    createdAt: "2024-01-01T00:00:00Z",
    modifiedAt: "2024-01-01T00:00:00Z",
  },
  {
    id: "dialogue_whisper",
    name: "Whisper",
    description: "Quiet, intimate moment",
    worldId: "__builtin__",
    category: "dialogue",
    version: 1,
    variables: [
      { name: "character_name", type: "string", required: true, description: "Speaking character", },
    ],
    body: {
      layout: "overlay",
      transition: "none",
      dialogueStyle: "whisper",
      text: { typewriterSpeed: 45, pauseOnPunctuation: true, },
    },
    tags: ["dialogue", "whisper", "intimate",],
    createdAt: "2024-01-01T00:00:00Z",
    modifiedAt: "2024-01-01T00:00:00Z",
  },
  {
    id: "dialogue_shout",
    name: "Shout",
    description: "Urgent, loud delivery",
    worldId: "__builtin__",
    category: "dialogue",
    version: 1,
    variables: [
      { name: "character_name", type: "string", required: true, description: "Speaking character", },
    ],
    body: {
      layout: "overlay",
      transition: "none",
      dialogueStyle: "shout",
      text: { typewriterSpeed: 15, pauseOnPunctuation: false, },
    },
    tags: ["dialogue", "shout", "urgent",],
    createdAt: "2024-01-01T00:00:00Z",
    modifiedAt: "2024-01-01T00:00:00Z",
  },
  {
    id: "inner_thought",
    name: "Inner Thought",
    description: "Character inner monologue",
    worldId: "__builtin__",
    category: "dialogue",
    version: 1,
    variables: [
      { name: "character_name", type: "string", required: true, description: "Thinking character", },
    ],
    body: {
      layout: "overlay",
      transition: "none",
      dialogueStyle: "thought",
      text: { typewriterSpeed: 40, pauseOnPunctuation: true, fontStyle: "italic", },
    },
    tags: ["dialogue", "thought", "internal",],
    createdAt: "2024-01-01T00:00:00Z",
    modifiedAt: "2024-01-01T00:00:00Z",
  },
  {
    id: "system_text",
    name: "System Text",
    description: "System prompts, game info",
    worldId: "__builtin__",
    category: "dialogue",
    version: 1,
    variables: [],
    body: {
      layout: "overlay",
      transition: "none",
      dialogueStyle: "system",
      text: { typewriterSpeed: 30, pauseOnPunctuation: false, },
    },
    tags: ["system", "info", "meta",],
    createdAt: "2024-01-01T00:00:00Z",
    modifiedAt: "2024-01-01T00:00:00Z",
  },
];

export function getDialogueTemplate(id: string,): VnTemplate | undefined {
  return DIALOGUE_TEMPLATES.find((t,) => t.id === id);
}

export function listDialogueTemplates(): VnTemplate[] {
  return [...DIALOGUE_TEMPLATES,];
}
