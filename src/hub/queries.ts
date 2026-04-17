/**
 * Knowledge Hub — High-level query operations
 *
 * Combines DB + Redis + Embeddings into cohesive Knowledge Hub operations:
 * - Archive finding (with embedding + to DB + session tracking)
 * - Query similar past research
 * - Start/end research sessions
 */

import { v4 as uuidv4 } from "uuid";
import {
  upsertFinding,
  findSimilarFindings,
  searchFindingsByText,
  getInsightsBySession,
  upsertInsight,
  upsertSession,
  completeSession,
  saveAgentOutput,
  getFindingsByTopic,
  getFindingsByIds,
  getPool,
} from "./db.ts";
import {
  sessionPushFinding,
  sessionGetFindings,
  sessionPushInsight,
  setSessionState,
  cacheGet,
  cacheSet,
} from "./redis.ts";
import { embedText, textForEmbedding } from "./embeddings.ts";
import type { Finding, Insight, InsightSession, SourceType } from "../types.ts";

// ─── Archive Finding ─────────────────────────────────────────────────────────

export async function archiveFinding(
  finding: Finding,
  sessionId: string,
  generateEmbedding = true,
): Promise<Finding> {
  // Generate embedding if not present
  if (generateEmbedding && !finding.embedding) {
    try {
      const text = textForEmbedding(finding);
      const embedding = await embedText(text);
      finding.embedding = embedding;
    } catch {
      // Embedding unavailable — save without vector
    }
  }

  // Save to PostgreSQL
  await upsertFinding(finding);

  // Track finding in session (Redis)
  await sessionPushFinding(sessionId, finding.id);

  return finding;
}

// ─── Archive Insight ──────────────────────────────────────────────────────────

export async function archiveInsight(
  insight: Insight,
  sessionId: string,
): Promise<void> {
  await upsertInsight(insight);
  await sessionPushInsight(sessionId, insight.id);
}

// ─── Query Similar Past Research ───────────────────────────────────────────────

export async function querySimilarResearch(
  topic: string,
  topK = 5,
): Promise<{
  findings: Finding[];
  insights: Insight[];
  reusedSessionId?: string;
  reuseRatio: number;
}> {
  // Check cache first
  const cacheKey = `similar:${topic}:${topK}`;
  const cached = await cacheGet(cacheKey);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch {}
  }

  // Try text search first (always available)
  let findings = await searchFindingsByText(topic, topK);
  let insights: Insight[] = [];

  // If no text results, try embedding search
  if (findings.length < 3) {
    try {
      const queryEmbedding = await embedText(topic);
      findings = await findSimilarFindings(queryEmbedding, topK, 0.65);
    } catch (e) {
      // Embedding unavailable — skip similarity search gracefully
    }
  }

  const reuseRatio = findings.length > 0 ? Math.min(1, findings.length / topK) : 0;

  const result = {
    findings,
    insights,
    reuseRatio,
  };

  // Cache for 10 minutes
  await cacheSet(cacheKey, JSON.stringify(result), 600);

  return result;
}

// ─── Session Management ──────────────────────────────────────────────────────

export async function startSession(
  sessionId: string,
  topic: string,
  description?: string,
): Promise<void> {
  await upsertSession(sessionId, topic, description, "active");
  await setSessionState(sessionId, {
    topic,
    status: "initialized",
    started_at: Date.now().toString(),
  });
}

export async function finishSession(
  sessionId: string,
  topic: string,
): Promise<void> {
  await completeSession(sessionId);
  await setSessionState(sessionId, {
    status: "completed",
    completed_at: Date.now().toString(),
  });
}

// ─── Save Agent Output ────────────────────────────────────────────────────────

export async function saveOutput(
  agent: string,
  sessionId: string,
  outputType: "result" | "feedback" | "code" | "report" | "insight",
  content: string,
  quality?: number,
): Promise<void> {
  const id = uuidv4();
  await saveAgentOutput(id, agent, sessionId, outputType, content, quality);
}

// ─── Get Session History ────────────────────────────────────────────────────

export async function getSessionFindings(
  sessionId: string,
): Promise<Finding[]> {
  // Fetch the list of finding IDs stored in Redis for this session
  const ids = await sessionGetFindings(sessionId);
  if (!ids.length) return [];
  return getFindingsByIds(ids);
}

export async function getSessionInsights(
  sessionId: string,
): Promise<Insight[]> {
  return getInsightsBySession(sessionId);
}

// ─── Dashboard Stats ───────────────────────────────────────────────────────────

export async function getHubStats(): Promise<{
  totalFindings: number;
  totalInsights: number;
  avgConfidence: number;
  topTopics: Array<{ topic: string; count: number }>;
  totalSessions: number;
  totalNodes: number;
  totalEdges: number;
}> {
  try {
    const p = getPool();
    const [
      findingsCount,
      insightsCount,
      avgConf,
      topTopicsRows,
      sessionsCount,
      nodesCount,
      edgesCount,
    ] = await Promise.all([
      p.query(`SELECT COUNT(*) as c FROM findings`),
      p.query(`SELECT COUNT(*) as c FROM insights`),
      p.query(`SELECT COALESCE(AVG(confidence), 0) as avg FROM findings`),
      p.query(`
        SELECT topic, COUNT(*) as count
        FROM findings
        GROUP BY topic
        ORDER BY count DESC
        LIMIT 10
      `),
      p.query(`SELECT COUNT(*) as c FROM sessions`),
      p.query(`SELECT COUNT(*) as c FROM graph_nodes`),
      p.query(`SELECT COUNT(*) as c FROM graph_edges`),
    ]);

    return {
      totalFindings: Number(findingsCount.rows[0]?.c ?? 0),
      totalInsights: Number(insightsCount.rows[0]?.c ?? 0),
      avgConfidence: Number(avgConf.rows[0]?.avg ?? 0),
      topTopics: topTopicsRows.rows.map((r) => ({ topic: r.topic, count: Number(r.count) })),
      totalSessions: Number(sessionsCount.rows[0]?.c ?? 0),
      totalNodes: Number(nodesCount.rows[0]?.c ?? 0),
      totalEdges: Number(edgesCount.rows[0]?.c ?? 0),
    };
  } catch (e) {
    console.warn("[Hub] getHubStats failed:", (e as Error).message);
    return {
      totalFindings: 0,
      totalInsights: 0,
      avgConfidence: 0,
      topTopics: [],
      totalSessions: 0,
      totalNodes: 0,
      totalEdges: 0,
    };
  }
}
