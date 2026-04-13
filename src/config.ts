import { readFileSync } from "fs";
import { resolve } from "path";

// Load .env only for local dev (when not already set by environment)
const envPath = resolve(process.cwd(), ".env");
try {
  const raw = readFileSync(envPath, "utf-8");
  for (const line of raw.split("\n")) {
    const [key, ...vals] = line.split("=");
    if (key && vals.length) {
      const k = key.trim();
      // Only set from .env if not already set by environment
      if (!process.env[k]) {
        process.env[k] = vals.join("=").trim();
      }
    }
  }
} catch {
  // .env not found — rely on environment variables directly
}

export const config = {
  // ─── Server ──────────────────────────────────────────────────────────────
  port: parseInt(process.env.PORT ?? "3001", 10),
  nodeEnv: process.env.NODE_ENV ?? "development",

  // ─── Kyma AI API (primary — Anthropic-compatible) ─────────────────────
  // Sign up: https://api.kyma.ai
  kymaApiKey: process.env.KYMA_API_KEY ?? "",
  kymaBaseUrl: process.env.KYMA_BASE_URL ?? "https://kymaapi.com/v1",

  // ─── Anthropic (Claude) — direct ───────────────────────────────────────
  // Required: your API key from console.anthropic.com
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  anthropicBaseUrl: process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com",

  // ─── OpenAI (GPT-4, o1, embeddings) ───────────────────────────────────
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  openaiBaseUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",

  // ─── Groq (fast, cheap inference) ──────────────────────────────────────
  // Free tier: 30 req/min. Get key at console.groq.com
  groqApiKey: process.env.GROQ_API_KEY ?? "",
  groqBaseUrl: process.env.GROQ_BASE_URL ?? "https://api.groq.com/openai/v1",

  // ─── Ollama (local models) ────────────────────────────────────────────
  // Run: `ollama serve`. No API key needed.
  // Install models: `ollama pull llama3.2`, `ollama pull qwen2.5`, etc.
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434",

  // ─── LM Studio (local models, GUI) ───────────────────────────────────
  // Run LM Studio, enable "OpenAI-compatible API" in server settings.
  // Default: http://localhost:1234/v1
  lmStudioBaseUrl: process.env.LMSTUDIO_BASE_URL ?? "http://localhost:1234/v1",
  lmStudioApiKey: process.env.LMSTUDIO_API_KEY ?? "lm-studio",

  // ─── vLLM (self-hosted production) ─────────────────────────────────
  // Run: `python -m vllm.entrypoints.openai.api_server --model meta-llama/Llama-3.1-8B-Instruct`
  vllmBaseUrl: process.env.VLLM_BASE_URL ?? "http://localhost:8000/v1",
  vllmApiKey: process.env.VLLM_API_KEY ?? "EMPTY",

  // ─── Fireworks AI (fast inference) ───────────────────────────────────
  // Sign up at fireworks.ai — very fast, good pricing
  fireworksApiKey: process.env.FIREWORKS_API_KEY ?? "",

  // ─── Database ──────────────────────────────────────────────────────────
  databaseUrl: process.env.DATABASE_URL ?? "",
  postgresPassword: process.env.POSTGRES_PASSWORD ?? (
    process.env.NODE_ENV === "production"
      ? (() => { throw new Error("POSTGRES_PASSWORD must be set in production"); })() as unknown as string
      : "ar_password_2026"
  ),

  // ─── Redis ─────────────────────────────────────────────────────────────
  redisUrl: process.env.REDIS_URL ?? (
    process.env.NODE_ENV === "production"
      ? (() => { throw new Error("REDIS_URL must be set in production"); })() as unknown as string
      : "redis://:ar_redis_2026@localhost:6380"
  ),

  // ─── Model Selection per Agent ────────────────────────────────────────
  //
  // Priority order for each agent:
  // 1. Use Claude (best quality)
  // 2. Fallback to Groq (fast + cheap for non-critical tasks)
  // 3. Fallback to local Ollama (free, private)
  //
  // Change model names to match what you have installed:
  //   Groq models: llama-3.3-70b-versatile, mixtral-8x7b-32768,
  //                llama-3.1-70b-versatile, gemma2-9b-it
  //   Ollama models: ollama list (to see installed)
  models: {
    orchestrator: "llama-3.3-70b",
    reasoning:    "llama-3.3-70b",
    research:     "llama-3.3-70b",
    coder:         "qwen-3-coder",
    analyst:       "qwen-3-32b",
    writer:        "llama-3.3-70b",
    reviewer:       "llama-3.3-70b",

    // Fast fallback models (used when primary is unavailable/failed)
    // Groq is great here — free tier, very fast
    fastFallback:  "llama-3.3-70b-versatile",
  },

  // ─── Reasoning Agent ───────────────────────────────────────────────────
  reasoning: {
    minConfidence: 0.7,
    maxInsightsPerSession: 10,
    embeddingModel: "text-embedding-3-small",
    embeddingDim: 1536,
  },

  // ─── Orchestrator ──────────────────────────────────────────────────────
  orchestrator: {
    pollIntervalMs: 30_000,
    maxRetries: 3,
    heartbeatTimeoutMs: 30_000,
  },

  // ─── LLM Fallback Chain ───────────────────────────────────────────────
  //
  // When primary model fails (rate limit, error), try these in order.
  // Each entry: { provider, model, cost }
  llmFallbackChain: [
    { provider: "anthropic" as const, model: "claude-sonnet-4-6" },
    { provider: "groq" as const, model: "llama-3.3-70b-versatile" },
    { provider: "openai" as const, model: "gpt-4o-mini" },
    { provider: "ollama" as const, model: "llama3.2" },
  ],
};
