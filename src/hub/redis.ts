/**
 * Knowledge Hub — Redis connection
 *
 * Responsibilities:
 * - Task queue (priority sorted sets)
 * - Agent heartbeat tracking
 * - Session state (hot data)
 * - Shared message queue between agents
 * - Rate limiting
 *
 * All operations are wrapped in try/catch for graceful degradation
 * when Redis is unavailable.
 */

import Redis from "ioredis";
import { config } from "../config.ts";

// ─── Connection ─────────────────────────────────────────────────────────────

let redis: Redis | null = null;

export function getRedis(): Redis {
  if (!redis) {
    const url = config.redisUrl || "redis://:ar_redis_2026@localhost:6380";
    redis = new Redis(url, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      retryStrategy(times: number) {
        if (times > 3) return null;
        return Math.min(times * 200, 2000);
      },
    });

    redis.on("error", (err: Error) => {
      console.warn("[Redis] Connection error (continuing without cache):", err.message);
    });
    redis.on("connect", () => {
      console.log("[Redis] Connected");
    });
  }
  return redis;
}

export async function closeRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}

export async function pingRedis(): Promise<boolean> {
  try {
    const r = getRedis();
    const result = await r.ping();
    return result === "PONG";
  } catch {
    return false;
  }
}

// ─── Key Prefixes ────────────────────────────────────────────────────────────

const P = {
  tasks: "autoresearch:tasks:",
  agent: (name: string) => `autoresearch:agent:${name}:`,
  session: (id: string) => `autoresearch:session:${id}:`,
  message: (agent: string) => `autoresearch:messages:${agent}`,
  rateLimit: (agent: string) => `autoresearch:ratelimit:${agent}:`,
  cache: (key: string) => `autoresearch:cache:${key}`,
};

// ─── Task Queue ──────────────────────────────────────────────────────────────

export async function enqueueTask(taskId: string, priority: number): Promise<void> {
  try {
    const r = getRedis();
    await r.zadd(P.tasks + "pending", priority, taskId);
  } catch {
    // Redis unavailable — skip gracefully
  }
}

export async function dequeueTask(): Promise<string | null> {
  try {
    const r = getRedis();
    const result = await r.zpopmin(P.tasks + "pending", 1);
    if (!result || result.length === 0) return null;
    const taskId = result[0][0] as string;
    await r.sadd(P.tasks + "processing", taskId);
    return taskId;
  } catch {
    return null;
  }
}

export async function completeTask(taskId: string): Promise<void> {
  try {
    const r = getRedis();
    await r.srem(P.tasks + "processing", taskId);
    await r.zadd(P.tasks + "done", Date.now(), taskId);
    await r.zremrangebyrank(P.tasks + "done", 0, -1001);
  } catch {
    // Redis unavailable — skip gracefully
  }
}

export async function failTask(taskId: string): Promise<void> {
  try {
    const r = getRedis();
    await r.srem(P.tasks + "processing", taskId);
    await r.hincrby(P.tasks + "failed", taskId, 1);
  } catch {
    // Redis unavailable — skip gracefully
  }
}

export async function getQueueStats(): Promise<{
  pending: number; processing: number; done: number;
}> {
  try {
    const r = getRedis();
    const [pending, processing, done] = await Promise.all([
      r.zcard(P.tasks + "pending"),
      r.scard(P.tasks + "processing"),
      r.zcard(P.tasks + "done"),
    ]);
    return { pending, processing, done };
  } catch {
    return { pending: 0, processing: 0, done: 0 };
  }
}

// ─── Agent Heartbeat ──────────────────────────────────────────────────────────

const HEARTBEAT_TTL = 60;

export async function agentHeartbeat(
  name: string,
  status: "idle" | "busy" | "error",
  currentTask?: string,
): Promise<void> {
  try {
    const r = getRedis();
    await r.hset(P.agent(name) + "status", {
      status,
      current_task: currentTask ?? "",
      last_seen: Date.now().toString(),
    });
    await r.expire(P.agent(name) + "status", HEARTBEAT_TTL);
  } catch {
    // Redis unavailable — skip gracefully
  }
}

export async function getAgentStatus(name: string): Promise<{
  status: string; currentTask?: string; lastSeen: number;
} | null> {
  try {
    const r = getRedis();
    const data = await r.hgetall(P.agent(name) + "status");
    if (!data || Object.keys(data).length === 0) return null;
    return {
      status: data.status ?? "offline",
      currentTask: data.current_task || undefined,
      lastSeen: parseInt(data.last_seen ?? "0", 10),
    };
  } catch {
    return null;
  }
}

export async function getAllAgentStatuses(): Promise<
  Array<{ name: string; status: string; currentTask?: string; lastSeen: number }>
