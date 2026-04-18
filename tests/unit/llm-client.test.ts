/**
 * Unit tests — LLM Client
 * Tests: message formatting, streaming detection, token counting
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { config } from "../../src/config.ts";

describe("LLM Client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("Message formatting", () => {
    it("should throw on missing API key", async () => {
      // When no API key is configured, the provider should throw a clear error.
      const { llm } = await import("../../src/llm/client.ts");
      // KYMA_API_KEY is not set in test env → should throw
      await expect(
        llm.chat([{ role: "user", content: "test" }], { provider: "kyma" }),
      ).rejects.toThrow("KYMA_API_KEY is not set");
    });

    it("should throw on unknown provider", async () => {
      const { llm } = await import("../../src/llm/client.ts");
      // Unknown provider should throw
      await expect(
        llm.chat([{ role: "user", content: "hi" }], { provider: "unknown_provider" as any }),
      ).rejects.toThrow("Unknown LLM provider");
    });
  });

  describe("Provider routing", () => {
    it("should throw on unknown provider", async () => {
      const { llm } = await import("../../src/llm/client.ts");
      await expect(
        llm.chat([{ role: "user", content: "hi" }], { provider: "unknown_provider" as any }),
      ).rejects.toThrow("Unknown LLM provider");
    });
  });
});
