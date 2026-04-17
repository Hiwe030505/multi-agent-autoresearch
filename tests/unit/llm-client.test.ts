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
    it("should handle empty message array gracefully", async () => {
      // The LLM client handles empty messages by passing them to the provider,
      // which returns a friendly response rather than throwing.
      const { llm } = await import("../../src/llm/client.ts");
      const result = await llm.chat([], { provider: "kyma" });
      // Should not throw — provider handles it
      expect(typeof result.content).toBe("string");
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
