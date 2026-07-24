// src/config/sections/llm-templates.ts — LLM template config accessor
//
// Provides access to LLM system prompts and chat formats from config.
// Used by the prompt assembler and generation pipeline.

import type { ChatFormatTemplate, LlmSystemPrompts, LlmTemplateConfig, } from "./templates";

/**
 * Get a system prompt by purpose key.
 *
 * @param config - LLM template configuration
 * @param purpose - Prompt purpose (chat, summarize, imagePrompt, ooc, or custom)
 * @returns The system prompt string, or undefined if not found
 */
export function getSystemPrompt(
  config: LlmTemplateConfig,
  purpose: string,
): string | undefined {
  return config.systemPrompts[purpose];
}

/**
 * Get all system prompts.
 *
 * @param config - LLM template configuration
 * @returns Record of purpose -> prompt string
 */
export function getAllSystemPrompts(
  config: LlmTemplateConfig,
): LlmSystemPrompts {
  return config.systemPrompts;
}

/**
 * Get a chat format template by name.
 *
 * @param config - LLM template configuration
 * @param formatName - Format name (alpaca, chatml, etc.)
 * @returns The chat format template, or undefined if not found
 */
export function getChatFormat(
  config: LlmTemplateConfig,
  formatName: string,
): ChatFormatTemplate | undefined {
  return config.chatFormats[formatName];
}

/**
 * Get all available chat format names.
 *
 * @param config - LLM template configuration
 * @returns Array of format names
 */
export function listChatFormats(config: LlmTemplateConfig,): string[] {
  return Object.keys(config.chatFormats,);
}
