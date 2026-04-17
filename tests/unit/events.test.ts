/**
 * Unit tests — Event Emitter (hub/events.ts)
 *
 * Tests in-process event emission without requiring Redis.
 * The InMemoryEventStore is always used as fallback so these tests
 * run deterministically with no external dependencies.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  emit,
  emitAgentStart,
  emitAgentComplete,
  emitAgentError,
  emitPhase,
  emitThinking,
  emitInsight,
  emitFinding,
  getSessionEvents,
  clearSessionEvents,
} from "../../src/hub/events.ts";

describe("Event Emitter", () => {
  const SESSION = "test-session-unit";

  beforeEach(() => {
    clearSessionEvents(SESSION);
  });

  // ─── emit helpers ─────────────────────────────────────────────────────────

  it("emit() stores an event with correct fields", () => {
    emit(SESSION, "orchestrator.start", { foo: "bar" }, { title: "Test", progress: 50 });
    const events = getSessionEvents(SESSION);
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("orchestrator.start");
    expect(events[0]!.data).toEqual({ foo: "bar" });
    expect(events[0]!.title).toBe("Test");
    expect(events[0]!.progress).toBe(50);
    expect(events[0]!.sessionId).toBe(SESSION);
    expect(events[0]!.id).toBeTruthy();
    expect(events[0]!.timestamp).toBeTruthy();
  });

  it("emitAgentStart() sets agent + task fields", () => {
    emitAgentStart(SESSION, "researcher", "Searching web for RAG papers");
    const events = getSessionEvents(SESSION);
    expect(events[0]!.type).toBe("agent.start");
    expect(events[0]!.data).toMatchObject({ agent: "researcher", task: "Searching web for RAG papers" });
  });

  it("emitAgentComplete() sets progress to 100", () => {
    emitAgentComplete(SESSION, "reasoner", "Found 3 key insights");
    const events = getSessionEvents(SESSION);
    expect(events[0]!.type).toBe("agent.complete");
    expect(events[0]!.data).toMatchObject({ agent: "reasoner", summary: "Found 3 key insights" });
    expect(events[0]!.progress).toBe(100);
  });

  it("emitAgentError() records error message", () => {
    emitAgentError(SESSION, "researcher", "Network timeout after 30s");
    const events = getSessionEvents(SESSION);
    expect(events[0]!.type).toBe("agent.error");
    expect(events[0]!.data).toMatchObject({ agent: "researcher", error: "Network timeout after 30s" });
  });

  it("emitPhase() stores phase + progress", () => {
    emitPhase(SESSION, "Deep Research", "running", 65);
    const events = getSessionEvents(SESSION);
    expect(events[0]!.type).toBe("orchestrator.phase");
    expect(events[0]!.data).toMatchObject({ phase: "Deep Research", status: "running" });
    expect(events[0]!.progress).toBe(65);
  });

  it("emitThinking() stores strategy + thought + insight", () => {
    emitThinking(SESSION, "reasoner", "Chain-of-thought", "Let me analyze the user's query...", "Key insight found");
    const events = getSessionEvents(SESSION);
    expect(events[0]!.type).toBe("reasoner.thinking");
    expect(events[0]!.data).toMatchObject({
      agent: "reasoner",
      strategy: "Chain-of-thought",
      thought: "Let me analyze the user's query...",
      insight: "Key insight found",
    });
  });

  it("emitInsight() stores confidence", () => {
    emitInsight(SESSION, "RAG improves factual accuracy", 0.92, "finding");
    const events = getSessionEvents(SESSION);
    expect(events[0]!.type).toBe("reasoner.insight");
    expect(events[0]!.data).toMatchObject({
      insight: "RAG improves factual accuracy",
      confidence: 0.92,
      type: "finding",
    });
  });

  it("emitFinding() stores title + source + confidence", () => {
    emitFinding(SESSION, "Attention Is All You Need", "https://arxiv.org/abs/1706.03762", 0.98);
    const events = getSessionEvents(SESSION);
    expect(events[0]!.type).toBe("researcher.found");
    expect(events[0]!.data).toMatchObject({
      title: "Attention Is All You Need",
      source: "https://arxiv.org/abs/1706.03762",
      confidence: 0.98,
    });
  });

  // ─── getSessionEvents ────────────────────────────────────────────────────

  it("getSessionEvents() returns events for a session", () => {
    emit(SESSION, "orchestrator.start", {});
    emit(SESSION, "agent.start", { agent: "researcher", task: "search" });
    const events = getSessionEvents(SESSION);
    expect(events).toHaveLength(2);
    expect(events[0]!.type).toBe("orchestrator.start");
    expect(events[1]!.type).toBe("agent.start");
  });

  it("getSessionEvents() returns empty array for unknown session", () => {
    const events = getSessionEvents("unknown-session-xyz");
    expect(events).toEqual([]);
  });

  it("clearSessionEvents() removes all events for a session", () => {
    emit(SESSION, "orchestrator.start", {});
    emit(SESSION, "agent.start", { agent: "researcher", task: "search" });
    clearSessionEvents(SESSION);
    expect(getSessionEvents(SESSION)).toEqual([]);
  });

  // ─── Event ordering ─────────────────────────────────────────────────────

  it("events are stored in emission order", () => {
    for (let i = 0; i < 5; i++) {
      emit(SESSION, "agent.heartbeat", { index: i });
    }
    const events = getSessionEvents(SESSION);
    for (let i = 0; i < 5; i++) {
      expect((events[i]!.data as { index: number }).index).toBe(i);
    }
  });

  // ─── Event ID uniqueness ────────────────────────────────────────────────

  it("each event has a unique id", () => {
    emit(SESSION, "agent.heartbeat", {});
    emit(SESSION, "agent.heartbeat", {});
    emit(SESSION, "agent.heartbeat", {});
    const events = getSessionEvents(SESSION);
    const ids = new Set(events.map((e) => e.id));
    expect(ids.size).toBe(events.length);
  });
});
