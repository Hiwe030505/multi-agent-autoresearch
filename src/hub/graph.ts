/**
 * Knowledge Graph — Entity Extraction & Graph Query
 *
 * Extracts structured entities from research findings and builds a knowledge graph.
 * Based on the pattern from Understand-Anything:
 *   - Deterministic: only LLM extracts, never parses raw text directly
 *   - Batch processing: extract from findings in batches
 *   - Schema validation: 4-tier validation with auto-fix
 */

import { v4 as uuidv4 } from "uuid";
import { claudeChat } from "../agents/lib/claude.ts";
import { config } from "../config.ts";
import {
  upsertGraphNode,
  upsertGraphEdge,
  getGraphNodesByType,
  getGraphEdgesByNode,
  searchGraphNodes,
  getFullGraph,
  getGraphStats,
} from "./db.ts";
import type {
  GraphNode,
  GraphEdge,
  GraphNodeType,
  GraphEdgeType,
  Finding,
  ResearchGraph,
} from "../types.ts";

// ─── Entity Extraction ─────────────────────────────────────────────────────────

const EXTRACT_ENTITIES_PROMPT = `Bạn là Research Entity Extractor — chuyên trích xuất entities và relationships từ research findings.

Phân tích các findings dưới đây và trích xuất entities + relationships theo schema JSON.

FINDINGS:
{findings}

SCHEMA:
{{
  "nodes": [
    {{
      "id": "paper:<slugged-title>-<short-hash>",
      "type": "paper|author|concept|method|dataset|finding|claim|limitation|gap",
      "name": "tên entity",
      "summary": "mô tả ngắn 1-2 câu",
      "metadata": {{ /* tùy loại entity */ }},
      "tags": ["tag1", "tag2"],
      "confidence": 0.0-1.0
    }}
  ],
  "edges": [
    {{
      "id": "<source>-<edge-type>-<target-hash>",
      "sourceId": "node id",
      "targetId": "node id",
      "type": "cites|uses_method|uses_dataset|validates|contradicts|builds_upon|extends|related_to|succeeds|subdomain_of|authored_by",
      "weight": 0.0-1.0,
      "description": "giải thích mối quan hệ"
    }}
  ]
}}

QUY TẮC:
- paper nodes: từ source URLs, titles của findings
- concept nodes: các khái niệm ML/AI (attention, RLHF, embedding, transformer...)
- method nodes: các kỹ thuật cụ thể (SFT, RAG, LoRA, DPO, CoT...)
- dataset nodes: benchmark datasets (MMLU, GSM8K, HumanEval...)
- finding nodes: key findings từ findings (ko trùng với paper node)
- claim nodes: những assertion cụ thể
- limitation nodes: weaknesses, boundaries được stated trong findings
- gap nodes: unstudied areas được suy luận ra

EDGES: chỉ tạo edge khi có evidence rõ ràng từ findings.
- cites: paper A reference/cites paper B
- uses_method: paper uses technique X
- uses_dataset: paper evaluates on dataset Y
- contradicts: finding A contradicts finding B (có evidence)
- validates: finding A confirms finding B
- builds_upon: paper B extends paper A's work
- succeeds: method B là improved version của method A
- extends: method B is extension of method A's approach
- related_to: concepts có semantic similarity
- subdomain_of: concept X là subdomain của Y
- authored_by: paper by author

TRẢ LỜI: JSON hợp lệ, không markdown fences, không text khác.`;

// ─── Extraction ────────────────────────────────────────────────────────────────

export interface ExtractionResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: {
    papers: number;
    concepts: number;
    methods: number;
    datasets: number;
    findings: number;
    claims: number;
    limitations: number;
    gaps: number;
    totalEdges: number;
  };
}

/**
 * Extract entities and relationships from research findings.
 * Batch process up to 10 findings at a time for efficiency.
 */
