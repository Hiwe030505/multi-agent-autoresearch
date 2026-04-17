/**
 * Unified LLM Client — Multi-provider support
 *
 * Supported providers:
 * - Anthropic (Claude)
 * - OpenAI (GPT-4, GPT-4o, o1, etc.)
 * - Groq (fast, cheap inference)
 * - Ollama (local models)
 * - LM Studio (local models)
 * - vLLM (self-hosted)
 * - Fireworks AI (fast inference)
 *
 * Usage:
 *   import { llm } from './llm/client.ts';
 *   await llm.chat("Hello", { provider: 'anthropic', model: 'claude-opus-4-6' });
 *   await llm.chat("Write code", { provider: 'groq', model: 'llama-3.3-70b' });
 */

import { config } from "../config.ts";
import type { LLMMessage, LLMResponse, LLMOptions, LLMProvider } from "./types.ts";

// ─── Unified LLM Interface ─────────────────────────────────────────────────

export const llm = {
  /**
   * Generic chat — automatically routes to the right provider.
   *
   * @param messages  - conversation history
   * @param options   - model, provider, temperature, maxTokens, etc.
   */
  async chat(
    messages: LLMMessage[],
    options: LLMOptions = {},
  ): Promise<LLMResponse> {
    const { provider = "kyma", model, ...rest } = options;
    const resolvedModel = model ?? config.models.research;

    switch (provider) {
      case "anthropic":
        return chatAnthropic(messages, { ...rest, model: resolvedModel });
      case "kyma":
        return chatKyma(messages, { ...rest, model: resolvedModel });
      case "openai":
        return chatOpenAI(messages, { ...rest, model: resolvedModel });
      case "groq":
        return chatGroq(messages, { ...rest, model: resolvedModel });
      case "ollama":
        return chatOllama(messages, { ...rest, model: resolvedModel });
      case "lmstudio":
        return chatLMStudio(messages, { ...rest, model: resolvedModel });
      case "vllm":
        return chatVLLM(messages, { ...rest, model: resolvedModel });
      case "fireworks":
        return chatFireworks(messages, { ...rest, model: resolvedModel });
      case "huggingface":
        return chatHuggingFace(messages, { ...rest, model: resolvedModel });
      default:
        throw new Error(`Unknown LLM provider: ${provider}`);
    }
  },

  /**
   * Quick one-shot chat with a specific provider/model shortcut.
   * Provider is inferred from the model name prefix if not specified.
   *
   * Examples:
   *   llm.call("Hello", "claude-opus-4-6")
   *   llm.call("Write code", "gpt-4o")
   *   llm.call("Fast answer", "llama-3.3-70b", { provider: "groq" })
   */
  async call(
    prompt: string,
    modelOrShortcut: string,
    options: Partial<LLMOptions> = {},
  ): Promise<string> {
    const resolved = resolveModel(modelOrShortcut, options.provider);
    const messages: LLMMessage[] = [{ role: "user", content: prompt }];
    const response = await this.chat(messages, {
      ...options,
      model: resolved.model,
      provider: resolved.provider,
    });
    return response.content;
  },

  /**
   * Check which providers are configured and available.
   */
  async status(): Promise<Record<LLMProvider, boolean>> {
    const results = await Promise.allSettled([
      this.healthcheck("kyma"),
      this.healthcheck("anthropic"),
      this.healthcheck("openai"),
      this.healthcheck("groq"),
      this.healthcheck("ollama"),
      this.healthcheck("lmstudio"),
      this.healthcheck("huggingface"),
    ]);

    return {
      kyma: results[0]?.status === "fulfilled",
      anthropic: results[1]?.status === "fulfilled",
      openai: results[2]?.status === "fulfilled",
      groq: results[3]?.status === "fulfilled",
      ollama: results[4]?.status === "fulfilled",
      lmstudio: results[5]?.status === "fulfilled",
      vllm: false, // no easy healthcheck
      fireworks: false,
      huggingface: results[6]?.status === "fulfilled",
    };
  },

  async healthcheck(provider: LLMProvider): Promise<void> {
    switch (provider) {
      case "anthropic":
        await chatAnthropic([{ role: "user", content: "ping" }], {
          model: "claude-haiku-4-7",
          maxTokens: 5,
          timeout: 10_000,
        });
        break;
      case "openai":
        await chatOpenAI([{ role: "user", content: "ping" }], {
          model: "gpt-4o-mini",
          maxTokens: 5,
          timeout: 10_000,
        });
        break;
      case "groq":
        await chatGroq([{ role: "user", content: "ping" }], {
          model: "llama-3.3-70b-versatile",
          maxTokens: 5,
          timeout: 10_000,
        });
        break;
      case "ollama":
        await chatOllama([{ role: "user", content: "ping" }], {
          model: "llama3.2",
          maxTokens: 5,
          timeout: 10_000,
        });
        break;
      case "kyma":
        await chatKyma([{ role: "user", content: "ping" }], {
          model: "qwen-3.6-plus",
          maxTokens: 5,
          timeout: 10_000,
        });
        break;
      case "lmstudio":
        await chatLMStudio([{ role: "user", content: "ping" }], {
          model: "local-model",
          maxTokens: 5,
          timeout: 10_000,
        });
        break;
    }
  },
};

