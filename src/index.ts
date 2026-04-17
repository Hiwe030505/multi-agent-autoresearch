import express from "express";
import { config } from "./config.ts";
import { runResearchPipeline } from "./agents/orchestrator.ts";
import { v4 as uuidv4 } from "uuid";
import pino from "pino";
import { analyzeProposal } from "./hub/proposal.ts";
import { graphQuery } from "./hub/graph.ts";
import { getSessionFindings, getHubStats } from "./hub/queries.ts";
import {
  getSessionEvents,
  subscribeSessionEvents,
  type AgentEvent,
} from "./hub/events.ts";
import type { GraphNodeType } from "./types.ts";

const log = pino({ level: config.nodeEnv === "production" ? "info" : "debug" });

const app = express();
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true }));

// CORS — specific origins in production, allow all in dev
const allowedOrigins = (() => {
  const env = process.env.NODE_ENV ?? "development";
  if (env === "production") {
    const origins = process.env.ALLOWED_ORIGINS ?? "";
    return origins ? origins.split(",").map((o) => o.trim()) : [];
  }
  return [];
})();

app.use((req, res, next) => {
  // Handle preflight immediately
  if (req.method === "OPTIONS") {
    const origin = req.headers.origin;
    res.setHeader("Access-Control-Allow-Origin", origin ?? "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
    res.setHeader("Access-Control-Max-Age", "86400");
    res.status(204).end();
    return;
  }

  const origin = req.headers.origin;
  if (allowedOrigins.length === 0 || (origin && allowedOrigins.includes(origin))) {
    res.setHeader("Access-Control-Allow-Origin", origin ?? "*");
  } else {
    res.setHeader("Access-Control-Allow-Origin", "*");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
  res.setHeader("Access-Control-Max-Age", "86400");
  next();
});

// Request logging
app.use((req, _res, next) => {
  log.info({ method: req.method, path: req.path }, "Incoming request");
  next();
});

// ─── SSE Event Stream ───────────────────────────────────────────────────────────

/** Server-Sent Events endpoint — streams live agent events to frontend */
app.get("/api/events/:sessionId/stream", (req, res) => {
  const { sessionId } = req.params;

  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering
  res.flushHeaders();

  // Send initial connection event
  res.write(`event: connected\ndata: ${JSON.stringify({ sessionId, timestamp: new Date().toISOString() })}\n\n`);

  let cursor = 0;
  const events = getSessionEvents(sessionId);
  if (events.length > 0) cursor = events.length - 1;

  // Subscribe to new events
  const unsubscribe = subscribeSessionEvents(sessionId, (event: AgentEvent) => {
    try {
      res.write(`event: agent_event\ndata: ${JSON.stringify(event)}\n\n`);
    } catch {
      // Client disconnected
    }
  });

  // Send keep-alive ping every 25s
  const pingInterval = setInterval(() => {
    try {
      res.write(`: ping\n\n`);
    } catch {
      clearInterval(pingInterval);
    }
  }, 25_000);

  // Cleanup on disconnect
  req.on("close", () => {
    unsubscribe();
    clearInterval(pingInterval);
  });
});

/** Polling endpoint — for clients that don't support SSE */
app.get("/api/events/:sessionId", (req, res) => {
  const { sessionId } = req.params;
  const after = req.query.after ? parseInt(req.query.after as string, 10) : undefined;

  const events = getSessionEvents(sessionId, after);
  const lastId = events.length > 0 ? events[events.length - 1]!.id : null;

  res.json({
    events,
    lastId,
    total: events.length,
  });
});

// ─── Health ────────────────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "AutoResearch API",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
  });
});

// ─── Research ─────────────────────────────────────────────────────────────────

interface ResearchJob {
  id: string;
  status: "pending" | "running" | "completed" | "failed";
  topic: string;
  startedAt?: string;
  completedAt?: string;
  result?: unknown;
  error?: string;
}

const jobs = new Map<string, ResearchJob>();

// ─── Redis Job Store ────────────────────────────────────────────────────────

async function loadJobsFromRedis(): Promise<void> {
  try {
    const { getRedis } = await import("./hub/redis.ts");
    const r = getRedis();
    const keys = await r.keys("autoresearch:job:*");
    for (const key of keys) {
      const id = key.split(":").pop()!;
      const data = await r.get(key);
      if (data) {
        try {
          const job = JSON.parse(data) as ResearchJob;
          jobs.set(id, job);
        } catch {}
      }
    }
    console.log(`[Jobs] Loaded ${jobs.size} jobs from Redis`);
  } catch {
    console.warn("[Jobs] Redis unavailable, using in-memory only");
  }
}