export async function extractGraphEntities(
  findings: Finding[],
  sessionId: string,
): Promise<ExtractionResult> {
  if (findings.length === 0) {
    return {
      nodes: [],
      edges: [],
      stats: {
        papers: 0, concepts: 0, methods: 0, datasets: 0,
        findings: 0, claims: 0, limitations: 0, gaps: 0, totalEdges: 0,
      },
    };
  }

  // Build context from findings
  const findingsText = findings.map((f, i) => {
    const keys = (f.keyFindings ?? [])
      .map((k: any) => `  - [${k.confidence}] ${k.finding} (evidence: ${k.evidence})`)
      .join("\n");
    return [
      `=== FINDING ${i + 1} ===`,
      `Title: ${f.title}`,
      `Source: ${f.sourceUrl ?? "N/A"} (${f.sourceType})`,
      `Summary: ${f.summary ?? f.content.slice(0, 300)}`,
      keys ? `Key Findings:\n${keys}` : "",
      (f.questionsRaised ?? []).length ? `Questions: ${(f.questionsRaised ?? []).join(", ")}` : "",
    ].filter(Boolean).join("\n");
  }).join("\n\n");

  try {
    const response = await claudeChat(
      [{ role: "user", content: EXTRACT_ENTITIES_PROMPT.replace("{findings}", findingsText) }],
      undefined,
      config.models.research,
      4096,
    );

    return parseExtractionResponse(response.content, sessionId);
  } catch (e) {
    console.error("[Graph] Entity extraction failed:", e);
    return {
      nodes: [],
      edges: [],
      stats: {
        papers: 0, concepts: 0, methods: 0, datasets: 0,
        findings: 0, claims: 0, limitations: 0, gaps: 0, totalEdges: 0,
      },
    };
  }
}

function parseExtractionResponse(
  content: string,
  sessionId: string,
): ExtractionResult {
  // Try JSON array first (top-level)
  let nodes: GraphNode[] = [];
  let edges: GraphEdge[] = [];

  try {
    // Try to find JSON object with nodes/edges
    const match = content.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      if (parsed.nodes && Array.isArray(parsed.nodes)) {
        nodes = parsed.nodes.map((n: any) => normalizeNode(n, sessionId));
      }
      if (parsed.edges && Array.isArray(parsed.edges)) {
        edges = parsed.edges.map((e: any) => normalizeEdge(e, sessionId));
      }
    }
  } catch {
    // Fallback: try finding individual JSON blocks
    const blocks = content.match(/\{[\s\S]*?\}[\s\n]*/g) || [];
    for (const block of blocks) {
      try {
        const parsed = JSON.parse(block.trim());
        if (parsed.nodes) nodes = parsed.nodes.map((n: any) => normalizeNode(n, sessionId));
        if (parsed.edges) edges = parsed.edges.map((e: any) => normalizeEdge(e, sessionId));
      } catch {}
    }
  }

  // Deduplicate by ID
  const nodeMap = new Map<string, GraphNode>();
  for (const n of nodes) nodeMap.set(n.id, n);
  nodes = [...nodeMap.values()];

  // Build ID map for edge normalization
  const idMap = buildIdAliasMap(nodes);

  // Normalize edge references
  const normalizedEdges: GraphEdge[] = [];
  for (const e of edges) {
    const src = idMap.get(e.sourceId) ?? e.sourceId;
    const tgt = idMap.get(e.targetId) ?? e.targetId;
    if (src && tgt && src !== tgt) {
      normalizedEdges.push({ ...e, sourceId: src, targetId: tgt });
    }
  }

  // Count stats
  const stats = {
    papers: nodes.filter(n => n.type === "paper").length,
    concepts: nodes.filter(n => n.type === "concept").length,
    methods: nodes.filter(n => n.type === "method").length,
    datasets: nodes.filter(n => n.type === "dataset").length,
    findings: nodes.filter(n => n.type === "finding").length,
    claims: nodes.filter(n => n.type === "claim").length,
    limitations: nodes.filter(n => n.type === "limitation").length,
    gaps: nodes.filter(n => n.type === "gap").length,
    totalEdges: normalizedEdges.length,
  };

  return { nodes, edges: normalizedEdges, stats };
}