// ─── Model Resolution ──────────────────────────────────────────────────────

function resolveModel(
  input: string,
  forcedProvider?: LLMProvider,
): { model: string; provider: LLMProvider } {
  if (forcedProvider) return { model: input, provider: forcedProvider };

  const shortcuts: Record<string, { model: string; provider: LLMProvider }> = {
    // Anthropic
    "claude-opus-4-6": { model: "claude-opus-4-6", provider: "anthropic" },
    "claude-sonnet-4-6": { model: "claude-sonnet-4-6", provider: "anthropic" },
    "claude-haiku-4-7": { model: "claude-haiku-4-7", provider: "anthropic" },
    "opus": { model: "claude-opus-4-6", provider: "anthropic" },
    "sonnet": { model: "claude-sonnet-4-6", provider: "anthropic" },
    "haiku": { model: "claude-haiku-4-7", provider: "anthropic" },
    // OpenAI
    "gpt-4o": { model: "gpt-4o", provider: "openai" },
    "gpt-4o-mini": { model: "gpt-4o-mini", provider: "openai" },
    "gpt-4-turbo": { model: "gpt-4-turbo", provider: "openai" },
    "o1": { model: "o1", provider: "openai" },
    "o1-mini": { model: "o1-mini", provider: "openai" },
    "o3": { model: "o3", provider: "openai" },
    "o3-mini": { model: "o3-mini", provider: "openai" },
    // Groq
    "llama-3.3-70b": { model: "llama-3.3-70b-versatile", provider: "groq" },
    "llama-3.1-70b": { model: "llama-3.1-70b-versatile", provider: "groq" },
    "mixtral": { model: "mixtral-8x7b-32768", provider: "groq" },
    "gemma2-9b": { model: "gemma2-9b-it", provider: "groq" },
    // Kyma
    "qwen-3.6-plus": { model: "qwen-3.6-plus", provider: "kyma" },
    "qwen-3-32b": { model: "qwen-3-32b", provider: "kyma" },
    "qwen-3-coder": { model: "qwen-3-coder", provider: "kyma" },
    "qwen-3-235b-cerebras": { model: "qwen-3-235b-cerebras", provider: "kyma" },
    "gemini-2.5-flash": { model: "gemini-2.5-flash", provider: "kyma" },
    "llama-3.3-70b-kyma": { model: "llama-3.3-70b", provider: "kyma" },
    "gemma-4-31b": { model: "gemma-4-31b", provider: "kyma" },
    // Ollama / LMStudio
    "llama3.2": { model: "llama3.2", provider: "ollama" },
    "llama3.1": { model: "llama3.1", provider: "ollama" },
    "qwen2.5": { model: "qwen2.5", provider: "ollama" },
    "mistral": { model: "mistral", provider: "ollama" },
    "codellama": { model: "codellama", provider: "ollama" },
    "phi4": { model: "phi4", provider: "ollama" },
    // HuggingFace
    "qwen3.5-9b": { model: "Qwen/Qwen3.5-9B", provider: "huggingface" },
    "qwen3.5-32b": { model: "Qwen/Qwen3.5-32B", provider: "huggingface" },
  };

  const lower = input.toLowerCase();
  if (shortcuts[lower]) return shortcuts[lower]!;

  // Heuristic: infer from model name prefix
  if (lower.startsWith("claude-")) return { model: input, provider: "anthropic" };
  if (lower.startsWith("gpt-") || lower.startsWith("o1") || lower.startsWith("o3")) {
    return { model: input, provider: "openai" };
  }
  if (lower.startsWith("llama-") || lower.startsWith("mixtral")) {
    return { model: input, provider: "groq" };
  }

  // Default to ollama for unknown names (often local)
  return { model: input, provider: "ollama" };
}

