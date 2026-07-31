/**
 * VN Pre-Configured Scene Templates
 *
 * Reusable scene templates that GMs can select to quickly
 * configure VN scenes with appropriate layout, transitions,
 * and emotion defaults.
 */

import type { VnTemplate, } from "./template-engine";

// ── Template Definitions ───────────────────────────────────

export const SCENE_TEMPLATES: VnTemplate[] = [
  {
    id: "introduction",
    name: "Introduction",
    description: "New character/location reveal",
    worldId: "__builtin__",
    category: "scene",
    version: 1,
    variables: [
      { name: "character_name", type: "string", required: true, description: "Character name" },
      { name: "location_name", type: "string", required: false, description: "Location name" },
    ],
    body: {
      layout: "split",
      transition: "fade-in",
      dialogueStyle: "standard",
      portrait: { position: "center", size: 1.2 },
      background: { scaling: "cover" },
      text: { typewriterSpeed: 30, pauseOnPunctuation: true },
    },
    tags: ["character", "location", "reveal"],
    createdAt: "2024-01-01T00:00:00Z",
    modifiedAt: "2024-01-01T00:00:00Z",
  },
  {
    id: "confrontation",
    name: "Confrontation",
    description: "Tense dialogue exchange",
    worldId: "__builtin__",
    category: "scene",
    version: 1,
    variables: [
      { name: "character_name", type: "string", required: true, description: "Opposing character" },
      { name: "tension_level", type: "enum", required: false, default: "high", enum: ["medium", "high", "extreme"], description: "Tension intensity" },
    ],
    body: {
      layout: "overlay",
      transition: "cut",
      dialogueStyle: "whisper",
      portrait: { position: "right" },
      background: { scaling: "cover", filter: "brightness(0.8) contrast(1.1)" },
      text: { typewriterSpeed: 20, pauseOnPunctuation: false },
    },
    tags: ["dialogue", "tense", "conflict"],
    createdAt: "2024-01-01T00:00:00Z",
    modifiedAt: "2024-01-01T00:00:00Z",
  },
  {
    id: "resolution",
    name: "Resolution",
    description: "Conflict resolution, relief",
    worldId: "__builtin__",
    category: "scene",
    version: 1,
    variables: [
      { name: "character_name", type: "string", required: false, description: "Character being resolved with" },
    ],
    body: {
      layout: "below",
      transition: "dissolve",
      dialogueStyle: "standard",
      portrait: { position: "left" },
      background: { scaling: "cover" },
      text: { typewriterSpeed: 35, pauseOnPunctuation: true },
    },
    tags: ["dialogue", "calm", "resolution"],
    createdAt: "2024-01-01T00:00:00Z",
    modifiedAt: "2024-01-01T00:00:00Z",
  },
  {
    id: "flashback",
    name: "Flashback",
    description: "Memory/dream sequence",
    worldId: "__builtin__",
    category: "scene",
    version: 1,
    variables: [
      { name: "memory_text", type: "string", required: false, description: "Memory context" },
    ],
    body: {
      layout: "overlay",
      transition: "slide",
      dialogueStyle: "thought",
      background: { scaling: "cover", filter: "sepia(0.5) brightness(0.9)" },
      text: { typewriterSpeed: 40, pauseOnPunctuation: true, fontStyle: "italic" },
    },
    tags: ["memory", "dream", "past"],
    createdAt: "2024-01-01T00:00:00Z",
    modifiedAt: "2024-01-01T00:00:00Z",
  },
  {
    id: "discovery",
    name: "Discovery",
    description: "Finding something important",
    worldId: "__builtin__",
    category: "scene",
    version: 1,
    variables: [
      { name: "item_name", type: "string", required: false, description: "Discovered item" },
    ],
    body: {
      layout: "below",
      transition: "fade",
      dialogueStyle: "standard",
      portrait: { position: "center" },
      background: { scaling: "contain" },
      text: { typewriterSpeed: 25, pauseOnPunctuation: true },
    },
    tags: ["item", "revelation", "plot"],
    createdAt: "2024-01-01T00:00:00Z",
    modifiedAt: "2024-01-01T00:00:00Z",
  },
  {
    id: "farewell",
    name: "Farewell",
    description: "Leaving a character/location",
    worldId: "__builtin__",
    category: "scene",
    version: 1,
    variables: [
      { name: "character_name", type: "string", required: true, description: "Character departing" },
    ],
    body: {
      layout: "split",
      transition: "wipe",
      dialogueStyle: "standard",
      portrait: { position: "left" },
      background: { scaling: "cover" },
      text: { typewriterSpeed: 35, pauseOnPunctuation: true },
    },
    tags: ["departure", "emotional", "goodbye"],
    createdAt: "2024-01-01T00:00:00Z",
    modifiedAt: "2024-01-01T00:00:00Z",
  },
  {
    id: "combat_start",
    name: "Combat Start",
    description: "Battle transition",
    worldId: "__builtin__",
    category: "scene",
    version: 1,
    variables: [
      { name: "enemy_name", type: "string", required: true, description: "Enemy name" },
    ],
    body: {
      layout: "overlay",
      transition: "cut",
      dialogueStyle: "shout",
      portrait: { position: "right" },
      background: { scaling: "cover", filter: "contrast(1.2) saturate(1.1)" },
      text: { typewriterSpeed: 15, pauseOnPunctuation: false },
    },
    tags: ["combat", "action", "battle"],
    createdAt: "2024-01-01T00:00:00Z",
    modifiedAt: "2024-01-01T00:00:00Z",
  },
  {
    id: "quiet_moment",
    name: "Quiet Moment",
    description: "Peaceful scene, bonding",
    worldId: "__builtin__",
    category: "scene",
    version: 1,
    variables: [
      { name: "character_name", type: "string", required: false, description: "Companion" },
    ],
    body: {
      layout: "below",
      transition: "dissolve",
      dialogueStyle: "whisper",
      portrait: { position: "left" },
      background: { scaling: "cover", filter: "brightness(1.05)" },
      text: { typewriterSpeed: 45, pauseOnPunctuation: true },
    },
    tags: ["calm", "bonding", "romance"],
    createdAt: "2024-01-01T00:00:00Z",
    modifiedAt: "2024-01-01T00:00:00Z",
  },
  {
    id: "mystery",
    name: "Mystery",
    description: "Suspense, investigation",
    worldId: "__builtin__",
    category: "scene",
    version: 1,
    variables: [
      { name: "clue_name", type: "string", required: false, description: "Investigation focus" },
    ],
    body: {
      layout: "split",
      transition: "fade",
      dialogueStyle: "thought",
      portrait: { position: "right" },
      background: { scaling: "cover", filter: "brightness(0.85) hue-rotate(10deg)" },
      text: { typewriterSpeed: 30, pauseOnPunctuation: true },
    },
    tags: ["mystery", "investigation", "suspense"],
    createdAt: "2024-01-01T00:00:00Z",
    modifiedAt: "2024-01-01T00:00:00Z",
  },
  {
    id: "celebration",
    name: "Celebration",
    description: "Victory, festival",
    worldId: "__builtin__",
    category: "scene",
    version: 1,
    variables: [
      { name: "character_name", type: "string", required: false, description: "Celebration companion" },
    ],
    body: {
      layout: "below",
      transition: "slide",
      dialogueStyle: "standard",
      portrait: { position: "center" },
      background: { scaling: "cover", filter: "brightness(1.1) saturate(1.2)" },
      text: { typewriterSpeed: 25, pauseOnPunctuation: false },
    },
    tags: ["victory", "festival", "happy"],
    createdAt: "2024-01-01T00:00:00Z",
    modifiedAt: "2024-01-01T00:00:00Z",
  },
];

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
      background: { scaling: "cover" },
      text: { typewriterSpeed: 40, pauseOnPunctuation: true },
    },
    tags: ["narration", "slow"],
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
      { name: "character_name", type: "string", required: true, description: "Speaking character" },
    ],
    body: {
      layout: "overlay",
      transition: "none",
      dialogueStyle: "standard",
      text: { typewriterSpeed: 30, pauseOnPunctuation: true },
    },
    tags: ["dialogue", "normal"],
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
      { name: "character_name", type: "string", required: true, description: "Speaking character" },
    ],
    body: {
      layout: "overlay",
      transition: "none",
      dialogueStyle: "whisper",
      text: { typewriterSpeed: 20, pauseOnPunctuation: false },
    },
    tags: ["dialogue", "tense", "fast"],
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
      { name: "character_name", type: "string", required: true, description: "Speaking character" },
    ],
    body: {
      layout: "overlay",
      transition: "none",
      dialogueStyle: "whisper",
      text: { typewriterSpeed: 45, pauseOnPunctuation: true },
    },
    tags: ["dialogue", "whisper", "intimate"],
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
      { name: "character_name", type: "string", required: true, description: "Speaking character" },
    ],
    body: {
      layout: "overlay",
      transition: "none",
      dialogueStyle: "shout",
      text: { typewriterSpeed: 15, pauseOnPunctuation: false },
    },
    tags: ["dialogue", "shout", "urgent"],
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
      { name: "character_name", type: "string", required: true, description: "Thinking character" },
    ],
    body: {
      layout: "overlay",
      transition: "none",
      dialogueStyle: "thought",
      text: { typewriterSpeed: 40, pauseOnPunctuation: true, fontStyle: "italic" },
    },
    tags: ["dialogue", "thought", "internal"],
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
      text: { typewriterSpeed: 30, pauseOnPunctuation: false },
    },
    tags: ["system", "info", "meta"],
    createdAt: "2024-01-01T00:00:00Z",
    modifiedAt: "2024-01-01T00:00:00Z",
  },
];

// ── Template Registry ──────────────────────────────────────

export function getSceneTemplate(id: string): VnTemplate | undefined {
  return SCENE_TEMPLATES.find((t) => t.id === id,);
}

export function getDialogueTemplate(id: string): VnTemplate | undefined {
  return DIALOGUE_TEMPLATES.find((t) => t.id === id,);
}

export function listSceneTemplates(): VnTemplate[] {
  return [...SCENE_TEMPLATES];
}

export function listDialogueTemplates(): VnTemplate[] {
  return [...DIALOGUE_TEMPLATES];
}

export function searchTemplates(query: string): VnTemplate[] {
  const lower = query.toLowerCase();
  return [
    ...SCENE_TEMPLATES.filter(
      (t) => t.name.toLowerCase().includes(lower) || t.description.toLowerCase().includes(lower) || t.tags.some((tag) => tag.includes(lower)),
    ),
    ...DIALOGUE_TEMPLATES.filter(
      (t) => t.name.toLowerCase().includes(lower) || t.description.toLowerCase().includes(lower) || t.tags.some((tag) => tag.includes(lower)),
    ),
  ];
}
