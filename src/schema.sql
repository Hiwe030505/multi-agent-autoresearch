-- AutoResearch Knowledge Hub — PostgreSQL Schema
-- Run with: psql $DATABASE_URL -f schema.sql

-- Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- ─── Findings ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS findings (
  id          TEXT PRIMARY KEY,
  topic       TEXT NOT NULL,
  source_url  TEXT,
  source_type TEXT CHECK (source_type IN ('paper', 'web', 'book', 'internal')),
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

-- Vector similarity index
CREATE INDEX IF NOT EXISTS findings_embedding_idx
  ON findings USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Full-text search
CREATE INDEX IF NOT EXISTS findings_fts_idx
  ON findings USING gin(to_tsvector('english', coalesce(title,'') || ' ' || coalesce(content,'')));

-- Topic clustering
CREATE INDEX IF NOT EXISTS findings_topic_idx ON findings (topic);
CREATE INDEX IF NOT EXISTS findings_source_idx ON findings (source_type);

-- ─── Insights ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS insights (
  id              TEXT PRIMARY KEY,
  session_id      TEXT NOT NULL,
  insight_type    TEXT CHECK (insight_type IN (
                    'synthesis', 'contradiction', 'gap',
                    'transfer', 'failure', 'temporal'
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

CREATE INDEX IF NOT EXISTS insights_session_idx ON insights (session_id);
CREATE INDEX IF NOT EXISTS insights_type_idx ON insights (insight_type);

-- ─── Sessions ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sessions (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  description   TEXT,
  status        TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  completed_at  TIMESTAMPTZ,
  metadata      JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS sessions_status_idx ON sessions (status);

-- ─── Agent Outputs ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS agent_outputs (
  id          TEXT PRIMARY KEY,
  agent       TEXT NOT NULL,
  task_id     TEXT,
  session_id  TEXT,
  output_type TEXT CHECK (output_type IN ('result', 'feedback', 'code', 'report', 'insight')),
  content     TEXT NOT NULL,
  quality     REAL,
  reviewed    BOOLEAN DEFAULT FALSE,
  reviewed_by TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agent_outputs_agent_idx ON agent_outputs (agent);
CREATE INDEX IF NOT EXISTS agent_outputs_session_idx ON agent_outputs (session_id);

-- ─── Discussions ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS discussions (
  id            TEXT PRIMARY KEY,
  topic         TEXT NOT NULL,
  participants  TEXT[] DEFAULT '{}',
  messages      JSONB NOT NULL DEFAULT '[]',
  resolution    TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  resolved_at   TIMESTAMPTZ
);

-- ─── Code Patterns ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS code_patterns (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  language    TEXT NOT NULL,
  code        TEXT NOT NULL,
  explanation TEXT,
  use_cases   TEXT[] DEFAULT '{}',
  quality     REAL DEFAULT 0.5,
  source      TEXT,
  source_ids  TEXT[] DEFAULT '{}',
  created_by  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS code_patterns_lang_idx ON code_patterns (language);

-- ─── Task History ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS task_history (
  id            TEXT PRIMARY KEY,
  task_type     TEXT NOT NULL,
  topic         TEXT,
  input         TEXT,
  output        TEXT,
  agent_used    TEXT,
  duration_sec  INTEGER,
  quality_score REAL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS task_history_type_idx ON task_history (task_type);

-- ─── Graph Knowledge ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS graph_nodes (
  id          TEXT PRIMARY KEY,
  type        TEXT NOT NULL CHECK (type IN (
                    'paper','author','concept','method','dataset',
                    'finding','claim','limitation','gap'
                  )),
  name        TEXT NOT NULL,
  summary     TEXT NOT NULL DEFAULT '',
  metadata    JSONB DEFAULT '{}',
  tags        TEXT[] DEFAULT '{}',
  confidence  REAL DEFAULT 0.5,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS graph_nodes_type_idx ON graph_nodes (type);
CREATE INDEX IF NOT EXISTS graph_nodes_name_fts_idx
  ON graph_nodes USING gin(to_tsvector('english', coalesce(name,'') || ' ' || coalesce(summary,'')));

CREATE TABLE IF NOT EXISTS graph_edges (
  id          TEXT PRIMARY KEY,
  source_id   TEXT NOT NULL,
  target_id   TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN (
                    'cites','uses_method','uses_dataset','validates','contradicts',
                    'builds_upon','extends','related_to','succeeds','subdomain_of','authored_by'
                  )),
  weight      REAL DEFAULT 0.5,
  description TEXT,
  session_id  TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS graph_edges_source_idx ON graph_edges (source_id);
CREATE INDEX IF NOT EXISTS graph_edges_target_idx ON graph_edges (target_id);
CREATE INDEX IF NOT EXISTS graph_edges_type_idx ON graph_edges (type);
CREATE INDEX IF NOT EXISTS graph_edges_session_idx ON graph_edges (session_id);

-- ─── Functions ────────────────────────────────────────────────────────────────

-- Vector similarity search
CREATE OR REPLACE FUNCTION find_similar_findings(
  query_embedding VECTOR(1536),
  match_count INT DEFAULT 5,
  match_threshold REAL DEFAULT 0.7
)
RETURNS TABLE (
  id TEXT,
  topic TEXT,
  title TEXT,
  summary TEXT,
  similarity REAL,
  source_type TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    f.id,
    f.topic,
    f.title,
    f.summary,
    1 - (f.embedding <=> query_embedding) AS similarity,
    f.source_type
  FROM findings f
  WHERE f.embedding IS NOT NULL
    AND 1 - (f.embedding <=> query_embedding) > match_threshold
  ORDER BY f.embedding <=> query_embedding
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql;

-- Topic clustering (simple)
CREATE OR REPLACE FUNCTION cluster_findings_by_topic()
RETURNS TABLE (topic TEXT, count BIGINT, avg_confidence REAL) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(NULLIF(regexp_replace(lower(trim(f.topic)), '\s+', '_', 'g'), ''), 'uncategorized') AS topic,
    COUNT(*) AS count,
    AVG(f.confidence) AS avg_confidence
  FROM findings f
  GROUP BY 1
  ORDER BY count DESC;
END;
$$ LANGUAGE plpgsql;