> {
  const agentNames = ["orchestrator", "researcher", "reasoner", "coder", "analyst", "writer", "reviewer"];
  const results = await Promise.all(
    agentNames.map(async (name) => {
      const s = await getAgentStatus(name);
      return { name, status: s?.status ?? "offline", currentTask: s?.currentTask, lastSeen: s?.lastSeen ?? 0 };
    }),
  );
  return results;
}

// ─── Session State ──────────────────────────────────────────────────────────

export async function setSessionState(
  sessionId: string,
  state: Record<string, string>,
  ttlSeconds = 3600,
): Promise<void> {
  try {
    const r = getRedis();
    await r.hset(P.session(sessionId) + "state", state);
    await r.expire(P.session(sessionId) + "state", ttlSeconds);
  } catch {
    // Redis unavailable — skip gracefully
  }
}

export async function getSessionState(sessionId: string): Promise<Record<string, string> | null> {
  try {
    const r = getRedis();
    const data = await r.hgetall(P.session(sessionId) + "state");
    if (!data || Object.keys(data).length === 0) return null;
    return data;
  } catch {
    return null;
  }
}

export async function sessionPushFinding(sessionId: string, findingId: string): Promise<void> {
  try {
    const r = getRedis();
    await r.rpush(P.session(sessionId) + "findings", findingId);
    await r.expire(P.session(sessionId) + "findings", 86400);
  } catch {
    // Redis unavailable — skip gracefully
  }
}

export async function sessionGetFindings(sessionId: string): Promise<string[]> {
  try {
    const r = getRedis();
    return await r.lrange(P.session(sessionId) + "findings", 0, -1);
  } catch {
    return [];
  }
}

export async function sessionPushInsight(sessionId: string, insightId: string): Promise<void> {
  try {
    const r = getRedis();
    await r.rpush(P.session(sessionId) + "insights", insightId);
    await r.expire(P.session(sessionId) + "insights", 86400);
  } catch {
    // Redis unavailable — skip gracefully
  }
}

// ─── Rate Limiting ─────────────────────────────────────────────────────────

export async function checkRateLimit(
  agent: string,
  maxTokens: number,
  windowSeconds = 60,
): Promise<{ allowed: boolean; remaining: number; resetIn: number }> {
  try {
    const r = getRedis();
    const key = P.rateLimit(agent) + "tokens";
    const count = (await r.get(key)) ?? "0";
    const remaining = Math.max(0, maxTokens - parseInt(count, 10));
    if (remaining > 0) return { allowed: true, remaining, resetIn: windowSeconds };
    const ttl = await r.ttl(key);
    return { allowed: false, remaining: 0, resetIn: ttl > 0 ? ttl : windowSeconds };
  } catch {
    return { allowed: true, remaining: 100, resetIn: 60 };
  }
}

export async function consumeRateLimit(agent: string, tokens = 1): Promise<void> {
  try {
    const r = getRedis();
    const key = P.rateLimit(agent) + "tokens";
    const exists = await r.exists(key);
    if (!exists) await r.setex(key, 60, "0");
    await r.incrby(key, tokens);
  } catch {
    // Redis unavailable — skip gracefully
  }
}

// ─── Message Queue ──────────────────────────────────────────────────────────

export async function sendMessage(
  toAgent: string,
  message: { id: string; type: string; from: string; payload: string; timestamp: string },
): Promise<void> {
  try {
    const r = getRedis();
    await r.rpush(P.message(toAgent), JSON.stringify(message));
  } catch {
    // Redis unavailable — skip gracefully
  }
}

export async function receiveMessages(
  agent: string,
  maxCount = 10,
): Promise<Array<{ id: string; type: string; from: string; payload: string; timestamp: string }>> {
  try {
    const r = getRedis();
    const messages: Array<{ id: string; type: string; from: string; payload: string; timestamp: string }> = [];
    for (let i = 0; i < maxCount; i++) {
      const raw = await r.lpop(P.message(agent));
      if (!raw) break;
      try { messages.push(JSON.parse(raw)); } catch {}
    }
    return messages;
  } catch {
    return [];
  }
}

// ─── Cache ─────────────────────────────────────────────────────────────────

export async function cacheSet(key: string, value: string, ttlSeconds = 300): Promise<void> {
  try {
    const r = getRedis();
    await r.setex(P.cache(key), ttlSeconds, value);
  } catch {
    // Redis unavailable — skip gracefully
  }
}

export async function cacheGet(key: string): Promise<string | null> {
  try {
    const r = getRedis();
    return await r.get(P.cache(key));
  } catch {
    return null;
  }
}