async function persistJob(job: ResearchJob): Promise<void> {
  try {
    const { getRedis } = await import("./hub/redis.ts");
    const r = getRedis();
    await r.setex(`autoresearch:job:${job.id}`, 86400, JSON.stringify(job));
  } catch {}
}

async function removeJob(id: string): Promise<void> {
  try {
    const { getRedis } = await import("./hub/redis.ts");
    const r = getRedis();
    await r.del(`autoresearch:job:${id}`);
  } catch {}
}

// Load jobs on startup
loadJobsFromRedis();

app.post("/api/research", async (req, res) => {
  const { topic, keywords, sessionId, maxSources } = req.body;

  if (!topic || typeof topic !== "string") {
    return res.status(400).json({ error: "topic is required" });
  }

  const id = sessionId ?? uuidv4();
  const job: ResearchJob = {
    id,
    status: "pending",
    topic,
    startedAt: new Date().toISOString(),
  };
  jobs.set(id, job);
  persistJob(job);

  // Return job ID immediately, process in background
  res.json({ sessionId: id, status: "pending", message: "Research started" });

  // Background processing
  job.status = "running";
  persistJob(job);
  try {
    log.info({ jobId: id, topic }, "Starting research pipeline");
    const result = await runResearchPipeline(topic, keywords ?? [], id);
    job.status = "completed";
    job.completedAt = new Date().toISOString();
    job.result = result;
    persistJob(job);
    log.info({
      jobId: id,
      findings: result.findings.length,
      insights: result.insights.insights.length,
      reusedFromHub: result.reusedFromKnowledgeHub.length,
      duration: result.duration,
    }, "Research completed");
  } catch (e) {
    job.status = "failed";
    job.error = e instanceof Error ? e.message : String(e);
    persistJob(job);
    log.error({ jobId: id, error: job.error }, "Research failed");
  }
});

// ─── Poll Job Status ───────────────────────────────────────────────────────────

app.get("/api/research/:id", async (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) {
    return res.status(404).json({ error: "Session not found" });
  }

  if (job.status === "completed") {
    const result = job.result as Record<string, unknown> | undefined;
    // Fetch findings from session store
    let findings: unknown[] = [];
    if (job.status === "completed") {
      try { findings = await getSessionFindings(req.params.id); } catch {}
    }
    return res.json({
      sessionId: job.id,
      status: "completed",
      findings: result?.findings ?? findings,
      ...(result ?? {}),
    });
  }

  if (job.status === "failed") {
    return res.status(500).json({
      sessionId: job.id,
      status: "failed",
      error: job.error,
    });
  }

  res.json({
    sessionId: job.id,
    status: job.status,
    message: job.status === "running" ? "Research in progress..." : "Pending",
  });
});