// ─── Provider Implementations ──────────────────────────────────────────────

async function chatAnthropic(
  messages: LLMMessage[],
  opts: {
    model?: string;
    system?: string;
    temperature?: number;
    maxTokens?: number;
    timeout?: number;
  },
): Promise<LLMResponse> {
  const base = config.anthropicBaseUrl.replace(/\/$/, "");
  const system = opts.system;

  // pro-x.io.vn proxy: convert system → user message wrapper
  // (proxy rejects role: "system" with error 2013)
  const allMessages: Array<{ role: "system" | "user"; content: string }> = system
    ? [
        { role: "user", content: `[SYSTEM INSTRUCTION]\n${system}\n[/SYSTEM INSTRUCTION]\n\n` },
        ...messages.map((m) => ({ role: m.role as "user", content: m.content })),
      ]
    : messages.map((m) => ({ role: m.role as "user", content: m.content }));

  const maxTokens = opts.maxTokens ?? 4096;
  const timeout = opts.timeout ?? 360_000;

  let attempt = 0;
  while (true) {
    try {
      const res = await fetch(`${base}/v1/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": config.anthropicApiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: opts.model ?? "claude-opus-4-6",
          messages: allMessages,
          max_tokens: maxTokens,
          temperature: opts.temperature ?? 0.3,
        }),
        signal: AbortSignal.timeout(timeout),
      });

      if (res.status === 429 || res.status === 503) {
        const delay = (attempt + 1) * 5000;
        console.log(`[Anthropic] Rate limited, retrying in ${delay}ms...`);
        await sleep(delay);
        attempt++;
        continue;
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);

      const data = (await res.json()) as {
        content: Array<{ type: string; text?: string }>;
        usage: { input_tokens: number; output_tokens: number };
        stop_reason?: string;
      };

      const textBlock = data.content?.find((b) => b.type === "text");
      const content = textBlock?.text ?? "";

      return { content, usage: data.usage, stopReason: data.stop_reason };
    } catch (e) {
      if (attempt < 3 && (e as Error).message.includes("429")) {
        attempt++;
        await sleep((attempt + 1) * 5000);
        continue;
      }
      throw e;
    }
  }
}

async function chatKyma(
  messages: LLMMessage[],
  opts: {
    model?: string;
    system?: string;
    temperature?: number;
    maxTokens?: number;
    timeout?: number;
  },
): Promise<LLMResponse> {
  // Kyma uses OpenAI-compatible /v1/chat/completions endpoint
  const base = config.kymaBaseUrl.replace(/\/$/, "");
  const apiKey = config.kymaApiKey;

  if (!apiKey) throw new Error("KYMA_API_KEY is not set");

  const body: Record<string, unknown> = {
    model: opts.model ?? "qwen-3.6-plus",
    messages: opts.system
      ? [{ role: "system", content: opts.system }, ...messages]
      : messages,
    max_tokens: opts.maxTokens ?? 4096,
    temperature: opts.temperature ?? 0.3,
  };

  const timeout = opts.timeout ?? 360_000;

  let attempt = 0;
  while (true) {
    try {
      const res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeout),
      });

      if (res.status === 429 || res.status === 503 || res.status === 502) {
        const delay = (attempt + 1) * 5000;
        console.log(`[Kyma] Rate limited/502, retrying in ${delay}ms...`);
        await sleep(delay);
        attempt++;
        continue;
      }

      // 500 = model busy, retry
      if (res.status === 500) {
        const delay = (attempt + 1) * 8000;
        console.log(`[Kyma] Model busy (500), retrying in ${delay}ms...`);
        await sleep(delay);
        attempt++;
        continue;
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);

      const data = (await res.json()) as {
        choices: Array<{
          message: { content: string | null };
          finish_reason: string;
        }>;
        usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
      };

      const content = data.choices[0]?.message.content ?? "";

      return {
        content,
        usage: {
          input_tokens: data.usage.prompt_tokens,
          output_tokens: data.usage.completion_tokens,
        },
        stopReason: data.choices[0]?.finish_reason,
      };
    } catch (e) {
      if (attempt < 3 && ((e as Error).message.includes("429") || (e as Error).message.includes("502") || (e as Error).message.includes("500"))) {
        attempt++;
        await sleep((attempt + 1) * 5000);
        continue;
      }
      throw e;
    }
  }
}

async function chatOpenAI(
  messages: LLMMessage[],
  opts: {
    model?: string;
    system?: string;
    temperature?: number;
    maxTokens?: number;
    timeout?: number;
  },
): Promise<LLMResponse> {
  const apiKey = config.openaiApiKey || config.anthropicApiKey;
  const baseUrl = config.openaiBaseUrl || "https://api.openai.com/v1";
  const base = baseUrl.replace(/\/$/, "");

  // Support o1/o3 which don't support temperature
  const isReasoningModel = (opts.model ?? "").startsWith("o1") || (opts.model ?? "").startsWith("o3");

  const body: Record<string, unknown> = {
    model: opts.model ?? "gpt-4o",
    messages: opts.system
      ? [{ role: "system", content: opts.system }, ...messages]
      : messages,
    max_completion_tokens: opts.maxTokens,
    ...(isReasoningModel
      ? {}
      : { temperature: opts.temperature ?? 0.3 }),
  };

  const timeout = opts.timeout ?? 360_000;

  let attempt = 0;
  while (true) {
    try {
      const res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeout),
      });

      if (res.status === 429 || res.status === 503) {
        const delay = (attempt + 1) * 5000;
        console.log(`[OpenAI] Rate limited, retrying in ${delay}ms...`);
        await sleep(delay);
        attempt++;
        continue;
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);

      const data = (await res.json()) as {
        choices: Array<{
          message: { content: string | null };
          finish_reason: string;
        }>;
        usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
      };

      const content = data.choices[0]?.message.content ?? "";

      return {
        content,
        usage: {
          input_tokens: data.usage.prompt_tokens,
          output_tokens: data.usage.completion_tokens,
        },
        stopReason: data.choices[0]?.finish_reason,
      };
    } catch (e) {
      if (attempt < 3 && (e as Error).message.includes("429")) {
        attempt++;
        await sleep((attempt + 1) * 5000);
        continue;
      }
      throw e;
    }
  }
}

async function chatGroq(
  messages: LLMMessage[],
  opts: {
    model?: string;
    system?: string;
    temperature?: number;
    maxTokens?: number;
    timeout?: number;
  },
): Promise<LLMResponse> {
  const apiKey = config.groqApiKey || "gsk_placeholder";
  const base = (config.groqBaseUrl || "https://api.groq.com/openai/v1").replace(/\/$/, "");

  const body: Record<string, unknown> = {
    model: opts.model ?? "llama-3.3-70b-versatile",
    messages: opts.system
      ? [{ role: "system", content: opts.system }, ...messages]
      : messages,
    max_tokens: opts.maxTokens ?? 2048,
    temperature: opts.temperature ?? 0.3,
  };

  let attempt = 0;
  while (true) {
    try {
      const res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(opts.timeout ?? 60_000),
      });

      if (res.status === 429) {
        attempt++;
        const delay = attempt * 3000;
        console.log(`[Groq] Rate limited, retry ${attempt}/3 in ${delay}ms...`);
        await sleep(delay);
        continue;
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);

      const data = (await res.json()) as {
        choices: Array<{ message: { content: string }; finish_reason: string }>;
        usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
      };

      return {
        content: data.choices[0]?.message.content ?? "",
        usage: {
          input_tokens: data.usage.prompt_tokens,
          output_tokens: data.usage.completion_tokens,
        },
        stopReason: data.choices[0]?.finish_reason,
      };
    } catch (e) {
      if (attempt < 3) {
        attempt++;
        await sleep(3000);
        continue;
      }
      throw e;
    }
  }
}

async function chatOllama(
  messages: LLMMessage[],
  opts: {
    model?: string;
    system?: string;
    temperature?: number;
    maxTokens?: number;
    timeout?: number;
  },
): Promise<LLMResponse> {
  const base = (config.ollamaBaseUrl || "http://localhost:11434").replace(/\/$/, "");

  const body: Record<string, unknown> = {
    model: opts.model ?? "llama3.2",
    messages: opts.system
      ? [{ role: "system", content: opts.system }, ...messages]
      : messages,
    options: {
      temperature: opts.temperature ?? 0.3,
      num_predict: opts.maxTokens ?? 4096,
    },
    stream: false,
  };

  const timeout = opts.timeout ?? 360_000;

  const res = await fetch(`${base}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeout),
  });

  if (!res.ok) throw new Error(`Ollama error: HTTP ${res.status}: ${await res.text()}`);

  const data = (await res.json()) as {
    message: { content: string };
    done_reason?: string;
    prompt_eval_count?: number;
    eval_count?: number;
  };

  return {
    content: data.message.content,
    usage: {
      input_tokens: data.prompt_eval_count ?? 0,
      output_tokens: data.eval_count ?? 0,
    },
    stopReason: data.done_reason,
  };
}

