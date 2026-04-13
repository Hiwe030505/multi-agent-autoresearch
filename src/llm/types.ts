/**
 * LLM Client — Type definitions
 */

export type LLMProvider =
  | "anthropic"
  | "kyma"
  | "openai"
  | "groq"
  | "ollama"
  | "lmstudio"
  | "vllm"
  | "fireworks"
  | "huggingface";

export interface LLMMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface LLMResponse {
  content: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
  stopReason?: string;
}

export interface LLMOptions {
  /** Provider: anthropic | openai | groq | ollama | lmstudio | vllm | fireworks */
  provider?: LLMProvider;
  /** Model name (auto-inferred from shortcuts if omitted) */
  model?: string;
  /** System prompt */
  system?: string;
  /** Temperature 0.0–1.0 (default: 0.3) */
  temperature?: number;
  /** Max tokens in response (default: 4096) */
  maxTokens?: number;
  /** Timeout in ms (default: 360000 for cloud, varies for local) */
  timeout?: number;
}

/** Per-agent recommended model + provider mappings */
export const AGENT_MODELS: Record<
  string,
  {
    primary: { model: string; provider: LLMProvider; reason: string };
    fallback?: { model: string; provider: LLMProvider };
    local?: { model: string; provider: LLMProvider; minRAM: string; note: string };
  }
> = {
  orchestrator: {
    primary: {
      model: "claude-opus-4-6",
      provider: "anthropic",
      reason: "Best for task decomposition and complex reasoning",
    },
    fallback: {
      model: "gpt-4o",
      provider: "openai",
    },
    local: {
      model: "llama3.1:70b-instruct-q4_K_M",
      provider: "ollama",
      minRAM: "80GB VRAM",
      note: "7B is too weak for orchestration; 70B minimum for acceptable quality",
    },
  },

  reasoning: {
    primary: {
      model: "claude-opus-4-6",
      provider: "anthropic",
      reason: "Best for multi-step reasoning and complex analysis",
    },
    fallback: {
      model: "gpt-4o",
      provider: "openai",
    },
    local: {
      model: "llama3.1:70b-instruct-q4_K_M",
      provider: "ollama",
      minRAM: "80GB VRAM",
      note: "Deep reasoning requires larger models; use 70B+ only",
    },
  },

  research: {
    primary: {
      model: "claude-sonnet-4-6",
      provider: "anthropic",
      reason: "Fast, good at synthesis and summarization",
    },
    fallback: {
      model: "gpt-4o-mini",
      provider: "openai",
    },
    local: {
      model: "llama3.2:3b-instruct",
      provider: "ollama",
      minRAM: "4GB VRAM",
      note: "Small model OK for research scraping — fast & cheap",
    },
  },

  coder: {
    primary: {
      model: "claude-sonnet-4-6",
      provider: "anthropic",
      reason: "Excellent code generation, follows best practices",
    },
    fallback: {
      model: "gpt-4o",
      provider: "openai",
    },
    local: {
      model: "codellama:34b-instruct-q4_K_M",
      provider: "ollama",
      minRAM: "24GB VRAM",
      note: "Specialized for code; 34B+ recommended for complex tasks",
    },
  },

  analyst: {
    primary: {
      model: "claude-sonnet-4-6",
      provider: "anthropic",
      reason: "Good statistical reasoning and data interpretation",
    },
    fallback: {
      model: "gpt-4o",
      provider: "openai",
    },
    local: {
      model: "qwen2.5:32b-instruct-q4_K_M",
      provider: "ollama",
      minRAM: "24GB VRAM",
      note: "Qwen 32B has strong math/code performance at lower VRAM",
    },
  },

  writer: {
    primary: {
      model: "claude-opus-4-6",
      provider: "anthropic",
      reason: "Best writing quality, nuanced and well-structured",
    },
    fallback: {
      model: "gpt-4o",
      provider: "openai",
    },
    local: {
      model: "llama3.1:8b-instruct-q4_K_M",
      provider: "ollama",
      minRAM: "8GB VRAM",
      note: "8B OK for writing tasks — faster than larger models",
    },
  },

  reviewer: {
    primary: {
      model: "claude-opus-4-6",
      provider: "anthropic",
      reason: "Critical thinking, thorough verification",
    },
    fallback: {
      model: "gpt-4o",
      provider: "openai",
    },
    local: {
      model: "llama3.1:70b-instruct-q4_K_M",
      provider: "ollama",
      minRAM: "80GB VRAM",
      note: "Review requires strong reasoning — use largest model",
    },
  },
};

/** Quick comparison table for common tasks */
export const MODEL_BENCHMARKS = {
  code_generation: [
    { model: "claude-opus-4-6", provider: "Anthropic", score: 95, cost: "high" },
    { model: "claude-sonnet-4-6", provider: "Anthropic", score: 90, cost: "medium" },
    { model: "gpt-4o", provider: "OpenAI", score: 92, cost: "high" },
    { model: "gpt-4o-mini", provider: "OpenAI", score: 82, cost: "low" },
    { model: "codellama:34b", provider: "Ollama", score: 78, cost: "free" },
    { model: "qwen2.5-coder:32b", provider: "Ollama", score: 80, cost: "free" },
  ],
  reasoning_analysis: [
    { model: "claude-opus-4-6", provider: "Anthropic", score: 97, cost: "high" },
    { model: "gpt-4o", provider: "OpenAI", score: 93, cost: "high" },
    { model: "o1", provider: "OpenAI", score: 96, cost: "very_high" },
    { model: "llama-3.3-70b", provider: "Groq", score: 85, cost: "low" },
    { model: "llama3.1:70b", provider: "Ollama", score: 82, cost: "free" },
  ],
  fast_summarization: [
    { model: "claude-haiku-4-7", provider: "Anthropic", score: 75, cost: "low" },
    { model: "gpt-4o-mini", provider: "OpenAI", score: 80, cost: "low" },
    { model: "llama3.2:3b", provider: "Ollama", score: 68, cost: "free" },
    { model: "llama3.2:1b", provider: "Ollama", score: 60, cost: "free" },
  ],
  writing_quality: [
    { model: "claude-opus-4-6", provider: "Anthropic", score: 98, cost: "high" },
    { model: "gpt-4o", provider: "OpenAI", score: 92, cost: "high" },
    { model: "llama3.1:8b", provider: "Ollama", score: 72, cost: "free" },
  ],
};
