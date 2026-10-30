// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { GenerationDetail, } from "./messages";

/**
 * Live-generation transport and response-variant state: the SSE stream, its
 * tool-call buffer, and the swipe/variant picker.
 */
export interface ChatCoreGenerationState {
  _generationEventSource: EventSource | null;
  /** Rendered tool-call blocks emitted during live streaming (prepended to stream container). */
  _streamToolCalls: string[];
  /** Latest streamed content HTML (preserved so tool-call renders don't wipe it). */
  _streamContent: string;
  /** Latest harness job-status line pushed over the per-chat SSE stream (empty = none). */
  _jobStatusLine: string;
  generationDetail: GenerationDetail | null;
  connectGenerationSSE(chatId: string,): void;
  sendWithPreferredMode(chatId: string, onDone?: () => void,): Promise<void>;
  renderStreamContainer(): void;
  _cleanupSSE(): void;
  cancelGeneration(): Promise<void>;
  regenerateResponse(): Promise<void>;
  regenerateVariant(messageId: string,): Promise<void>;
  switchVariant(messageId: string, direction: number,): Promise<void>;
  _variantsOpen: boolean;
  _variantsLoading: boolean;
  _variantsFor: string | null;
  _variants: { id: string; content: string }[];
  openVariants(messageId: string,): Promise<void>;
  closeVariants(): void;
  selectVariantByIndex(messageId: string, index: number,): Promise<void>;
  continueMessage(messageId: string,): Promise<void>;
  retryFromPoint(attemptId: string, step: number,): Promise<void>;
}