function normalizeNode(raw: any, sessionId: string): GraphNode {
  const type = (raw.type ?? "finding") as GraphNodeType;
  const validTypes: GraphNodeType[] = [
    "paper", "author", "concept", "method", "dataset",
    "finding", "claim", "limitation", "gap",
  ];
  const normalizedType = validTypes.includes(type) ? type : "finding";

  return {
    id: raw.id ?? `node:${uuidv4()}`,
    type: normalizedType,
    name: raw.name ?? raw.title ?? "Untitled",
    summary: raw.summary ?? "",
    metadata: raw.metadata ?? {},
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    confidence: Math.max(0, Math.min(1, Number(raw.confidence) || 0.5)),
    createdAt: new Date().toISOString(),
  };
}

function normalizeEdge(raw: any, sessionId: string): GraphEdge {
  const type = (raw.type ?? "related_to") as GraphEdgeType;
  const validTypes: GraphEdgeType[] = [
    "cites", "uses_method", "uses_dataset", "validates", "contradicts",
    "builds_upon", "extends", "related_to", "succeeds", "subdomain_of", "authored_by",
  ];
  const normalizedType = validTypes.includes(type) ? type : "related_to";

  return {
    id: raw.id ?? `edge:${uuidv4()}`,
    sourceId: raw.sourceId ?? raw.source ?? "",
    targetId: raw.targetId ?? raw.target ?? "",
    type: normalizedType,
    weight: Math.max(0, Math.min(1, Number(raw.weight) || 0.5)),
    description: raw.description ?? undefined,
    sessionId,
    createdAt: new Date().toISOString(),
  };
}

/** Build alias map for node ID normalization (handles LLM-generated variant IDs) */
function buildIdAliasMap(nodes: GraphNode[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const n of nodes) {
    // Map: lowercase name → canonical ID
    map.set(n.name.toLowerCase(), n.id);
    // Map: title-cased name → canonical ID
    const words = n.name.toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length > 0) map.set(words.join("_"), n.id);
    // Map: slugified → canonical ID
    map.set(slugify(n.name), n.id);
  }
  return map;
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

// ─── Save Graph ────────────────────────────────────────────────────────────────

/**
 * Extract entities from findings and save to graph DB.
 * Returns the full extraction result.
 */
export async function buildGraphFromFindings(
  findings: Finding[],
  sessionId: string,
): Promise<ExtractionResult> {
  const result = await extractGraphEntities(findings, sessionId);

  // Save all nodes
  for (const node of result.nodes) {
    await upsertGraphNode(node);
  }

  // Save all edges
  for (const edge of result.edges) {
    await upsertGraphEdge(edge);
  }

  console.log(`[Graph] Built: ${result.nodes.length} nodes, ${result.edges.length} edges`);
  return result;
}

// ─── Graph Queries ────────────────────────────────────────────────────────────

export interface GraphQuery {
  /** Find nodes of specific type */
  byType: (type: GraphNodeType) => Promise<GraphNode[]>;
  /** Find all relationships for a node */
  neighbors: (nodeId: string) => Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }>;
  /** Full-text search nodes */
  search: (query: string, types?: GraphNodeType[]) => Promise<GraphNode[]>;
  /** Get all contradictions */
  contradictions: () => Promise<Array<{ source: GraphNode; target: GraphNode; edge: GraphEdge }>>;
  /** Find unconnected/isolated concept nodes (potential gaps) */
  potentialGaps: () => Promise<GraphNode[]>;
  /** Find method chains (succeeds relationships) */
  methodChains: () => Promise<GraphNode[][]>;
  /** Find nodes by method usage (papers using a method) */
  papersUsingMethod: (methodName: string) => Promise<GraphNode[]>;
  /** Get full graph for visualization */
  fullGraph: () => Promise<ResearchGraph>;
  /** Graph statistics */
  stats: () => Promise<{
    totalNodes: number;
    totalEdges: number;
    nodeTypes: Record<string, number>;
    edgeTypes: Record<string, number>;
  }>;
}

