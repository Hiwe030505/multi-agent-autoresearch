/**
 * Knowledge Hub — PostgreSQL + pgvector connection
 *
 * All operations are wrapped in try/catch for graceful degradation
 * when PostgreSQL/pgvector is unavailable.
 */

import pg from "pg";
import { config } from "../config.ts";
import type { Finding, Insight, InsightType, SourceType, GraphNode, GraphEdge } from "../types.ts";

const { Pool } = pg;

// ─── Connection Pool ─────────────────────────────────────────────────────────

let pool: pg.Pool | null = null;
let dbAvailable = false;

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: config.databaseUrl || undefined,
      host: "localhost",
      port: 5434,
      database: "autoresearch",
      user: "postgres",
      password: process.env.POSTGRES_PASSWORD ?? "ar_password_2026",
      max: 20,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });

    pool.on("error", (err) => {
      console.warn("[DB] Pool error:", err.message);
      dbAvailable = false;
    });
    pool.on("connect", () => {
      dbAvailable = true;
    });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export async function initSchema(): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query("CREATE EXTENSION IF NOT EXISTS vector");
    await client.query(`
      CREATE TABLE IF NOT EXISTS findings (
        id          TEXT PRIMARY KEY,
        topic       TEXT NOT NULL,
        source_url  TEXT,
        source_type TEXT CHECK (source_type IN ('paper','web','book','internal')),
        title       TEXT NOT NULL DEFAULT '',
        content     TEXT NOT NULL,
        summary     TEXT,
        embedding   VECTOR(1536),
        confidence  REAL DEFAULT 0.5,
        created_by  TEXT NOT NULL,
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        verified    BOOLEAN DEFAULT FALSE,
        verified_by TEXT,
        tags        TEXT[] DEFAULT '{}',
        key_findings JSONB DEFAULT '[]',
        questions_raised TEXT[] DEFAULT '{}',
        connections TEXT[] DEFAULT '{}',
        metadata    JSONB DEFAULT '{}'
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS findings_embedding_idx
        ON findings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS findings_fts_idx
        ON findings USING gin(to_tsvector('english', coalesce(title,'') || ' ' || coalesce(content,'')));
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS insights (
        id              TEXT PRIMARY KEY,
        session_id      TEXT NOT NULL,
        insight_type    TEXT CHECK (insight_type IN (
          'synthesis','contradiction','gap','transfer','failure','temporal'
        )) NOT NULL,
        title           TEXT NOT NULL,
        summary         TEXT NOT NULL,
        description     TEXT,
        confidence      REAL DEFAULT 0.5,
        novelty_score   REAL DEFAULT 0.5,
        actionable      BOOLEAN DEFAULT FALSE,
        evidence_refs  TEXT[] DEFAULT '{}',
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        verified        BOOLEAN DEFAULT FALSE,
        verified_by     TEXT,
        tags            TEXT[] DEFAULT '{}'
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id            TEXT PRIMARY KEY,
        title         TEXT NOT NULL,
        description   TEXT,
        status        TEXT DEFAULT 'active' CHECK (status IN ('active','completed','archived')),
        created_at    TIMESTAMPTZ DEFAULT NOW(),
        completed_at  TIMESTAMPTZ,
        metadata      JSONB DEFAULT '{}'
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS agent_outputs (
        id          TEXT PRIMARY KEY,
        agent       TEXT NOT NULL,
        task_id     TEXT,
        session_id  TEXT,
        output_type TEXT CHECK (output_type IN ('result','feedback','code','report','insight')),
        content     TEXT NOT NULL,
        quality     REAL,
        reviewed    BOOLEAN DEFAULT FALSE,
        reviewed_by TEXT,
        created_at  TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS graph_nodes (
        id          TEXT PRIMARY KEY,
        type        TEXT NOT NULL,
        name        TEXT NOT NULL,
        summary     TEXT NOT NULL DEFAULT '',
        metadata    JSONB DEFAULT '{}',
        tags        TEXT[] DEFAULT '{}',
        confidence  REAL DEFAULT 0.5,
        created_at  TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS graph_edges (
        id          TEXT PRIMARY KEY,
        source_id   TEXT NOT NULL,
        target_id   TEXT NOT NULL,
        type        TEXT NOT NULL,
        weight      REAL DEFAULT 0.5,
        description TEXT,
        session_id  TEXT NOT NULL,
        created_at  TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log("[DB] Schema initialized");
  } finally {
    client.release();
  }
}

// ─── Findings ────────────────────────────────────────────────────────────────

export async function upsertFinding(finding: Finding): Promise<void> {
  try {
    const p = getPool();
    const client = await p.connect();
    try {
      await client.query(
        `INSERT INTO findings (
          id, topic, source_url, source_type, title, content, summary,
          embedding, confidence, created_by, created_at, verified, verified_by,
          tags, key_findings, questions_raised, connections, metadata
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
         ON CONFLICT (id) DO UPDATE SET
          verified = EXCLUDED.verified, verified_by = EXCLUDED.verified_by,
          metadata = EXCLUDED.metadata`,
        [
          finding.id, finding.topic, finding.sourceUrl ?? null, finding.sourceType,
          finding.title, finding.content, finding.summary ?? null,
          finding.embedding ? `[${finding.embedding.join(",")}]` : null,
          finding.confidence, finding.createdBy, finding.createdAt,
          finding.verified, finding.verifiedBy ?? null,
          finding.tags,
          JSON.stringify(finding.keyFindings ?? []),
          finding.questionsRaised ?? [],
          finding.connections ?? [],
          JSON.stringify(finding.metadata ?? {}),
        ],
      );
    } finally {
      client.release();
    }
  } catch (e) {
    console.warn("[DB] upsertFinding failed:", (e as Error).message);
  }
}

export async function findSimilarFindings(
  embedding: number[],
  matchCount = 5,
  matchThreshold = 0.7,
): Promise<Finding[]> {
  try {
    const p = getPool();
    const client = await p.connect();
    try {
      const vec = `[${embedding.join(",")}]`;
      const rows = await client.query<{
        id: string; topic: string; source_url: string; source_type: string;
        title: string; content: string; summary: string;
        confidence: number; created_by: string; created_at: Date;
        verified: boolean; tags: string[];
      }>(
        `SELECT id, topic, source_url, source_type, title, content, summary,
                confidence, created_by, created_at, verified, tags
         FROM findings
         WHERE embedding IS NOT NULL
           AND 1 - (embedding <=> $1::vector) > $2
         ORDER BY embedding <=> $1::vector LIMIT $3`,
        [vec, matchThreshold, matchCount],
      );
      return rows.rows.map(rowToFinding);
    } finally {
      client.release();
    }
  } catch (e) {
    console.warn("[DB] findSimilarFindings failed:", (e as Error).message);
    return [];
  }
}

export async function searchFindingsByText(
  query: string,
  limit = 20,
): Promise<Finding[]> {
  try {
    const p = getPool();
    const client = await p.connect();
    try {
      const rows = await client.query<{
        id: string; topic: string; source_url: string; source_type: string;
        title: string; content: string; summary: string;
        confidence: number; created_by: string; created_at: Date;
        verified: boolean; tags: string[];
      }>(
        `SELECT id, topic, source_url, source_type, title, content, summary,
                confidence, created_by, created_at, verified, tags
         FROM findings
         WHERE to_tsvector('english', coalesce(title,'') || ' ' || coalesce(content,''))
               @@ plainto_tsquery('english', $1)
         ORDER BY ts_rank(to_tsvector('english', coalesce(title,'') || ' ' || coalesce(content,'')),
               plainto_tsquery('english', $1)) DESC LIMIT $2`,
        [query, limit],
      );
      return rows.rows.map(rowToFinding);
    } finally {
      client.release();
    }
  } catch (e) {
    console.warn("[DB] searchFindingsByText failed:", (e as Error).message);
    return [];
  }
}

export async function getFindingsBySession(_sessionId: string): Promise<Finding[]> {
  return [];
}

export async function getFindingsByIds(ids: string[]): Promise<Finding[]> {
  if (!ids.length) return [];
  try {
    const p = getPool();
    const { rows } = await p.query<{
      id: string; topic: string; source_url: string; source_type: string;
      title: string; content: string; summary: string;
      confidence: number; created_by: string; created_at: Date;
      verified: boolean; tags: string[];
    }>(
      `SELECT * FROM findings WHERE id = ANY($1)`,
      [ids],
    );
    return rows.map(rowToFinding);
  } catch (e) {
    console.warn("[DB] getFindingsByIds failed:", (e as Error).message);
    return [];
  }
}

export async function getFindingsByTopic(topic: string, limit = 50): Promise<Finding[]> {
  try {
    const p = getPool();
    const client = await p.connect();
    try {
      const rows = await client.query<{
        id: string; topic: string; source_url: string; source_type: string;
        title: string; content: string; summary: string;
        confidence: number; created_by: string; created_at: Date;
        verified: boolean; tags: string[];
      }>(
        `SELECT id, topic, source_url, source_type, title, content, summary,
                confidence, created_by, created_at, verified, tags
         FROM findings WHERE topic = $1
         ORDER BY confidence DESC, created_at DESC LIMIT $2`,
        [topic, limit],
      );
      return rows.rows.map(rowToFinding);
    } finally {
      client.release();
    }
  } catch (e) {
    console.warn("[DB] getFindingsByTopic failed:", (e as Error).message);
    return [];
  }
}

// ─── Insights ────────────────────────────────────────────────────────────────

export async function upsertInsight(insight: Insight): Promise<void> {
  try {
    const p = getPool();
    const client = await p.connect();
    try {
      await client.query(
        `INSERT INTO insights (
          id, session_id, insight_type, title, summary, description,
          confidence, novelty_score, actionable, evidence_refs,
          created_at, verified, verified_by, tags
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         ON CONFLICT (id) DO UPDATE SET
          verified = EXCLUDED.verified, verified_by = EXCLUDED.verified_by`,
        [
          insight.id, insight.sessionId, insight.type, insight.title, insight.summary,
          insight.description ?? null, insight.confidence, insight.noveltyScore ?? 0.5,
          insight.actionable, insight.evidenceRefs, insight.createdAt,
          insight.verified, insight.verifiedBy ?? null, insight.tags,
        ],
      );
    } finally {
      client.release();
    }
  } catch (e) {
    console.warn("[DB] upsertInsight failed:", (e as Error).message);
  }
}

export async function getInsightsBySession(sessionId: string): Promise<Insight[]> {
  try {
    const p = getPool();
    const client = await p.connect();
    try {
      const rows = await client.query<{
        id: string; session_id: string; insight_type: string;
        title: string; summary: string; description: string;
        confidence: number; novelty_score: number; actionable: boolean;
        evidence_refs: string[]; created_at: Date; verified: boolean; tags: string[];
      }>(
        `SELECT * FROM insights WHERE session_id = $1 ORDER BY confidence DESC`,
        [sessionId],
      );
      return rows.rows.map((r) => ({
        id: r.id, sessionId: r.session_id, type: r.insight_type as InsightType,
        title: r.title, summary: r.summary, description: r.description,
        confidence: r.confidence, noveltyScore: r.novelty_score,
        actionable: r.actionable, evidenceRefs: r.evidence_refs ?? [],
        createdAt: r.created_at.toISOString(), verified: r.verified,
        verifiedBy: undefined, tags: r.tags ?? [],
      }));
    } finally {
      client.release();
    }
  } catch (e) {
    console.warn("[DB] getInsightsBySession failed:", (e as Error).message);
    return [];
  }
}

// ─── Sessions ────────────────────────────────────────────────────────────────

export async function upsertSession(
  id: string,
  title: string,
  description?: string,
  status = "active",
): Promise<void> {
  try {
    const p = getPool();
    const client = await p.connect();
    try {
      await client.query(
        `INSERT INTO sessions (id, title, description, status)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (id) DO UPDATE SET
           status = EXCLUDED.status,
           completed_at = CASE WHEN EXCLUDED.status = 'completed' THEN NOW() ELSE sessions.completed_at END`,
        [id, title, description ?? null, status],
      );
    } finally {
      client.release();
    }
  } catch (e) {
    const err = e as Error & { code?: string; detail?: string };
    const msg = err.message || String(e) || "(no message)";
    const code = err.code || "";
    const detail = err.detail || "";
    console.warn(`[DB] upsertSession failed: ${msg} | code=${code} detail=${detail}`);
  }
}

export async function completeSession(sessionId: string): Promise<void> {
  try {
    const p = getPool();
    const client = await p.connect();
    try {
      await client.query(
        `UPDATE sessions SET status = 'completed', completed_at = NOW() WHERE id = $1`,
        [sessionId],
      );
    } finally {
      client.release();
    }
  } catch (e) {
    console.warn("[DB] completeSession failed:", (e as Error).message);
  }
}

// ─── Agent Outputs ──────────────────────────────────────────────────────────

export async function saveAgentOutput(
  id: string,
  agent: string,
  sessionId: string,
  outputType: string,
  content: string,
  quality?: number,
): Promise<void> {
  try {
    const p = getPool();
    await p.query(
      `INSERT INTO agent_outputs (id, agent, session_id, output_type, content, quality)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, agent, sessionId, outputType, content, quality ?? null],
    );
  } catch (e) {
    console.warn("[DB] saveAgentOutput failed:", (e as Error).message);
  }
}

