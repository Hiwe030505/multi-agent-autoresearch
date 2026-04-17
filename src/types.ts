// ─── Core Types ──────────────────────────────────────────────────────────────

export type AgentName =
  | "orchestrator"
  | "researcher"
  | "reasoner"
  | "coder"
  | "analyst"
  | "writer"
  | "reviewer"
  | "graph-builder";

export type MessageType =
  | "TASK" | "RESULT" | "ASK" | "ANSWER"
  | "FEEDBACK" | "PROGRESS" | "BROADCAST"
  | "CONSENSUS" | "REASONING" | "ARCHIVE";

export type Priority = 0 | 1 | 2 | 3;

export type TaskStatus = "pending" | "assigned" | "in_progress" | "review" | "completed" | "failed" | "blocked";

export type InsightType = "synthesis" | "contradiction" | "gap" | "transfer" | "failure" | "temporal";

export type SourceType = "paper" | "web" | "book" | "internal";

// ─── Attachment ────────────────────────────────────────────────────────────────

export interface Attachment {
  type: "finding" | "code" | "report" | "chart";
  id: string;
  name?: string;
}

// ─── Message ─────────────────────────────────────────────────────────────────

export interface AgentMessage {
  id: string;
  type: MessageType;
  from: AgentName;
  to: AgentName | "broadcast" | "orchestrator";
  timestamp: string;
  topic: string;
  priority?: Priority;
  payload: {
    content: string;
    attachments?: Attachment[];
    context?: Record<string, unknown>;
    refs?: string[];     // finding/insight IDs
    confidence?: number; // 0-1
    quality?: number;     // 0-1
  };
  status: "pending" | "sent" | "delivered" | "read" | "archived";
}

// ─── Finding ─────────────────────────────────────────────────────────────────

export interface Finding {
  id: string;
  topic: string;
  sourceUrl?: string;
  sourceType: SourceType;
  title: string;
  content: string;
  summary?: string;
  embedding?: number[];  // vector
  confidence: number;
  createdBy: AgentName;
  createdAt: string;
  verified: boolean;
  verifiedBy?: AgentName;
  tags: string[];
  keyFindings?: KeyFinding[];
  questionsRaised?: string[];
  connections?: string[]; // finding IDs
  metadata?: Record<string, unknown>;
}

export interface KeyFinding {
  finding: string;
  evidence: string;
  confidence: number;
}

// ─── Insight ─────────────────────────────────────────────────────────────────

export interface Insight {
  id: string;
  sessionId: string;
  type: InsightType;
  title: string;
  summary: string;
  description?: string;
  confidence: number;
  noveltyScore?: number;
  actionable: boolean;
  evidenceRefs: string[];  // finding IDs
  createdAt: string;
  verified: boolean;
  verifiedBy?: AgentName;
  tags: string[];
}

export interface InsightSession {
  id: string;
  totalFindingsAnalyzed: number;
  insights: Insight[];
  knowledgeGaps: string[];
  researchTrends: {
    rising: string[];
    declining: string[];
    stable: string[];
  };
  generatedAt: string;
}

// ─── Task ───────────────────────────────────────────────────────────────────

export interface Task {
  id: string;
  title: string;
  description: string;
  type: string;
  priority: Priority;
  status: TaskStatus;
  assignedTo?: AgentName;
  subtasks?: Task[];
  parentId?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  deadline?: string;
  retryCount: number;
  output?: string;
  error?: string;
}

// ─── Agent Status ────────────────────────────────────────────────────────────

export interface AgentStatus {
  name: AgentName;
  status: "idle" | "busy" | "error" | "offline";
  currentTask?: string;
  lastSeen: string;
  completedTasks: number;
  avgQuality: number;
}

// ─── API Schemas ─────────────────────────────────────────────────────────────

export interface ResearchRequest {
  topic: string;
  keywords?: string[];
  maxSources?: number;
  targetSources?: string[];  // arxiv, web, etc.
}

export interface ResearchResponse {
  sessionId: string;
  status: "started" | "completed" | "failed";
  findings?: Finding[];
  insights?: InsightSession;
  message?: string;
}

export interface TaskCreateRequest {
  title: string;
  description: string;
  type: string;
  priority?: Priority;
  deadline?: string;
}

// ─── Graph Knowledge Types ──────────────────────────────────────────────────

/** Node types for research paper graph */
export type GraphNodeType =
  | "paper"        // research paper
  | "author"       // paper author
  | "concept"      // ML/concept (attention, RLHF, embedding)
  | "method"        // technique/method (SFT, RAG, LoRA)
  | "dataset"       // benchmark dataset (MMLU, GSM8K, HumanEval)
  | "finding"       // specific result from a paper
  | "claim"        // assertion made in a paper
  | "limitation"   // stated weakness or boundary
  | "gap";         // unstudied area (derived)

/** Edge types for research paper graph */
export type GraphEdgeType =
  | "cites"           // paper A cites paper B
  | "uses_method"     // paper uses technique X
  | "uses_dataset"     // paper evaluates on dataset Y
  | "validates"       // finding A validates finding B
  | "contradicts"      // finding A contradicts finding B
  | "builds_upon"     // paper B extends paper A
  | "extends"          // method B is extension of method A
  | "related_to"       // semantic similarity between concepts
  | "succeeds"         // method B supersedes method A (temporal)
  | "subdomain_of"      // concept X is a subdomain of Y
  | "authored_by";      // paper authored by author

export interface GraphNode {
  id: string;
  type: GraphNodeType;
  name: string;
  summary: string;
  metadata?: {
    paperId?: string;       // link to finding/paper
    sessionId?: string;
    year?: number;
    venue?: string;
    authors?: string[];
    arxivId?: string;
    lineRange?: [number, number];
    [key: string]: unknown;
  };
  tags: string[];
  confidence: number;
  createdAt: string;
}

export interface GraphEdge {
  id: string;
  sourceId: string;
  targetId: string;
  type: GraphEdgeType;
  weight: number;        // 0.0–1.0 significance
  description?: string;
  sessionId: string;
  createdAt: string;
}

export interface ResearchGraph {
  version: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: {
    totalNodes: number;
    totalEdges: number;
    nodeTypes: Record<GraphNodeType, number>;
    edgeTypes: Record<GraphEdgeType, number>;
  };
}
