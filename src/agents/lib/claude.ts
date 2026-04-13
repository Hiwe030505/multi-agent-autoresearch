/**
 * Claude API Client — DEPRECATED in favor of ./llm/client.ts
 *
 * Kept for backward compatibility. New code should use:
 *   import { llm } from "../../llm/client.ts";
 *   const response = await llm.chat(messages, { provider: 'anthropic', model: 'claude-opus-4-6' });
 *
 * This file wraps the unified client for existing agents.
 */

import { llm } from "../../llm/client.ts";
import { config } from "../../config.ts";

export interface ClaudeMessage {
  role: "user" | "assistant";
  content: string;
}

export async function claudeChat(
  messages: ClaudeMessage[],
  system?: string,
  model?: string,
  maxTokens = 4096,
): Promise<{ content: string; usage?: { input_tokens: number; output_tokens: number } }> {
  const resolvedModel = model ?? config.models.research;

  const response = await llm.chat(messages, {
    provider: "kyma",
    model: resolvedModel,
    system,
    maxTokens,
  });

  return response;
}