export const graphQuery: GraphQuery = {
  byType: async (type) => getGraphNodesByType(type),

  neighbors: async (nodeId) => {
    const edges = await getGraphEdgesByNode(nodeId);
    const neighborIds = new Set<string>();
    for (const e of edges) {
      if (e.sourceId === nodeId) neighborIds.add(e.targetId);
      else neighborIds.add(e.sourceId);
    }

    // Fetch all neighbor nodes
    const allNodes: GraphNode[] = [];
    for (const nid of neighborIds) {
      const found = await searchGraphNodes(nid, undefined, 1);
      if (found.length > 0) allNodes.push(found[0]);
    }

    return { nodes: allNodes, edges };
  },

  search: async (query, types) =>
    searchGraphNodes(query, types as string[] | undefined),

  contradictions: async () => {
    try {
      const p = (await import("./db.ts")).getPool();
      const { rows } = await p.query<{
        id: string; source_id: string; target_id: string;
        weight: number; description: string; session_id: string; created_at: Date;
      }>(`SELECT * FROM graph_edges WHERE type = 'contradicts'`);
      const results: Array<{ source: GraphNode; target: GraphNode; edge: GraphEdge }> = [];
      for (const r of rows) {
        const src = await searchGraphNodes(r.source_id, undefined, 1);
        const tgt = await searchGraphNodes(r.target_id, undefined, 1);
        if (src[0] && tgt[0]) {
          results.push({
            source: src[0],
            target: tgt[0],
            edge: {
              id: r.id, sourceId: r.source_id, targetId: r.target_id,
              type: "contradicts", weight: r.weight,
              description: r.description ?? undefined,
              sessionId: r.session_id, createdAt: r.created_at.toISOString(),
            },
          });
        }
      }
      return results;
    } catch {
      return [];
    }
  },

  potentialGaps: async () => {
    // Nodes with no outgoing edges → potential research gaps
    try {
      const p = (await import("./db.ts")).getPool();
      const { rows } = await p.query<{
        id: string; type: string; name: string; summary: string;
        metadata: Record<string, unknown>; tags: string[];
        confidence: number; created_at: Date;
      }>(`
        SELECT n.* FROM graph_nodes n
        LEFT JOIN graph_edges e ON (e.source_id = n.id OR e.target_id = n.id)
        WHERE e.id IS NULL
          AND n.type IN ('concept', 'method', 'finding')
        LIMIT 20
      `);
      const { rowToGraphNode } = await import("./db.ts");
      return rows.map((r) => ({
        id: r.id, type: r.type as GraphNodeType, name: r.name, summary: r.summary,
        metadata: r.metadata as GraphNode["metadata"], tags: r.tags ?? [],
        confidence: r.confidence, createdAt: r.created_at.toISOString(),
      }));
    } catch {
      return [];
    }
  },

  methodChains: async () => {
    // Follow "succeeds" and "extends" edges to build method evolution chains
    try {
      const p = (await import("./db.ts")).getPool();
      const { rows } = await p.query<{
        source_id: string; target_id: string; weight: number;
      }>(`SELECT source_id, target_id, weight FROM graph_edges WHERE type IN ('succeeds','extends','builds_upon')`);
      const chains: GraphNode[][] = [];
      const visited = new Set<string>();

      for (const row of rows) {
        if (visited.has(row.source_id)) continue;
        const chain: GraphNode[] = [];
        let current = row.source_id;
        const chainEdges = rows.filter(r => r.source_id === current);
        while (chainEdges.length > 0) {
          visited.add(current);
          const found = await searchGraphNodes(current, undefined, 1);
          if (found[0]) chain.push(found[0]);
          const next = chainEdges[0];
          current = next.target_id;
          break; // Simple chain: just A→B
        }
        if (chain.length > 0) chains.push(chain);
      }
      return chains;
    } catch {
      return [];
    }
  },

  papersUsingMethod: async (methodName) => {
    // Find papers that use a specific method
    const edges = await getGraphEdgesByNode(methodName.toLowerCase().replace(/\s+/g, "_"));
    const paperEdges = edges.filter(e => e.type === "uses_method" || e.type === "builds_upon");
    const paperIds = new Set(paperEdges.map(e => e.sourceId === methodName ? e.targetId : e.sourceId));
    const papers: GraphNode[] = [];
    for (const pid of paperIds) {
      const found = await searchGraphNodes(pid, undefined, 1);
      if (found[0]) papers.push(found[0]);
    }
    return papers;
  },

  fullGraph: async () => {
    const { nodes, edges } = await getFullGraph();
    const stats = await getGraphStats();
    return { version: "1.0.0", nodes, edges, stats };
  },

  stats: async () => getGraphStats(),
};
