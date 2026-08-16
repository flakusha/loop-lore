// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Image Edit Command — shared types.
//
// Split from the former image-edit-commands.ts module.

import type { CommandIntent, } from "../../regex/image-edit";

/** Parsed command result */
export interface ParsedCommand {
  intent: CommandIntent;
  confidence: number;
  originalText: string;
  parameters: Record<string, string>;
  template?: EditTemplate;
}

/** Edit template definition */
export interface EditTemplate {
  id: string;
  name: string;
  intent: CommandIntent;
  /** Prompt modifier for the edit */
  promptModifier: string;
  /** Negative prompt to apply */
  negativePrompt?: string;
  /** Denoising strength (0-1, higher = more change) */
  denoisingStrength: number;
  /** ControlNet type to use */
  controlNet?: ControlNetType;
  /** IP-Adapter strength */
  ipAdapterStrength?: number;
  /** Steps override */
  steps?: number;
  /** CFG scale override */
  cfgScale?: number;
}

/** ControlNet types */
export type ControlNetType =
  | "canny"
  | "depth"
  | "pose"
  | "lineart"
  | "scribble"
  | "segmentation"
  | "normal"
  | "tile"
  | "ip2p"
  | "inpaint";

/** Edit chain entry for undo/redo */
export interface EditChainEntry {
  id: string;
  command: ParsedCommand;
  assetId: string;
  resultAssetId?: string;
  timestamp: string;
  status: "pending" | "applied" | "undone" | "failed";
  error?: string;
}

/** Edit history for an asset */
export interface EditHistory {
  assetId: string;
  entries: EditChainEntry[];
  currentEntryIndex: number;
}
