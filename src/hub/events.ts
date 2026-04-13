/**
 * Agent Event Streaming — Core Infrastructure
 *
 * Architecture:
 * - All agents emit structured events during execution
 * - Events are published to Redis Pub/Sub channels (session-scoped)
 * - SSE endpoint streams events to connected frontend clients
 * - In-memory fallback when Redis is unavailable
 * - Graceful degradation: event streaming is best-effort, never blocks agents
 *
 * Event flow:
 *   Agent → EventEmitter → Redis Pub/Sub
 *                             ↓
 *   /api/events/:sessionId  ← SSE → Frontend
 */

import { v4 as uuidv4 } from "uuid";

// ─── Event Types ──────────────────────────────────────────────────────────────

export type AgentEventType =
  // Orchestrator events
  | "orchestrator.start"
  | "orchestrator.phase"
  | "orchestrator.complete"
  | "orchestrator.error"
  // Agent lifecycle
  | "agent.start"
  | "agent.heartbeat"
  | "agent.complete"
  | "agent.error"
  | "agent.retry"
  // Research events
  | "researcher.searching"
  | "researcher.found"
  | "researcher.extracting"
  | "researcher.complete"
  // Reasoner events
  | "reasoner.start"
  | "reasoner.strategy"
  | "reasoner.thinking"
  | "reasoner.insight"
  | "reasoner.complete"
  // Graph events
  | "graph.extract_start"
  | "graph.node_added"
  | "graph.edge_added"
  | "graph.complete"
  // Writer events
  | "writer.start"
  | "writer.section"
  | "writer.complete"
  // Analyst events
  | "analyst.start"
  | "analyst.statistics"
  | "analyst.visualization"
  | "analyst.complete"
  // Reviewer events
  | "reviewer.start"
  | "reviewer.issue"
  | "reviewer.complete"
  // Coder events
  | "coder.start"
  | "coder.file"
  | "coder.complete";

export interface AgentEvent {
  id: string;
  sessionId: string;
  type: AgentEventType;
  agent?: string;
  timestamp: string;
  data: Record<string, unknown>;
  // UI display fields
  title?: string;
  description?: string;
  progress?: number;       // 0-100 for progress bars
  metadata?: Record<string, unknown>;
}

export interface PipelinePhase {
  id: string;
  name: string;
  status: "pending" | "running" | "completed" | "failed";
  agents: string[];
  startedAt?: string;
  completedAt?: string;
  progress?: number;
}

// ─── In-Memory Event Store (Redis fallback) ───────────────────────────────────

class InMemoryEventStore {
  private events = new Map<string, AgentEvent[]>();
  private subscribers = new Map<string, Set<(event: AgentEvent) => void>>();
  private cursor = new Map<string, number>();

  addEvent(sessionId: string, event: AgentEvent): void {
    const sessionEvents = this.events.get(sessionId) ?? [];
    sessionEvents.push(event);
    // Keep last 1000 events per session
    if (sessionEvents.length > 1000) {
      sessionEvents.splice(0, sessionEvents.length - 1000);
    }
    this.events.set(sessionId, sessionEvents);

    // Notify subscribers
    const subs = this.subscribers.get(sessionId);
    if (subs) {
      for (const cb of subs) {
        try { cb(event); } catch {}
      }
    }
  }

  getEvents(sessionId: string, after?: number): AgentEvent[] {
    const events = this.events.get(sessionId) ?? [];
    if (after === undefined) return events.slice(-100);
    return events.filter((_, i) => i > after);
  }

  subscribe(sessionId: string, callback: (event: AgentEvent) => void): () => void {
    const subs = this.subscribers.get(sessionId) ?? new Set();
    subs.add(callback);
    this.subscribers.set(sessionId, subs);
    return () => subs.delete(callback);
  }

  clear(sessionId: string): void {
    this.events.delete(sessionId);
    this.cursor.delete(sessionId);
  }
}

const globalEventStore = new InMemoryEventStore();

// ─── Redis Pub/Sub Integration ────────────────────────────────────────────────

let redisPub: import("ioredis").Redis | null = null;
let redisSub: import("ioredis").Redis | null = null;
let redisAvailable = false;

async function getRedisPub(): Promise<import("ioredis").Redis | null> {
  if (redisPub) return redisPub;
  try {
    const { getRedis } = await import("./redis.ts");
    const r = getRedis();
    await r.ping();
    redisPub = r;
    redisAvailable = true;
    return redisPub;
  } catch {
    redisAvailable = false;
    return null;
  }
}

async function ensureRedisSub(): Promise<import("ioredis").Redis | null> {
  if (redisSub) return redisSub;
  try {
    const { getRedis } = await import("./redis.ts");
    const r = getRedis();
    await r.ping();
    redisSub = r.duplicate();
    await redisSub.subscribe("__keyevent@0__:autoresearch:events:*");
    redisAvailable = true;
    return redisSub;
  } catch {
    redisAvailable = false;
    return null;
  }
}