async function chatLMStudio(
  messages: LLMMessage[],
  opts: {
    model?: string;
    system?: string;
    temperature?: number;
    maxTokens?: number;
    timeout?: number;
  },
): Promise<LLMResponse> {
  // LM Studio uses OpenAI-compatible API
  const base = (config.lmStudioBaseUrl || "http://localhost:1234/v1").replace(/\/$/, "");
  const apiKey = config.lmStudioApiKey || "lm-studio";

  const body: Record<string, unknown> = {
    model: opts.model ?? "local-model",
    messages: opts.system
      ? [{ role: "system", content: opts.system }, ...messages]
      : messages,
    max_tokens: opts.maxTokens ?? 4096,
    temperature: opts.temperature ?? 0.3,
  };

  const timeout = opts.timeout ?? 360_000;

  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeout),
  });

  if (!res.ok) throw new Error(`LM Studio error: HTTP ${res.status}: ${await res.text()}`);

  const data = (await res.json()) as {
    choices: Array<{ message: { content: string }; finish_reason: string }>;
    usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  };

  return {
    content: data.choices[0]?.message.content ?? "",
    usage: {
      input_tokens: data.usage.prompt_tokens,
      output_tokens: data.usage.completion_tokens,
    },
    stopReason: data.choices[0]?.finish_reason,
  };
}

