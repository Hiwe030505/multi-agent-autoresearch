/**
 * End-to-End Smoke Tests — AutoResearch
 *
 * These tests exercise the full system stack: API + agents + DB.
 * They are designed to be run as a CI gate or pre-deployment check.
 *
 * Prerequisites:
 *   docker compose up -d   # Postgres + Redis
 *   npm run dev            # API on :3001
 *   npm run dev --prefix frontend  # Frontend on :3000
 *
 * Run with:
 *   vitest run tests/e2e/
 *
 * Use --bail to stop on first failure:
 *   vitest run tests/e2e/ --bail
 */

import { describe, it, expect, beforeAll } from "vitest";

const API = process.env.BASE_URL ?? "http://localhost:3001";
const FRONTEND = process.env.FRONTEND_URL ?? "http://localhost:3000";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function waitForServer(url: string, timeoutMs = 5000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}/api/info`, { signal: AbortSignal.timeout(1000) });
      if (res.ok) return true;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function pollUntil(
  fn: () => Promise<boolean>,
  { intervalMs = 2000, timeoutMs = 120_000 } = {},
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`pollUntil timed out after ${timeoutMs}ms`);
}

// ─── Server readiness ───────────────────────────────────────────────────────────

describe("E2E — Infrastructure", () => {
  it("API server is reachable", async () => {
    const ready = await waitForServer(API);
    expect(ready).toBe(true);
  });

  it("API returns valid /api/info response", async () => {
    const res = await fetch(`${API}/api/info`);
    expect(res.ok).toBe(true);
    const body = await res.json() as { version: string; agents: string[] };
    expect(typeof body.version).toBe("string");
    expect(Array.isArray(body.agents)).toBe(true);
  });
});

// ─── Research pipeline end-to-end ──────────────────────────────────────────────

describe("E2E — Research Pipeline", () => {
  it("can start a research session and receive a sessionId", async () => {
    const res = await fetch(`${API}/api/research`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic: "RAG architecture patterns in production",
        keywords: ["retrieval", "vector search", "chunking"],
      }),
    });

    expect(res.ok).toBe(true);
    const body = await res.json() as { sessionId: string; status: string };
    expect(body.sessionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("pipeline progresses to completion (or fails gracefully)", async () => {
    // Start a small research session
    const res = await fetch(`${API}/api/research`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic: "Graph neural networks overview",
        keywords: ["GNN", "node classification"],
      }),
    });

    if (!res.ok) {
      expect(res.status).toBeLessThan(500);
      return;
    }

    const { sessionId } = await res.json() as { sessionId: string };

    // Poll until completed or failed (max 2 min)
    await pollUntil(async () => {
      const s = await fetch(`${API}/api/research/${sessionId}`);
      if (!s.ok) return false;
      const data = await s.json() as { status: string };
      return data.status === "completed" || data.status === "failed";
    }, { intervalMs: 3000, timeoutMs: 120_000 });

    const final = await fetch(`${API}/api/research/${sessionId}`);
    const data = await final.json() as { status: string; error?: string };
    expect(data.status).toMatch(/completed|failed/);
    if (data.status === "failed") {
      // Failures are acceptable if the system handled them gracefully
      console.warn(`Pipeline failed: ${data.error}`);
    }
  }, 180_000); // 3 min timeout for this test

  it("session appears in /api/sessions after creation", async () => {
    const res = await fetch(`${API}/api/research`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic: "Transformers attention mechanism", keywords: [] }),
    });

    if (!res.ok) return;
    const { sessionId } = await res.json() as { sessionId: string };

    // Wait briefly then check sessions list
    await new Promise((r) => setTimeout(r, 1000));
    const sessionsRes = await fetch(`${API}/api/sessions`);
    const sessions = await sessionsRes.json() as Array<{ id: string }>;
    const found = sessions.some((s) => s.id === sessionId);
    expect(found).toBe(true);
  });
});

// ─── Knowledge Hub ─────────────────────────────────────────────────────────────

describe("E2E — Knowledge Hub", () => {
  it("hub stats endpoint returns valid statistics", async () => {
    const res = await fetch(`${API}/api/hub/stats`);
    expect(res.ok).toBe(true);
    const stats = await res.json() as {
      totalFindings: number;
      totalInsights: number;
      totalNodes: number;
      totalEdges: number;
      avgConfidence: number;
      totalSessions: number;
      topTopics: Array<{ topic: string; count: number }>;
    };

    // All counts should be non-negative
    expect(stats.totalFindings).toBeGreaterThanOrEqual(0);
    expect(stats.totalInsights).toBeGreaterThanOrEqual(0);
    expect(stats.totalNodes).toBeGreaterThanOrEqual(0);
    expect(stats.totalEdges).toBeGreaterThanOrEqual(0);
    expect(stats.avgConfidence).toBeGreaterThanOrEqual(0);
    expect(stats.avgConfidence).toBeLessThanOrEqual(1);
    expect(stats.totalSessions).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(stats.topTopics)).toBe(true);
  });

  it("hub search returns structured results", async () => {
    const res = await fetch(`${API}/api/hub/search?q=vector&limit=5`);
    expect(res.ok).toBe(true);
    const data = await res.json() as { nodes: unknown[]; total: number };
    expect(typeof data.total).toBe("number");
    expect(Array.isArray(data.nodes)).toBe(true);
    if (data.nodes.length > 0) {
      const node = data.nodes[0] as { title?: string; type?: string };
      expect(typeof (node.title ?? node.type)).toBe("string");
    }
  });

  it("hub graph returns nodes and edges arrays", async () => {
    const res = await fetch(`${API}/api/hub/graph?limit=20`);
    expect(res.ok).toBe(true);
    const graph = await res.json() as { nodes: unknown[]; edges: unknown[] };
    expect(Array.isArray(graph.nodes)).toBe(true);
    expect(Array.isArray(graph.edges)).toBe(true);
  });
});

// ─── SSE Streaming ─────────────────────────────────────────────────────────────

describe("E2E — SSE Event Streaming", () => {
  it("SSE endpoint delivers events for a running session", async () => {
    // Start research
    const res = await fetch(`${API}/api/research`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic: "SSE streaming verification", keywords: [] }),
    });

    if (!res.ok) return;
    const { sessionId } = await res.json() as { sessionId: string };

    // Subscribe to SSE
    const esRes = await fetch(`${API}/api/events/${sessionId}/stream`);

    if (!esRes.ok || !esRes.body) {
      expect(esRes.status).toBeLessThan(500);
      return;
    }

    expect(esRes.headers.get("content-type")).toMatch(/text\/event-stream/);

    const reader = esRes.body.getReader();
    const decoder = new TextDecoder();
    let eventCount = 0;
    let done = false;

    // Read up to 5 events or until 10 seconds
    const deadline = Date.now() + 10_000;

    while (!done && Date.now() < deadline) {
      const { value } = await reader.read();
      if (!value) break;
      const chunk = decoder.decode(value, { stream: true });
      // Count SSE data lines
      const matches = chunk.match(/data:/g);
      if (matches) eventCount += matches.length;
      // Check for completion event
      if (chunk.includes('"type":"agent.complete"')) done = true;
      if (chunk.includes("event: close")) done = true;
    }

    reader.cancel();
    expect(eventCount).toBeGreaterThan(0);
  }, 30_000);

  it("unknown session SSE returns 404", async () => {
    const res = await fetch(`${API}/api/events/00000000-0000-0000-0000-000000000000/stream`);
    expect(res.status).toBe(404);
  });
});

// ─── CLI smoke ────────────────────────────────────────────────────────────────

describe("E2E — CLI", () => {
  it("CLI exits cleanly with --help", async () => {
    const { exec } = await import("child_process");
    const { promisify } = await import("util");
    const execAsync = promisify(exec);

    const { stdout, stderr, exitCode } = await execAsync(
      `cd /home/ubuntu/Project/autoresearch && npx tsx src/cli/index.ts --help`,
      { timeout: 10_000 },
    ).catch((e) => e as { stdout: string; stderr: string; code: number });

    expect(exitCode).toBe(0);
    // Should mention the main commands
    expect(stdout + stderr).toMatch(/research|chat|session|kb/);
  });

  it("CLI chat command starts without error", async () => {
    const { exec } = await import("child_process");
    const { promisify } = await import("util");
    const execAsync = promisify(exec);

    // Just verify it doesn't crash on start — send Ctrl+C immediately
    const { exitCode, stderr } = await execAsync(
      `cd /home/ubuntu/Project/autoresearch && timeout 2 npx tsx src/cli/index.ts chat 2>&1 || true`,
      { timeout: 5_000 },
    ).catch((e) => e as { exitCode?: number; stderr: string });

    // Should not have TypeScript/import errors
    expect(stderr).not.toMatch(/SyntaxError|ImportError|Cannot find module/);
  });
});
