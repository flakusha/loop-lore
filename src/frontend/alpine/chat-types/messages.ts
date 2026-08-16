// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

export interface MessageAttachment {
  assetId: string;
  order: number;
  caption: string;
  label: string;
  url: string;
  thumbUrl?: string;
  filename: string;
  mimeType: string;
  type: string;
  width: number;
  height: number;
}

/** A function call the assistant invoked during generation (mirrors GenerationToolCall). */
export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface Message {
  id: string;
  role: string;
  content: string;
  created_at: string;
  edited_at?: string;
  thinking?: string;
  tool_calls?: ToolCall[] | null;
  actor_name?: string;
  variantIndex?: number;
  totalVariants?: number;
  attachments?: MessageAttachment[];
  model_id?: string;
  provider?: string;
  token_count_prompt?: number;
  token_count_completion?: number;
  token_count_total?: number;
  generation_time_ms?: number;
  tokens_per_second?: number;
  status?: string;
  emotion?: string;
  reactions?: { emoji: string; count: number; userReacted: boolean }[];
  pinned?: boolean;
  /** Chat section this message belongs to (multi-location sectioning). */
  section_id?: string | null;
}

export interface GroupedMessage extends Message {
  group?: boolean;
  groupCount?: number;
}

export interface GenerationDetail {
  model?: string;
  elapsedMs?: number;
  chunksReceived?: number;
  charsReceived?: number;
  status?: string;
  attemptId?: string;
}