async function chatVLLM(
  messages: LLMMessage[],
  opts: {
    model?: string;
    system?: string;
    temperature?: number;
    maxTokens?: number;
    timeout?: number;
  },
): Promise<LLMResponse> {
  // vLLM uses OpenAI-compatible API
  const base = (config.vllmBaseUrl || "http://localhost:8000/v1").replace(/\/$/, "");
  const apiKey = config.vllmApiKey || "EMPTY";

  const body: Record<string, unknown> = {
    model: opts.model ?? "meta-llama/Llama-3.1-8B-Instruct",
    messages: opts.system
      ? [{ role: "system", content: opts.system }, ...messages]
      : messages,
    max_tokens: opts.maxTokens ?? 4096,
    temperature: opts.temperature ?? 0.3,
  };

  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(opts.timeout ?? 360_000),
  });

  if (!res.ok) throw new Error(`vLLM error: HTTP ${res.status}: ${await res.text()}`);

  const data = (await res.json()) as {
    choices: Array<{ message: { content: string }; finish_reason: string }>;
    usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  };

  return {
    content: data.choices[0]?.message.content ?? "",
    usage: {
      input_tokens: data.usage.prompt_tokens,
      output_tokens: data.usage.completion_tokens,
    },
    stopReason: data.choices[0]?.finish_reason,
  };
}