// ─── Graph Knowledge ─────────────────────────────────────────────────────────

export async function upsertGraphNode(node: GraphNode): Promise<void> {
  try {
    const p = getPool();
    await p.query(
      `INSERT INTO graph_nodes (id, type, name, summary, metadata, tags, confidence, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
       ON CONFLICT (id) DO UPDATE SET
         type = EXCLUDED.type,
         name = EXCLUDED.name,
         summary = EXCLUDED.summary,
         metadata = EXCLUDED.metadata,
         tags = EXCLUDED.tags,
         confidence = EXCLUDED.confidence`,
      [
        node.id,
        node.type,
        node.name,
        node.summary,
        JSON.stringify(node.metadata ?? {}),
        node.tags,
        node.confidence,
      ],
    );
  } catch (e) {
    console.warn("[DB] upsertGraphNode failed:", (e as Error).message);
  }
}

export async function upsertGraphEdge(edge: GraphEdge): Promise<void> {
  try {
    const p = getPool();
    await p.query(
      `INSERT INTO graph_edges (id, source_id, target_id, type, weight, description, session_id, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
       ON CONFLICT (id) DO UPDATE SET
         source_id = EXCLUDED.source_id,
         target_id = EXCLUDED.target_id,
         type = EXCLUDED.type,
         weight = EXCLUDED.weight,
         description = EXCLUDED.description`,
      [
        edge.id,
        edge.sourceId,
        edge.targetId,
        edge.type,
        edge.weight,
        edge.description ?? null,
        edge.sessionId,
      ],
    );
  } catch (e) {
    console.warn("[DB] upsertGraphEdge failed:", (e as Error).message);
  }
}

