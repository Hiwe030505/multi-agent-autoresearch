# AutoResearch Multi-Agent System
## Version 1.0 | 2026-04-05

---

## Mục lục
1. [Tổng quan](#1-tổng-quan)
2. [Kiến trúc hệ thống](#2-kiến-trúc-hệ-thống)
3. [Agent Definitions](#3-agent-definitions)
4. [Reasoning Agent — Deep Insights Engine](#4-reasoning-agent--deep-insights-engine)
5. [Knowledge Hub](#5-knowledge-hub)
6. [Communication Protocol](#6-communication-protocol)
7. [Workflow Patterns](#7-workflow-patterns)
8. [Orchestrator Logic](#8-orchestrator-logic)
9. [Task Lifecycle](#9-task-lifecycle)
10. [Triển khai — Phase by Phase](#10-triển-khai--phase-by-phase)
11. [Điểm mạnh & Điểm yếu](#11-điểm-mạnh--điểm-yếu)
12. [Technology Stack](#12-technology-stack)

---

## 1. Tổng quan

### 1.1 Mục tiêu
Xây dựng hệ thống **AutoResearch** — một nhóm nghiên cứu tự động gồm nhiều AI agent hoạt động độc lập, chia sẻ tri thức, và hợp tác như một nhóm **Senior Research Team**.

Giống như NotebookLM có thể đọc hàng chục paper và đưa ra *deep insights* — hệ thống này mở rộng khả năng đó bằng cách:
- Nhiều agents chuyên môn làm việc song song
- Chia sẻ tri thức qua shared memory
- Có **Orchestrator** điều phối như Project Manager
- Có **Reasoning Agent** tìm ra *hidden connections* giữa các paper

### 1.2 So sánh với giải pháp hiện tại

| Khía cạnh | NotebookLM | AutoResearch (ta) |
|-----------|-----------|------------------|
| Số lượng sources | 50-100 papers | Unlimited (theo scaling) |
| Agents chuyên môn | Không | 6 agent types |
| Parallel processing | Không | Có (nhiều agents song song) |
| Code generation | Không | Có (Coder Agent) |
| Self-verification | Không | Có (Reviewer Agent) |
| Memory dài hạn | Không | Có (Knowledge Hub) |
| Reuse kiến thức cũ | Không | Có (vector search) |
| Escalation to human | Không | Có |

---

## 2. Kiến trúc hệ thống

### 2.1 High-Level Architecture

```
╔══════════════════════════════════════════════════════════════╗
║                    AUTO RESEARCH SYSTEM                         ║
╠══════════════════════════════════════════════════════════════╣
║                                                               ║
║   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐   ║
║   │ Orchestrator │    │ Reasoning    │    │  Knowledge   │   ║
║   │   Agent      │◄──►│   Agent      │◄──►│    Hub       │   ║
║   │ (PM Layer)   │    │ (Insights)   │    │              │   ║
║   └──────┬───────┘    └──────┬───────┘    └──────┬───────┘   ║
║          │                   │                   │           ║
║          │    ┌──────────────┼──────────────┐    │           ║
║          │    │              │              │    │           ║
║   ┌──────┴────┴──────┐ ┌─────┴────┐ ┌──────┴──┐  │           ║
║   │  Task Queue      │ │ Vector   │ │ Shared  │  │           ║
║   │  (priority)      │ │ Index    │ │ Memory  │  │           ║
║   └──────────────────┘ │(embed-   │ │ (Redis) │◄─┘           ║
║                        │ dings)   │ │         │              ║
║                        └──────────┘ └─────────┘              ║
║                                                               ║
║   ┌─────────────────────────────────────────────────────┐      ║
║   │              AGENT WORKERS (Peer Layer)             │      ║
║   │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌────────┐  │      ║
║   │  │Researcher│ │ Coder   │ │ Analyst │ │ Writer │  │      ║
║   │  │  Agent   │ │ Agent   │ │  Agent  │ │ Agent  │  │      ║
║   │  └────┬─────┘ └────┬────┘ └────┬────┘ └───┬────┘  │      ║
║   │       └────────────┴───────────┴──────────┘       │      ║
║   │                       │                           │      ║
║   │                ┌──────┴──────┐                    │      ║
║   │                │ Reviewer    │                    │      ║
║   │                │   Agent     │                    │      ║
║   └────────────────┴─────────────┴────────────────────┘      ║
║                                                               ║
╚══════════════════════════════════════════════════════════════╝
```

### 2.2 Data Flow

```
USER INPUT: "Research paper about RAG + Knowledge Graph"
        │
        ▼
   Orchestrator
        │
   [1] Query Knowledge Hub ──→ Vector Search ──→ Similar past research?
        │
   [2] DECOMPOSE TASK
        │
        ├─► Research Agent ──► Web/Paper search
        │         │
        │    [Extract key findings]
        │         │
        ├─► Reasoning Agent ──► Cross-paper insight discovery
        │         │
        │    [Find hidden connections]
        │         │
        ├─► Coder Agent ──► Implement demo/prototype
        │         │
        ├─► Analyst Agent ──► Data analysis + visualization
        │         │
        ├─► Writer Agent ──► Write report
        │         │
        └─► Reviewer Agent ──► Quality check
                        │
                   [PASS?]
                    /       \
                 YES        NO ──► Retry subtask
                   │
                   ▼
            Archive to Knowledge Hub
                   │
                   ▼
          Final Output → User
```

### 2.3 Shared Memory Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    KNOWLEDGE HUB                             │
├─────────────┬──────────────────┬────────────────────────────┤
│  Long-term  │   Working        │   Communication            │
│  Memory     │   Context        │   History                  │
├─────────────┼──────────────────┼────────────────────────────┤
│ Vector DB   │   Redis          │   JSONL File              │
│ (pgvector)  │   (hot data)     │   (full log)              │
├─────────────┼──────────────────┼────────────────────────────┤
│ - Papers    │ - Current tasks  │ - All agent messages      │
│ - Findings   │ - Pending queue │ - Decision rationale      │
│ - Insights   │ - Agent outputs │ - Error log               │
│ - Code lib   │ - Project state │ - Review threads          │
├─────────────┼──────────────────┼────────────────────────────┤
│ Embedding   │ Structured        │ Full-text                │
│ similarity  │ key-value hash   │ search + filters         │
│ search      │ + lists           │ by agent/topic/date       │
└─────────────┴──────────────────┴────────────────────────────┘
```

---

## 3. Agent Definitions

### 3.1 Orchestrator Agent (🧠)

**Vai trò:** Project Manager — điều phối toàn bộ hệ thống

**Inputs:** User goals, research topics, task priorities
**Outputs:** Task assignments, progress updates, final synthesis

**Core behaviors:**
- Task decomposition (lớn → nhỏ)
- Agent assignment (dựa trên skills + availability)
- Deadlines and priority queuing
- Result merging từ nhiều agents
- Conflict resolution khi agents disagree
- Human escalation khi cần

**System prompt template:**
```
Bạn là Orchestrator — Project Manager của nhóm nghiên cứu AI.
Bạn có 5 agents dưới quyền: Researcher, Coder, Analyst, Writer, Reviewer.
Mỗi agent có skills riêng. Bạn điều phối họ làm việc hiệu quả.

QUY TRÌNH KHI NHẬN TASK:
1. Query Knowledge Hub xem đã có research tương tự chưa
2. Decompose task thành subtasks
3. Assign cho agent phù hợp nhất
4. Poll progress
5. Merge kết quả
6. Gửi Reviewer verify
7. Archive vào Knowledge Hub

ĐỘ ƯU TIÊN:
- P0 = Critical (24h) — escalated to human if blocked
- P1 = High (3 ngày)
- P2 = Medium (1 tuần)
- P3 = Low (backlog)

CHỈ SỐ HIỆU QUẢ:
- Đo thời gian hoàn thành mỗi task
- Đếm retry count
- Track confidence scores
```

### 3.2 Research Agent (🔬)

**Vai trò:** Senior Researcher — tìm kiếm, đọc, tổng hợp tài liệu

**Inputs:** Research topic, keywords, target sources
**Outputs:** Finding summaries, citations, structured notes, embeddings

**Capabilities:**
- Web search (multiple engines)
- PDF reading + extraction
- arXiv/papers with code search
- Citation graph traversal
- Summarization (extractive + abstractive)
- Structured note-taking (similar Obsidian)

**Output format:**
```json
{
  "finding_id": "f_001",
  "topic": "RAG architecture",
  "source": "https://arxiv.org/...",
  "source_type": "paper|web|book",
  "key_findings": [
    {
      "finding": "Chunk size 512 tối ưu cho RAG",
      "evidence": "page 5, experiment 2",
      "confidence": 0.9
    }
  ],
  "summary": "2-3 sentences",
  "questions_raised": ["..."],
  "connections": ["connected_to: f_003"],
  "embeddings": [0.1, 0.2, ...]
}
```

### 3.3 Reasoning Agent (🧩) — Deep Insights Engine

**Vai trò:** Senior Research Analyst — tìm **hidden connections** giữa các nghiên cứu

**Đây là core differentiator** so với NotebookLM. Không chỉ tìm kiếm — mà **reasoning** để tìm ra:
- Contradictions giữa các papers
- Complementary insights (paper A bổ sung paper B)
- Historical progression (kiến thức tiến hóa thế nào)
- Missing pieces (điều chưa ai nghiên cứu)
- Cross-domain connections (AI × Biology × Physics × ...)
- Counter-intuitive findings

**Inputs:** Tất cả findings từ Research Agent + Knowledge Base
**Outputs:** Deep insights, research hypotheses, knowledge gaps

**Reasoning strategies:**

```python
class ReasoningStrategies:
    """
    6 chiến lược reasoning cho deep insights:
    """

    def cross_paper_synthesis(self, findings: List[Finding]) -> List[Insight]:
        """
        So sánh các papers cùng topic nhưng khác conclusions.
        → Tìm ra: methodological differences, context factors
        """
        ...

    def temporal_analysis(self, findings: List[Finding]) -> List[Insight]:
        """
        Phân tích timeline của research.
        → Tìm ra: research trends, paradigm shifts
        """
        ...

    def contradiction_hunting(self, findings: List[Finding]) -> List[Insight]:
        """
        Tìm papers có conflicting results.
        → Tìm ra: boundary conditions, confounders
        """
        ...

    def gap_discovery(self, findings: List[Finding], knowledge_base) -> List[Insight]:
        """
        So sánh với knowledge base để tìm missing pieces.
        → Đề xuất: future research directions
        """
        ...

    def cross_domain_transfer(self, findings: List[Finding]) -> List[Insight]:
        """
        Tìm technique/insight từ field A áp dụng được vào field B.
        → Tìm ra: novel applications
        """
        ...

    def failure_analysis(self, papers_with_failures) -> List[Insight]:
        """
        Phân tích papers/thử nghiệm thất bại.
        → Tìm ra: common pitfalls, better approaches
        """
        ...
```

**NotebookLM-style Deep Insights output:**
```json
{
  "insight_id": "i_001",
  "type": "synthesis|contradiction|gap|transfer|failure|temporal",
  "title": "RAG chunk size debate: 256 vs 512 vs 1024",
  "description": "Paper A dùng 512, Paper B dùng 256, cả hai claim tối ưu.
    Phân tích cho thấy context phụ thuộc vào query complexity.",
  "confidence": 0.85,
  "evidence": {
    "supporting": ["f_001", "f_003"],
    "contradicting": ["f_002"]
  },
  "research_hypothesis": "Dynamic chunk sizing based on query complexity",
  "novelty_score": 0.7,
  "actionable": true
}
```

### 3.4 Coder Agent (💻)

**Vai trò:** Senior Software Engineer — implement, test, debug

**Capabilities:**
- Code generation (Python, TypeScript, Go, Rust)
- Unit test writing
- Code review
- Debug và fix bugs
- Docker/deployment setup
- API design

### 3.5 Analyst Agent (📊)

**Vai trò:** Data Scientist — phân tích, visualize, statistics

**Capabilities:**
- Data pipeline (ETL, preprocessing)
- Statistical analysis
- Chart/visualization generation
- Experiment result analysis
- Benchmark comparisons

### 3.6 Writer Agent (📝)

**Vai trò:** Technical Writer — viết báo cáo, documentation

**Capabilities:**
- Technical report writing (LaTeX, Markdown)
- Literature review
- API documentation
- Research paper drafting
- Presentation slides

### 3.7 Reviewer Agent (✅)

**Vai trò:** QA / Senior Reviewer — quality assurance

**Capabilities:**
- Code review (correctness, style, security)
- Technical accuracy verification
- Claim verification (fact-check against sources)
- Edge case identification
- Feedback generation

---

## 4. Reasoning Agent — Deep Insights Engine

### 4.1 System Design

```
┌─────────────────────────────────────────────────────────┐
│                 REASONING AGENT                           │
│           (Like NotebookLM "Deep Insights")            │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  INPUT: 100 findings from Research Agent                │
│              │                                           │
│              ▼                                           │
│  ┌─────────────────────────────────────────────────┐   │
│  │  INSIGHT GENERATION ENGINE                        │   │
│  │                                                    │   │
│  │  Stage 1: PREPROCESSING                          │   │
│  │  ├─ Cluster findings by topic (embedding + LDA)   │   │
│  │  ├─ Build citation graph                          │   │
│  │  └─ Identify temporal cohorts                      │   │
│  │                                                    │   │
│  │  Stage 2: INSIGHT MINING (6 strategies)           │   │
│  │  ├─ Cross-paper synthesis                          │   │
│  │  ├─ Temporal analysis                              │   │
│  │  ├─ Contradiction hunting                          │   │
│  │  ├─ Gap discovery                                  │   │
│  │  ├─ Cross-domain transfer                          │   │
│  │  └─ Failure analysis                               │   │
│  │                                                    │   │
│  │  Stage 3: RANKING & SCORING                       │   │
│  │  ├─ Novelty score (entropy-based)                  │   │
│  │  ├─ Confidence score (evidence strength)           │   │
│  │  ├─ Actionability score                           │   │
│  │  └─ Top-K selection                                 │   │
│  │                                                    │   │
│  │  Stage 4: SYNTHESIS                               │   │
│  │  └─ Generate insight narratives                    │   │
│  └─────────────────────────────────────────────────────┘   │
│              │                                             │
│              ▼                                             │
│  OUTPUT: 5-10 high-quality deep insights                  │
│           + research hypotheses                           │
│           + future directions                              │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### 4.2 NotebookLM-Style Output Format

```json
{
  "session_id": "session_20260405_001",
  "total_findings_analyzed": 127,
  "insights": [
    {
      "rank": 1,
      "type": "synthesis",
      "title": "Retrieval-Augmented Generation needs dynamic chunk sizing",
      "summary": "By combining findings from 3 papers, I found that static chunk sizes fail in complex queries. The optimal chunk size correlates with query specificity — broad questions favor larger chunks (512+ tokens) while specific questions work better with smaller chunks (256 tokens).",
      "why_this_matters": "Current RAG systems use fixed chunk sizes, missing 20-30% retrieval accuracy potential.",
      "evidence_count": 3,
      "papers_cited": ["paper_023", "paper_041", "paper_089"],
      "novelty": "high",
      "confidence": 0.91,
      "tags": ["rag", "chunking", "retrieval"]
    },
    {
      "rank": 2,
      "type": "contradiction",
      "title": "Context window size debate: 8K vs 128K tokens",
      "summary": "Paper Alpha claims 128K context degrades after 32K tokens. Paper Beta shows stable performance at 128K. Root cause: Alpha tested on synthetic data, Beta on real-world documents. Resolution: real-world benefits from larger context.",
      "resolution": "Context quality matters more than raw length",
      "confidence": 0.88,
      "tags": ["llm", "context-length", "evaluation"]
    },
    {
      "rank": 3,
      "type": "gap",
      "title": "No one has studied RAG + Knowledge Graph fusion at scale",
      "summary": "Of 127 papers analyzed, 0 studied hybrid RAG+KG approaches at >10M entities. This is a major opportunity — KG can resolve entity ambiguity that pure vector search cannot.",
      "estimated_impact": "high",
      "suggested_experiment": "Compare RAG-only vs RAG+KG on entity-rich queries",
      "tags": ["knowledge-graph", "hybrid-search", "opportunity"]
    }
  ],
  "knowledge_gaps": [
    "Cross-lingual RAG optimization (zh↔en↔vi)",
    "RAG evaluation beyond RAGAS metrics",
    "Adaptive retrieval strategies per query type"
  ],
  "research_trends": {
    "rising": ["long-context", "multi-modal-rag", "agentic-rag"],
    "declining": ["bm25-only", "fixed-chunk"],
    "stable": ["reranking", "hybrid-search"]
  },
  "generated_at": "2026-04-05T18:00:00Z"
}
```

---

## 5. Knowledge Hub

### 5.1 Database Schema (PostgreSQL + pgvector)

```sql
-- Research findings
CREATE TABLE findings (
  id          TEXT PRIMARY KEY,
  topic       TEXT NOT NULL,
  source_url  TEXT,
  source_type TEXT CHECK (source_type IN ('paper', 'web', 'book', 'internal')),
  title       TEXT,
  content     TEXT NOT NULL,
  summary     TEXT,
  embedding   VECTOR(1536),          -- OpenAI ada-002 or similar
  confidence  REAL DEFAULT 0.5,
  created_by  TEXT NOT NULL,          -- agent name
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  verified    BOOLEAN DEFAULT FALSE,
  verified_by TEXT,
  tags        TEXT[],
  metadata    JSONB                   -- extra fields
);

-- Embedding index
CREATE INDEX ON findings USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Full-text search backup
CREATE INDEX findings_fts ON findings USING gin(to_tsvector('english', title || ' ' || content));

-- Deep insights
CREATE TABLE insights (
  id              TEXT PRIMARY KEY,
  session_id      TEXT NOT NULL,
  insight_type    TEXT CHECK (insight_type IN (
                    'synthesis', 'contradiction', 'gap',
                    'transfer', 'failure', 'temporal'
                  )),
  title           TEXT NOT NULL,
  summary         TEXT NOT NULL,
  description     TEXT,
  confidence      REAL,
  novelty_score  REAL,
  actionable     BOOLEAN,
  evidence_refs  TEXT[],             -- finding IDs
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  verified        BOOLEAN DEFAULT FALSE,
  tags            TEXT[]
);

-- Agent outputs cache
CREATE TABLE agent_outputs (
  id          TEXT PRIMARY KEY,
  agent       TEXT NOT NULL,
  task_id     TEXT,
  output_type TEXT,                  -- 'result', 'feedback', 'code', 'report'
  content     TEXT NOT NULL,
  quality     REAL,
  reviewed    BOOLEAN DEFAULT FALSE,
  reviewed_by TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Discussions / threads
CREATE TABLE discussions (
  id            TEXT PRIMARY KEY,
  topic         TEXT NOT NULL,
  participants  TEXT[],
  messages      JSONB NOT NULL,      -- [{from, content, timestamp}]
  resolution    TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  resolved_at   TIMESTAMPTZ
);

-- Code patterns library
CREATE TABLE code_patterns (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  language    TEXT NOT NULL,
  code        TEXT NOT NULL,
  explanation TEXT,
  use_cases   TEXT[],
  quality     REAL,
  source      TEXT,                  -- paper_id or 'manual'
  created_by  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Task history (for learning)
CREATE TABLE task_history (
  id            TEXT PRIMARY KEY,
  task_type     TEXT NOT NULL,
  input         TEXT,
  output        TEXT,
  agent_used    TEXT,
  duration_sec  INTEGER,
  quality_score REAL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Project sessions
CREATE TABLE sessions (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  description   TEXT,
  status        TEXT DEFAULT 'active',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  completed_at  TIMESTAMPTZ
);
```

### 5.2 Redis Schema (Working Memory)

```
# Active tasks (sorted by priority)
autoresearch:tasks:pending     → ZSET (score=priority, member=task_id)
autoresearch:tasks:processing  → SET of task_ids
autoresearch:tasks:done        → ZSET (score=timestamp, member=task_id)

# Agent status
autoresearch:agent:{name}:status    → STRING "idle|busy|error"
autoresearch:agent:{name}:current_task → STRING task_id
autoresearch:agent:{name}:heartbeat  → STRING timestamp (TTL: 30s)

# Current project context
autoresearch:session:{id}:state      → HASH of project state
autoresearch:session:{id}:findings    → LIST of finding_ids
autoresearch:session:{id}:insights   → LIST of insight_ids

# Shared message queue
autoresearch:messages:{agent} → LIST of pending messages (JSON)

# Rate limiting per agent
autoresearch:ratelimit:{agent}:tokens → INT
autoresearch:ratelimit:global:tokens  → INT

# Caching
autoresearch:cache:{key} → STRING TTL 300s
```

---

## 6. Communication Protocol

### 6.1 Message Types

```typescript
type MessageType =
  | "TASK"          // Orchestrator → Agent: giao việc
  | "RESULT"        // Agent → Orchestrator: kết quả
  | "ASK"           // Agent → Agent: hỏi agent khác
  | "ANSWER"        // Agent → Agent: trả lời
  | "FEEDBACK"      // Reviewer → any: phản hồi
  | "PROGRESS"      // Agent → Orchestrator: cập nhật tiến độ
  | "BROADCAST"     // Orchestrator → all: thông báo
  | "CONSENSUS"     // Agents → vote/resolve disagreement
  | "REASONING"     // Reasoning Agent → all: chia sẻ insights
  | "ARCHIVE";      // Orchestrator → Knowledge Hub: lưu kết quả
```

### 6.2 Message Schema

```typescript
interface AgentMessage {
  id: string;              // uuid
  type: MessageType;
  from: AgentName;
  to: AgentName | "broadcast" | "orchestrator";
  timestamp: string;        // ISO8601
  topic: string;           // research topic
  priority?: 0 | 1 | 2 | 3;
  payload: {
    content: string;        // main content
    attachments?: {        // file references
      type: "finding" | "code" | "report" | "chart";
      id: string;
    }[];
    context?: object;      // extra context
    refs?: string[];       // referenced finding/insight IDs
    confidence?: number;   // 0-1
  };
  status: "pending" | "sent" | "delivered" | "read" | "archived";
}
```

### 6.3 Example Message Flows

**Flow 1: Task Assignment**
```
Orchestrator ──TASK──► Research Agent
  {
    "id": "m_001",
    "type": "TASK",
    "from": "orchestrator",
    "to": "researcher",
    "topic": "RAG optimization techniques",
    "priority": 1,
    "payload": {
      "content": "Tìm tất cả papers về RAG chunk optimization...",
      "attachments": []
    }
  }
```

**Flow 2: Deep Insights Sharing**
```
Reasoning ──REASONING──► Orchestrator ──BROADCAST──► All agents
  {
    "id": "m_010",
    "type": "REASONING",
    "from": "reasoner",
    "to": "broadcast",
    "topic": "Dynamic chunk sizing insight",
    "payload": {
      "content": "Found that optimal chunk size correlates with query specificity...",
      "refs": ["f_023", "f_041", "f_089"],
      "confidence": 0.91
    }
  }
```

---

## 7. Workflow Patterns

### Pattern A: Sequential Research Pipeline

```
User Input ──► Orchestrator ──► Research ──► Reasoning ──► Writer ──► Reviewer
  topic     decompose    10 papers   deep insights   report draft   final QA
                                          │
                                   [5-10 insights]
                                          │
                                   Coder (optional): build demo
                                          │
                                   Analyst: visualize data
```

### Pattern B: Parallel Multi-Agent Research

```
Topic: "LLM in Healthcare — systematic survey"
        │
   ┌────┼────┬─────────┐
   ▼    ▼    ▼         ▼
Research Research Research  (3 agents, mỗi người tìm 1 góc)
 papers  clinical reviews   benchmark
   │      │      │
   └──────┴──────┘
          │
    Orchestrator merge + deduplicate
          │
    Reasoning Agent: cross-synthesis
          │
    Writer: unified literature review
          │
    Reviewer: verify citations
```

### Pattern C: Debate Pattern (Research Controversy)

```
Question: "Fine-tuning vs RAG — which is better?"

   Coder A        Coder B
   "Fine-tune"    "Use RAG"
      │              │
      └──────┬───────┘
             ▼
       Orchestrator
             │
      ┌──────┴──────┐
      ▼             ▼
  Reviewer A   Reviewer B
  (pros FT)   (pros RAG)
      │             │
      └──────┬───────┘
             ▼
      Orchestrator: Resolution
      "Depends on use case. Use RAG for knowledge-
       intensive, FT for task-specific. Hybrid is best."
             │
      Archive to Knowledge Hub
```

### Pattern D: Iterative Refinement

```
Writer produces draft
       │
       ▼
  Reviewer: 3 issues found
       │
       ▼
  Writer: fix issues
       │
       ▼
  Reviewer: 1 issue remaining
       │
       ▼
  Writer: fix
       │
       ▼
  Reviewer: APPROVED ✓
```

---

## 8. Orchestrator Logic

### 8.1 Decision Flow

```
INPUT: New task or agent result

         ▼
┌─────────────────┐
│ TASK TYPE?      │
└────────┬────────┘
         │
    ┌────┴───────────────────────┐
    │                            │
  NEW TASK               AGENT RESULT
    │                            │
    ▼                            ▼
┌──────────────┐          ┌──────────────────┐
│ 1. Query KB  │          │ 1. Check quality │
│  (similar?)  │          │ 2. Pass/Fail?    │
└──────┬───────┘          └──────┬───────────┘
       │                           │
   ┌───┴───┐                  ┌───┴────┐
   │YES     │NO                │PASS     │FAIL
   │reuse  │decompose          │archive  │feedback
   │approach│task               │to KB    │retry
   └───┬───┘  │                  └────┬───┘
       │       │                        │
       │       ▼                        ▼
       │  ┌────────────────┐      ┌────────────┐
       │  │ Assign to     │      │ Agent: fix │
       │  │ best agent     │      │ (max 3x)   │
       │  │ (skills+load)  │      └─────┬──────┘
       │  └────────────────┘            │
       │       │                        │
       │       ▼                        ▼
       │  ┌────────────────┐      ┌────────────┐
       │  │ Monitor (poll) │      │ Escalate   │
       │  │ every 30s     │      │ to human   │
       │  └────────────────┘      └────────────┘
       │       │
       └───────┘
```

### 8.2 Agent Selection Algorithm

```python
def select_agent(task: Task, agents: List[Agent]) -> Agent:
    """
    Chọn agent tốt nhất cho task dựa trên:
    1. Skill match (required skills vs agent skills)
    2. Current load (tasks in queue)
    3. Past performance on similar tasks
    4. Availability (heartbeat < 30s)
    """
    scores = []
    for agent in agents:
        skill_score = len(task.required_skills & agent.skills) / max(len(task.required_skills), 1)
        load_score = 1 - (agent.queue_length / MAX_QUEUE)
        perf_score = agent.avg_quality_on(task.category)
        availability = is_agent_alive(agent)  # heartbeat check

        if not availability:
            continue

        total_score = (
            skill_score * 0.5 +
            load_score * 0.2 +
            perf_score * 0.3
        )
        scores.append((agent, total_score))

    scores.sort(key=lambda x: x[1], reverse=True)
    return scores[0][0]
```

---

## 9. Task Lifecycle

```
PENDING ──► ASSIGNED ──► IN_PROGRESS ─► REVIEW ──► COMPLETED
   │           │             │             │           │
   │           │             │             ▼           │
   │           │             │         FAILED          │
   │           │             │             │           │
   │           │             │             ▼           │
   │           │             │      RETRY (max 3x)    │
   │           │             │             │           │
   │           │             │      ┌──────┴──────┐    │
   │           │             │      │retries < 3  │      │
   │           │             │      │  -> retry   │      │
   │           │             │      │retries >=3 │      │
   │           │             │      │  -> escalate│      │
   │           │             │      └─────────────┘     │
   └──────────────────────────────────────────────────► BLOCKED (P0)
```

---

## 10. Triển khai — Phase by Phase

### Phase 1: Core Infrastructure (Week 1-2)

**Goal:** Chạy được với 2 agents + Knowledge Hub cơ bản

```
Deliverables:
✓ Orchestrator Agent (CLI-based, stateless)
✓ Knowledge Hub (PostgreSQL + Redis)
✓ Research Agent (web search + summarization)
✓ Reasoning Agent (cross-paper insights)
✓ Communication via claude-peers broker
✓ API server (FastAPI) cho user interface
```

**Tech:**
- PostgreSQL + pgvector (Docker)
- Redis (Docker — existing)
- claude-peers broker (existing infrastructure)
- FastAPI API server
- Claude API cho agents

**File structure:**
```
autoresearch/
├── src/
│   ├── agents/
│   │   ├── orchestrator.ts      # Task orchestration
│   │   ├── researcher.ts         # Web search + PDF
│   │   ├── reasoner.ts           # Deep insights engine
│   │   ├── coder.ts              # Code generation
│   │   ├── analyst.ts            # Data analysis
│   │   ├── writer.ts             # Report writing
│   │   └── reviewer.ts           # QA + verification
│   ├── hub/
│   │   ├── db.ts                 # PostgreSQL connection
│   │   ├── redis.ts              # Redis connection
│   │   ├── embeddings.ts         # OpenAI embedding
│   │   └── queries.ts            # SQL + vector queries
│   ├── broker/
│   │   ├── agent-broker.ts       # MCP broker
│   │   └── comm.ts               # Message passing
│   ├── api/
│   │   ├── main.ts               # FastAPI server
│   │   ├── routes/
│   │   │   ├── research.ts       # POST /research
│   │   │   ├── insights.ts        # GET /insights
│   │   │   ├── tasks.ts          # Task management
│   │   │   └── agents.ts         # Agent status
│   │   └── schemas/
│   └── utils/
│       ├── config.ts
│       └── logger.ts
├── docker-compose.yml
├── .env
├── package.json
└── AUTORESEARCH_SYSTEM.md
```

### Phase 2: Full Multi-Agent (Week 3-4)

```
Deliverables:
✓ Coder Agent (code generation + testing)
✓ Analyst Agent (visualization + charts)
✓ Writer Agent (report generation)
✓ Reviewer Agent (quality assurance loop)
✓ Full pipeline: Research → Reasoning → Write → Review
✓ Task queue với priority
✓ Agent heartbeat monitoring
```

### Phase 3: Advanced Features (Week 5-6)

```
Deliverables:
✓ Vector embedding (pgvector) — similarity search
✓ Session management (resume research)
✓ Parallel execution (multiple agents simultaneously)
✓ Debate pattern (agents disagree → resolve)
✓ Code pattern library (reuse past implementations)
```

### Phase 4: Production Hardening (Week 7-8)

```
Deliverables:
✓ Rate limiting per agent
✓ Error recovery + retry logic
✓ Prometheus metrics
✓ Human escalation UI
✓ Docker Compose full stack
✓ Deployment on existing server
```

---

## 11. Điểm mạnh & Điểm yếu

### ✅ ĐIỂM MẠNH

#### 1. Multi-Agent Specialization
- Mỗi agent là chuyên gia trong lĩnh vực riêng → chất lượng cao hơn single agent
- Researcher không phải lo chuyện code, Writer không phải lo chuyện search
- **So với NotebookLM**: có 6 agents thay vì 1 monolithic system

#### 2. Shared Knowledge Base
- Tri thức không mất khi agent restart
- Agent mới có thể học từ outputs của agent cũ
- Vector search cho phép reuse insights cũ
- **Không có giới hạn số sources** như NotebookLM (50-100 limit)

#### 3. Reasoning Agent — Deep Insights
- **Unique capability**: tìm hidden connections mà single-agent không thấy
- 6 reasoning strategies phủ hầu hết insight types
- Confidence scoring giúp filter insights chất lượng

#### 4. Orchestrator — Project Manager tự động
- Không cần human điều phối liên tục
- Auto-decompose, assign, track, merge
- Priority queue cho task management
- Escalation khi cần human input

#### 5. Collaborative Verification
- Reviewer Agent tạo feedback loop
- Giảm hallucinations vì có cross-verification
- Evidence tracking (mỗi claim phải có reference)

#### 6. Cost Efficiency
- Chỉ gọi Claude API khi cần (vs continuous 24/7 của human)
- Parallel agents → faster than sequential human research
- Có thể chạy overnight mà không tốn chi phí human time

#### 7. Extensible Architecture
- Thêm agent type mới dễ dàng
- Không phụ thuộc vào 1 model provider
- Có thể dùng local models cho tasks cụ thể

#### 8. Existing Infrastructure
- Tận dụng claude-peers broker sẵn có
- Redis + PostgreSQL đã chạy trên server
- Không cần infrastructure mới

---

### ❌ ĐIỂM YẾU & RỦI RO

#### 1. Hallucination vẫn có thể xảy ra
- **Rủi ro**: Reasoning Agent có thể "tạo" connections không có thật
- **Khắc phục**: Reviewer Agent verify từng insight, confidence threshold
- **Rủi ro residual**: vẫn có false positives cần human check

#### 2. Orchestrator là Single Point of Failure
- **Rủi ro**: Nếu Orchestrator logic sai → cả hệ thống sai direction
- **Khắc phục**: Human review checkpoints, fallback to manual mode
- **Rủi ro residual**: vẫn cần human oversight cao

#### 3. No True Understanding
- **Rủi ro**: Agents xử lý pattern matching chứ không thực sự "hiểu"
- Reasoning Agent có thể miss context nuances
- Cross-domain connections có thể surface spurious correlations
- **Khắc phục**: Không thể khắc phục hoàn toàn với LLM hiện tại

#### 4. Knowledge Hub Quality depends on garbage-in-garbage-out
- **Rủi ro**: Nếu sources không đáng tin cậy → insights sai
- Embedding similarity có thể match nhầm
- Vector search recall phụ thuộc vào embedding quality
- **Khắc phục**: Trust scoring per source, citation verification

#### 5. Scaling Challenges
- **Rủi ro**: Nhiều agents = nhiều API calls = chi phí tăng nhanh
- Redis queue có thể bottleneck với 1000+ concurrent tasks
- PostgreSQL vector index chậm với >100K rows
- **Khắc phục**: Batch processing, async queue, sharding

#### 6. No Real-time Learning
- **Rủi ro**: Knowledge Hub là static snapshot — không learn từ mistakes tự động
- Phải manual update knowledge base
- Agents không remember lỗi quá khứ trong long-term
- **Khắc phục**: task_history table để track patterns

#### 7. Evaluation Difficulty
- **Rủi ro**: Không có ground truth để verify insights
- Rất khó đo "chất lượng" của deep insights
- Human evaluation không scale được
- **Khắc phục**: Cite-verification (insight phải map được về source), peer review simulation

#### 8. Claude API Dependency
- **Rủi ro**: Rate limits, API cost, API downtime
- pro-x.io.vn endpoint có thể không ổn định
- Cost per session có thể cao với nhiều agents
- **Khắc phục**: Local models for simple tasks, caching, rate limiting

#### 9. No Physical Interaction
- **Rủi ro**: Không thể run experiments thực sự
- Không thể access restricted datasets
- Research chỉ dừng ở paper analysis
- **Khắc phục**: Design experiments → human/researcher thực hiện

#### 10. Communication Overhead
- **Rủi ro**: Agents có thể loop trong vòng lặp request-response
- Too many messages = confusion, contradictory outputs
- Orchestrator có thể bị overwhelmed
- **Khắc phục**: Strict message protocols, max hops, circuit breaker

---

### Summary Matrix

| Dimension | Score | Note |
|-----------|-------|------|
| Research depth | ⭐⭐⭐⭐⭐ | Deep cross-paper insights |
| Speed | ⭐⭐⭐⭐ | Parallel agents |
| Cost efficiency | ⭐⭐⭐ | Many API calls |
| Accuracy | ⭐⭐⭐ | Needs Reviewer verification |
| Scalability | ⭐⭐⭐ | PostgreSQL bottleneck |
| Extensibility | ⭐⭐⭐⭐⭐ | Easy to add agents |
| Autonomy | ⭐⭐⭐⭐ | Orchestrator handles most |
| Human oversight | ⭐⭐ | Needed for critical insights |
| Novelty discovery | ⭐⭐⭐⭐ | 6 reasoning strategies |
| Production ready | ⭐⭐ | Phase 1 only, many edge cases |

---

## 12. Technology Stack

### 12.1 Core Infrastructure (Existing)

| Component | Status | Purpose |
|-----------|--------|---------|
| Claude API | ✅ Running | LLM for all agents |
| Redis | ✅ Docker | Working memory, queues |
| PostgreSQL | ✅ Docker | Persistent storage |
| claude-peers | ✅ Setup | Agent communication broker |
| Docker | ✅ Running | Container management |

### 12.2 New Components

| Component | Tech | Purpose |
|-----------|------|---------|
| Vector DB | pgvector (PostgreSQL) | Embedding storage + similarity search |
| API Server | FastAPI | REST API for user interface |
| Agent Framework | TypeScript/Bun | Agent implementation |
| Embedding | OpenAI ada-002 / local | Text → vector |
| Metrics | Prometheus | Observability |
| Auth | JWT | API security |

### 12.3 Agent LLM Models

| Agent | Primary Model | Fallback |
|-------|-------------|---------|
| Orchestrator | claude-opus-4-6 | claude-sonnet-4-6 |
| Reasoning | claude-opus-4-6 | claude-sonnet-4-6 |
| Research | claude-sonnet-4-6 | haiku |
| Coder | claude-sonnet-4-6 | opus |
| Analyst | sonnet-4-6 | opus |
| Writer | opus | sonnet |
| Reviewer | opus | sonnet |

---

*Document created by: Coordinator Agent*
*Last updated: 2026-04-05*
*Status: Phase 1 ✅ IMPLEMENTED & VERIFIED — Pipeline working end-to-end*

## Changelog (2026-04-05)
- ✅ Knowledge Hub: `db.ts`, `redis.ts`, `embeddings.ts`, `queries.ts` — all implemented with graceful degradation
- ✅ 4 new agents: `coder.ts`, `analyst.ts`, `writer.ts`, `reviewer.ts`
- ✅ Orchestrator connected to Knowledge Hub (archive findings/insights, query similar past research)
- ✅ CLI runner: `src/agents/run-all.ts` with `--topic` and `--full` flags
- ✅ Fixed Claude API client: handles thinking blocks, retry logic, pro-x.io.vn compatibility
- ✅ Fixed research parsing: robust JSON fallback
- ✅ Fixed reasoner: single comprehensive call instead of 6 sequential
- ✅ All DB/Redis operations degrade gracefully when unavailable
- ✅ Pipeline verified: 3 real deep insights generated for "RAG optimization"