async function chatFireworks(
  messages: LLMMessage[],
  opts: {
    model?: string;
    system?: string;
    temperature?: number;
    maxTokens?: number;
    timeout?: number;
  },
): Promise<LLMResponse> {
  const apiKey = config.fireworksApiKey || "";
  const base = "https://api.fireworks.ai/inference/v1";

  const body: Record<string, unknown> = {
    model: opts.model ?? "accounts/fireworks/models/llama-v3p3-70b-instruct",
    messages: opts.system
      ? [{ role: "system", content: opts.system }, ...messages]
      : messages,
    max_tokens: opts.maxTokens ?? 4096,
    temperature: opts.temperature ?? 0.3,
  };

  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(opts.timeout ?? 360_000),
  });

  if (!res.ok) throw new Error(`Fireworks error: HTTP ${res.status}: ${await res.text()}`);

  const data = (await res.json()) as {
    choices: Array<{ message: { content: string }; finish_reason: string }>;
    usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  };

  return {
    content: data.choices[0]?.message.content ?? "",
    usage: {
      input_tokens: data.usage.prompt_tokens,
      output_tokens: data.usage.completion_tokens,
    },
    stopReason: data.choices[0]?.finish_reason,
  };
}

async function chatHuggingFace(
  messages: LLMMessage[],
  opts: {
    model?: string;
    system?: string;
    temperature?: number;
    maxTokens?: number;
    timeout?: number;
  },
): Promise<LLMResponse> {
  const hfToken = process.env.HF_TOKEN;
  if (!hfToken) throw new Error("HF_TOKEN is not set — get one at huggingface.co/settings/tokens");

  const model = opts.model ?? "Qwen/Qwen3.5-9B";
  const base = "https://api-inference.huggingface.co/v1/chat/completions";

  // Build messages in HuggingFace format
  const hfMessages: Array<{ role: string; content: string }> = [];
  if (opts.system) {
    hfMessages.push({ role: "system", content: opts.system });
  }
  for (const m of messages) {
    hfMessages.push({ role: m.role, content: m.content });
  }

  const body: Record<string, unknown> = {
    model,
    messages: hfMessages,
    max_tokens: opts.maxTokens ?? 4096,
    temperature: opts.temperature ?? 0.3,
  };

  const timeout = opts.timeout ?? 360_000;

  let attempt = 0;
  while (true) {
    try {
      const res = await fetch(`${base}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${hfToken}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeout),
      });

      // Model may still be loading — retry after delay
      if (res.status === 503) {
        const wait = (attempt + 1) * 10_000;
        console.log(`[HuggingFace] Model ${model} loading (503), retrying in ${wait}ms...`);
        await sleep(wait);
        attempt++;
        continue;
      }

      if (!res.ok) throw new Error(`HuggingFace error: HTTP ${res.status}: ${await res.text()}`);

      const data = (await res.json()) as {
        choices: Array<{ message: { content: string }; finish_reason: string }>;
        usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
      };

      const content = data.choices[0]?.message.content ?? "";

      return {
        content,
        usage: {
          input_tokens: data.usage?.prompt_tokens ?? 0,
          output_tokens: data.usage?.completion_tokens ?? 0,
        },
        stopReason: data.choices[0]?.finish_reason,
      };
    } catch (e) {
      if (attempt < 3 && (e as Error).message.includes("503")) {
        attempt++;
        await sleep((attempt + 1) * 10_000);
        continue;
      }
      throw e;
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