export async function getGraphNodesByType(type: string): Promise<GraphNode[]> {
  try {
    const p = getPool();
    const { rows } = await p.query<{
      id: string; type: string; name: string; summary: string;
      metadata: Record<string, unknown>; tags: string[];
      confidence: number; created_at: Date;
    }>(
      `SELECT * FROM graph_nodes WHERE type = $1 ORDER BY confidence DESC, created_at DESC`,
      [type],
    );
    return rows.map(rowToGraphNode);
  } catch (e) {
    console.warn("[DB] getGraphNodesByType failed:", (e as Error).message);
    return [];
  }
}

export async function getGraphEdgesByNode(nodeId: string): Promise<GraphEdge[]> {
  try {
    const p = getPool();
    const { rows } = await p.query<{
      id: string; source_id: string; target_id: string; type: string;
      weight: number; description: string; session_id: string; created_at: Date;
    }>(
      `SELECT * FROM graph_edges WHERE source_id = $1 OR target_id = $1`,
      [nodeId],
    );
    return rows.map(rowToGraphEdge);
  } catch (e) {
    console.warn("[DB] getGraphEdgesByNode failed:", (e as Error).message);
    return [];
  }
}

export async function searchGraphNodes(
  query: string,
  types?: string[],
  limit = 20,
): Promise<GraphNode[]> {
  try {
    const p = getPool();
    if (types?.length) {
      const { rows } = await p.query<{
        id: string; type: string; name: string; summary: string;
        metadata: Record<string, unknown>; tags: string[];
        confidence: number; created_at: Date;
      }>(
        `SELECT *, ts_rank(to_tsvector('english', coalesce(name,'') || ' ' || coalesce(summary,'')),
                           plainto_tsquery('english', $1)) AS rank
         FROM graph_nodes
         WHERE to_tsvector('english', coalesce(name,'') || ' ' || coalesce(summary,''))
               @@ plainto_tsquery('english', $1)
           AND type = ANY($2)
         ORDER BY rank DESC LIMIT $3`,
        [query, types, limit],
      );
      return rows.map(rowToGraphNode);
    }
    const { rows } = await p.query<{
      id: string; type: string; name: string; summary: string;
      metadata: Record<string, unknown>; tags: string[];
      confidence: number; created_at: Date;
    }>(
      `SELECT *, ts_rank(to_tsvector('english', coalesce(name,'') || ' ' || coalesce(summary,'')),
                         plainto_tsquery('english', $1)) AS rank
       FROM graph_nodes
       WHERE to_tsvector('english', coalesce(name,'') || ' ' || coalesce(summary,''))
             @@ plainto_tsquery('english', $1)
       ORDER BY rank DESC LIMIT $2`,
      [query, limit],
    );
    return rows.map(rowToGraphNode);
  } catch (e) {
    console.warn("[DB] searchGraphNodes failed:", (e as Error).message);
    return [];
  }
}