app.get("/api/research/:id/findings", async (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: "Session not found" });
  try {
    const findings = await getSessionFindings(req.params.id);
    res.json({ findings, total: findings.length });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// ─── List Sessions ────────────────────────────────────────────────────────────

app.get("/api/sessions", (_req, res) => {
  const sessions = [...jobs.values()].map((j) => ({
    sessionId: j.id,
    topic: j.topic,
    status: j.status,
    startedAt: j.startedAt,
    completedAt: j.completedAt,
  }));
  res.json({ sessions, total: sessions.length });
});

// ─── System Status ─────────────────────────────────────────────────────────────

app.get("/api/status", (_req, res) => {
  const running = [...jobs.values()].filter((j) => j.status === "running").length;
  const completed = [...jobs.values()].filter((j) => j.status === "completed").length;
  const failed = [...jobs.values()].filter((j) => j.status === "failed").length;

  res.json({
    agents: {
      orchestrator: { status: "idle" },
      researcher: { status: running > 0 ? "busy" : "idle" },
      reasoner: { status: running > 0 ? "busy" : "idle" },
      reviewer: { status: running > 0 ? "busy" : "idle" },
      coder: { status: "idle" },
      analyst: { status: "idle" },
      writer: { status: "idle" },
    },
    jobs: { total: jobs.size, running, completed, failed },
    uptime: process.uptime(),
  });
});

// ─── Knowledge Hub Stats ───────────────────────────────────────────────────────

app.get("/api/hub/stats", async (_req, res) => {
  const stats = await getHubStats();
  res.json({
    ...stats,
    uptime: process.uptime(),
  });
});

// ─── Graph Knowledge ───────────────────────────────────────────────────────────

app.get("/api/graph", async (_req, res) => {
  try {
    const graph = await graphQuery.fullGraph();
    res.json(graph);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

app.get("/api/graph/stats", async (_req, res) => {
  try {
    const stats = await graphQuery.stats();
    res.json(stats);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

app.get("/api/graph/search", async (req, res) => {
  try {
    const { q, types } = req.query;
    if (!q || typeof q !== "string") {
      return res.status(400).json({ error: "q parameter is required" });
    }
    const nodeTypes = types ? (types as string).split(",") as GraphNodeType[] : undefined;
    const nodes = await graphQuery.search(q, nodeTypes);
    res.json({ nodes, total: nodes.length });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

app.get("/api/graph/nodes", async (req, res) => {
  try {
    const { type } = req.query;
    const nodes = type && typeof type === "string"
      ? await graphQuery.byType(type as GraphNodeType)
      : [];
    res.json({ nodes, total: nodes.length });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

app.get("/api/graph/contradictions", async (_req, res) => {
  try {
    const contradictions = await graphQuery.contradictions();
    res.json({ contradictions, total: contradictions.length });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

app.get("/api/graph/gaps", async (_req, res) => {
  try {
    const gaps = await graphQuery.potentialGaps();
    res.json({ gaps, total: gaps.length });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// ─── Proposal Processor ──────────────────────────────────────────────────────

import formidable from "formidable";

app.post("/api/proposal/analyze", async (req, res) => {
  try {
    const contentType = req.headers["content-type"] ?? "";
    let text = "";

    if (contentType.includes("multipart/form-data")) {
      // ── Multipart: parse with formidable ───────────────────────────────
      const form = formidable({ maxFileSize: 20 * 1024 * 1024 });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parseResult = await new Promise<any>((resolve, reject) => {
        form.parse(req, (err, fields, files) => {
          if (err) reject(err);
          else resolve({ fields, files });
        });
      });
      const fields = parseResult.fields as Record<string, string | string[]>;
      const files = parseResult.files as Record<string, Record<string, unknown> | Record<string, unknown>[]>;

      // Priority 1: text field from form
      const rawField = fields["text"];
      const fieldText = Array.isArray(rawField) ? rawField[0] : (typeof rawField === "string" ? rawField : "");
      text = fieldText;

      // Priority 2: extract text from uploaded file
      if (!text.trim()) {
        const rawFile = files["file"];
        const fileEntry = (Array.isArray(rawFile) ? rawFile[0] : rawFile) as Record<string, string> | undefined;
        if (fileEntry && typeof fileEntry.filepath === "string" && fileEntry.filepath) {
          try {
            const fs = await import("fs");
            text = fs.readFileSync(fileEntry.filepath, "utf-8").slice(0, 50_000);
          } catch {
            // File read failed — try as-is
            text = "";
          }
        }
      }
    } else {
      // ── JSON body ─────────────────────────────────────────────────────
      const body = req.body as { text?: string };
      text = body?.text ?? "";
    }

    if (!text.trim()) {
      return res.status(400).json({ error: "text is required — provide a text field or upload a file" });
    }

    const result = await analyzeProposal(text.trim());
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

app.post("/api/proposal/research", async (req, res) => {
  const { topic, keywords } = req.body as { topic: string; keywords?: string[] };
  if (!topic) return res.status(400).json({ error: "topic is required" });

  const sessionId = uuidv4();
  res.json({ sessionId, status: "pending", message: "Research started from proposal" });

  // Run in background
  runResearchPipeline(topic, keywords ?? [], sessionId).catch((e) => {
    console.error("[Proposal] Research failed:", e);
  });
});

// ─── 404 ─────────────────────────────────────────────────────────────────────

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// ─── Error Handler ─────────────────────────────────────────────────────────────

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  log.error({ err }, "Unhandled error");
  res.status(500).json({ error: err.message ?? "Internal error" });
});

// ─── Start ───────────────────────────────────────────────────────────────────

app.listen(config.port, () => {
  log.info(`AutoResearch API listening on port ${config.port}`);
  log.info(`Health: http://localhost:${config.port}/health`);
  log.info(`Research: POST http://localhost:${config.port}/api/research`);
  log.info(`Sessions: GET http://localhost:${config.port}/api/sessions`);
});
