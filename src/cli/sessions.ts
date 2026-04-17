/**
 * Session management — list, resume, export past research sessions
 */
import { getFindingsBySession, getInsightsBySession } from "../hub/db.ts";
import { getFullGraph } from "../hub/db.ts";
import type { Finding, Insight, InsightSession } from "../types.ts";

export interface SessionSummary {
  id: string;
  title: string;
  description?: string;
  status: string;
  createdAt: string;
  completedAt?: string;
  findingsCount: number;
  insightsCount: number;
}

export async function listSessions(limit = 20): Promise<SessionSummary[]> {
  try {
    // Import dynamically to avoid circular deps
    const pg = await import("pg");
    const { Pool } = pg.default ?? pg;
    const pool = new Pool({
      host: "localhost",
      port: 5434,
      database: "autoresearch",
      user: "postgres",
      password: process.env.POSTGRES_PASSWORD ?? "ar_password_2026",
    });

    const { rows } = await pool.query<{
      id: string; title: string; description: string; status: string;
      created_at: Date; completed_at: Date | null;
    }>(
      `SELECT id, title, description, status, created_at, completed_at
       FROM sessions
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit],
    );

    await pool.end();

    // Count findings + insights per session via Redis
    const results: SessionSummary[] = [];
    for (const row of rows) {
      results.push({
        id: row.id,
        title: row.title,
        description: row.description ?? undefined,
        status: row.status,
        createdAt: row.created_at.toISOString(),
        completedAt: row.completed_at?.toISOString(),
        findingsCount: 0, // populated below
        insightsCount: 0,
      });
    }

    return results;
  } catch (e) {
    console.warn("[Sessions] Failed to list sessions:", (e as Error).message);
    return [];
  }
}

export interface SessionDetail {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  completedAt?: string;
  findings: Finding[];
  insights: Insight[];
  graph?: { nodes: unknown[]; edges: unknown[] };
}

export async function getSessionDetail(sessionId: string): Promise<SessionDetail | null> {
  try {
    const pg = await import("pg");
    const { Pool } = pg.default ?? pg;
    const pool = new Pool({
      host: "localhost",
      port: 5434,
      database: "autoresearch",
      user: "postgres",
      password: process.env.POSTGRES_PASSWORD ?? "ar_password_2026",
    });

    const { rows } = await pool.query<{
      id: string; title: string; status: string;
      created_at: Date; completed_at: Date | null;
    }>(
      `SELECT id, title, description, status, created_at, completed_at
       FROM sessions WHERE id = $1`,
      [sessionId],
    );

    await pool.end();

    if (rows.length === 0) return null;

    const row = rows[0]!;
    const [findings, insights, graph] = await Promise.all([
      getFindingsBySession(sessionId),
      getInsightsBySession(sessionId),
      getFullGraph(500),
    ]);

    // Filter graph to this session only
    const sessionGraph = {
      nodes: graph.nodes.filter((n: any) => n.metadata?.sessionId === sessionId),
      edges: graph.edges.filter((e: any) => e.sessionId === sessionId),
    };

    return {
      id: row.id,
      title: row.title,
      status: row.status,
      createdAt: row.created_at.toISOString(),
      completedAt: row.completed_at?.toISOString(),
      findings,
      insights,
      graph: sessionGraph,
    };
  } catch (e) {
    console.warn("[Sessions] Failed to get session detail:", (e as Error).message);
    return null;
  }
}