export async function getGraphStats(): Promise<{
  totalNodes: number;
  totalEdges: number;
  nodeTypes: Record<string, number>;
  edgeTypes: Record<string, number>;
}> {
  try {
    const p = getPool();
    const [nodesResult, edgesResult, nodeTypeResult, edgeTypeResult] = await Promise.all([
      p.query(`SELECT COUNT(*) as c FROM graph_nodes`),
      p.query(`SELECT COUNT(*) as c FROM graph_edges`),
      p.query(`SELECT type, COUNT(*) as c FROM graph_nodes GROUP BY type`),
      p.query(`SELECT type, COUNT(*) as c FROM graph_edges GROUP BY type`),
    ]);
    const nodeTypes: Record<string, number> = {};
    const edgeTypes: Record<string, number> = {};
    for (const r of nodeTypeResult.rows) nodeTypes[r.type] = Number(r.c);
    for (const r of edgeTypeResult.rows) edgeTypes[r.type] = Number(r.c);
    return {
      totalNodes: Number(nodesResult.rows[0]?.c ?? 0),
      totalEdges: Number(edgesResult.rows[0]?.c ?? 0),
      nodeTypes,
      edgeTypes,
    };
  } catch (e) {
    console.warn("[DB] getGraphStats failed:", (e as Error).message);
    return {
      totalNodes: 0, totalEdges: 0,
      nodeTypes: {}, edgeTypes: {},
    };
  }
}