// ─── Event Emitter ────────────────────────────────────────────────────────────

const SESSION_CHANNEL = (sessionId: string) => `autoresearch:events:${sessionId}`;

export function emitEvent(sessionId: string, event: Omit<AgentEvent, "id" | "sessionId" | "timestamp">): void {
  const fullEvent: AgentEvent = {
    ...event,
    id: uuidv4(),
    sessionId,
    timestamp: new Date().toISOString(),
  };

  // Always store in-memory (fallback + polling support)
  globalEventStore.addEvent(sessionId, fullEvent);

  // Try Redis Pub/Sub (non-blocking)
  getRedisPub().then((r) => {
    if (r) {
      r.publish(SESSION_CHANNEL(sessionId), JSON.stringify(fullEvent)).catch(() => {});
    }
  }).catch(() => {});
}

// ─── Convenience helpers ──────────────────────────────────────────────────────

export function emit(
  sessionId: string,
  type: AgentEventType,
  data: Record<string, unknown> = {},
  display?: { title?: string; description?: string; progress?: number },
): void {
  emitEvent(sessionId, { type, data, ...display });
}

export function emitAgentStart(sessionId: string, agent: string, task: string): void {
  emit(sessionId, "agent.start", { agent, task }, {
    title: `${agent} started`,
    description: task,
    progress: 0,
  });
}

export function emitAgentComplete(sessionId: string, agent: string, summary: string): void {
  emit(sessionId, "agent.complete", { agent, summary }, {
    title: `${agent} completed`,
    description: summary,
    progress: 100,
  });
}

export function emitAgentError(sessionId: string, agent: string, error: string): void {
  emit(sessionId, "agent.error", { agent, error }, {
    title: `${agent} error`,
    description: error,
  });
}

export function emitPhase(sessionId: string, phase: string, status: string, progress?: number): void {
  emit(sessionId, "orchestrator.phase", { phase, status }, {
    title: `Phase: ${phase}`,
    description: status,
    progress,
  });
}

export function emitThinking(
  sessionId: string,
  agent: string,
  strategy: string,
  thought: string,
  insight?: string,
): void {
  emit(sessionId, "reasoner.thinking", { agent, strategy, thought, insight }, {
    title: `🧠 ${strategy}`,
    description: thought.slice(0, 120),
  });
}

export function emitInsight(sessionId: string, insight: string, confidence: number, type: string): void {
  emit(sessionId, "reasoner.insight", { insight, confidence, type }, {
    title: `💡 ${type}: ${insight.slice(0, 60)}`,
    description: `Confidence: ${(confidence * 100).toFixed(0)}%`,
    progress: undefined,
  });
}

export function emitFinding(sessionId: string, title: string, source: string, confidence: number): void {
  emit(sessionId, "researcher.found", { title, source, confidence }, {
    title: `📄 ${title}`,
    description: source,
  });
}

export function emitGraphNode(sessionId: string, name: string, type: string): void {
  emit(sessionId, "graph.node_added", { name, type }, {
    title: `🔷 ${type}: ${name}`,
    description: `New ${type} node added to graph`,
  });
}

export function emitGraphEdge(sessionId: string, source: string, target: string, rel: string): void {
  emit(sessionId, "graph.edge_added", { source, target, relationship: rel }, {
    title: `🔗 ${source} → ${target}`,
    description: rel,
  });
}

// ─── Query Functions ──────────────────────────────────────────────────────────

export function getSessionEvents(sessionId: string, after?: number): AgentEvent[] {
  return globalEventStore.getEvents(sessionId, after);
}

export function subscribeSessionEvents(
  sessionId: string,
  callback: (event: AgentEvent) => void,
): () => void {
  return globalEventStore.subscribe(sessionId, callback);
}

export function clearSessionEvents(sessionId: string): void {
  globalEventStore.clear(sessionId);
}

// ─── SSE Streaming Handler ────────────────────────────────────────────────────

/**
 * Creates an SSE response handler for streaming events to frontend.
 * Uses in-memory store for immediate delivery.
 * Redis Pub/Sub is used for multi-instance scaling (future).
 */
export function createSSEHandler(
  sessionId: string,
  onClose?: () => void,
): {
  sendEvent: (event: AgentEvent) => void;
  sendPing: () => void;
  cleanup: () => void;
} {
  const unsubscribe = globalEventStore.subscribe(sessionId, () => {});

  return {
    sendEvent(event: AgentEvent) {
      // Events are automatically delivered via globalEventStore.subscribe
      // This function exists for direct delivery in the same process
    },
    sendPing() {
      // Keep-alive ping for SSE connection health
    },
    cleanup() {
      unsubscribe();
      if (onClose) onClose();
    },
  };
}