export async function getFullGraph(limit = 500): Promise<{
  nodes: GraphNode[];
  edges: GraphEdge[];
}> {
  try {
    const p = getPool();
    const [nodesResult, edgesResult] = await Promise.all([
      p.query<{
        id: string; type: string; name: string; summary: string;
        metadata: Record<string, unknown>; tags: string[];
        confidence: number; created_at: Date;
      }>(`SELECT * FROM graph_nodes ORDER BY created_at DESC LIMIT $1`, [limit]),
      p.query<{
        id: string; source_id: string; target_id: string; type: string;
        weight: number; description: string; session_id: string; created_at: Date;
      }>(`SELECT * FROM graph_edges ORDER BY created_at DESC LIMIT $2`, [limit]),
    ]);
    return {
      nodes: nodesResult.rows.map(rowToGraphNode),
      edges: edgesResult.rows.map(rowToGraphEdge),
    };
  } catch (e) {
    console.warn("[DB] getFullGraph failed:", (e as Error).message);
    return { nodes: [], edges: [] };
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function rowToFinding(row: {
  id: string; topic: string; source_url: string; source_type: string;
  title: string; content: string; summary: string;
  confidence: number; created_by: string; created_at: Date;
  verified: boolean; tags: string[];
}): Finding {
  return {
    id: row.id, topic: row.topic,
    sourceUrl: row.source_url ?? undefined,
    sourceType: row.source_type as SourceType,
    title: row.title, content: row.content,
    summary: row.summary ?? undefined,
    confidence: row.confidence, createdBy: row.created_by as any,
    createdAt: row.created_at.toISOString(), verified: row.verified,
    verifiedBy: undefined, tags: row.tags ?? [],
  };
}

function rowToGraphNode(row: {
  id: string; type: string; name: string; summary: string;
  metadata: Record<string, unknown>; tags: string[];
  confidence: number; created_at: Date;
}): GraphNode {
  return {
    id: row.id,
    type: row.type as GraphNode["type"],
    name: row.name,
    summary: row.summary,
    metadata: row.metadata as GraphNode["metadata"],
    tags: row.tags ?? [],
    confidence: row.confidence,
    createdAt: row.created_at.toISOString(),
  };
}

function rowToGraphEdge(row: {
  id: string; source_id: string; target_id: string; type: string;
  weight: number; description: string; session_id: string; created_at: Date;
}): GraphEdge {
  return {
    id: row.id,
    sourceId: row.source_id,
    targetId: row.target_id,
    type: row.type as GraphEdge["type"],
    weight: row.weight,
    description: row.description ?? undefined,
    sessionId: row.session_id,
    createdAt: row.created_at.toISOString(),
  };
}
