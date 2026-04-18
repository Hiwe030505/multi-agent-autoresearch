# AutoResearch — Multi-Agent Research Engine

  ┌────────────────────────────────────────────────────────────────────┐
  │         ████████████ ████████████ █████ ███     ███                │
  │         ████    ████ ████    ████  ███  █████   ███                │
  │         ████    ████ ████████████  ███  ███  ██ ███                │
  │         ████    ████ ████  ████    ███  ███   █████                │
  │         ████████████ ████    ████ █████ ███     ███                │
  │                                                                    │
  │       M U L T I - A G E N T   R E S E A R C H   E N G I N E        │
  └────────────────────────────────────────────────────────────────────┘

  Multi-Agent Research Engine  ·  7 Specialized AI Agents  ·  Powered by AI

> Hệ thống nghiên cứu tự động với 7 AI agent chuyên môn, tương tự nhóm Senior Research Team. Giao diện: **Claude CLI-style chatbot** + **Enhanced CLI** với real-time streaming.

## TL;DR — Quick Start

```bash
# 1. Cài đặt
npm install

# 2. Chạy API server
npm run dev                    # → http://localhost:3001

# 3. Chạy frontend chatbot  (terminal mới)
cd frontend && npm run dev     # → http://localhost:3000

# 4. Hoặc dùng CLI
npm run cli -- research "RAG optimization techniques"
npm run cli -- research "RAG optimization" --stream   # real-time streaming
npm run cli -- watch <sessionId>                        # watch live session
```

---

## Mục lục

1. [Tổng quan](#1-tổng-quan)
2. [Kiến trúc](#2-kiến-trúc)
3. [Cài đặt](#3-cài-đặt)
4. [Cách sử dụng](#4-cách-sử-dụng)
5. [API Reference](#5-api-reference)
6. [LLM Providers & Models](#6-llm-providers--models)
7. [Cấu hình](#7-cấu-hình)
8. [Development](#8-development)

---

## 1. Tổng quan

### AutoResearch là gì?

AutoResearch là một **multi-agent research engine** với 7 agents hoạt động phối hợp như một nhóm nghiên cứu chuyên nghiệp:

| Agent | Vai trò | Chiến lược |
|-------|---------|-----------|
| 🧠 **Orchestrator** | Điều phối pipeline, phân công task, tổng hợp kết quả | Multi-phase pipeline |
| 🔍 **Researcher** | Tìm kiếm web, trích xuất findings từ papers/sources | Real web search (Tavily) |
| 🧠 **Reasoner** | Phân tích deep insights, tìm hidden connections | 6 chiến lược reasoning |
| 💻 **Coder** | Generate code, unit tests, debug | Code synthesis |
| 📊 **Analyst** | Phân tích dữ liệu, so sánh benchmarks | Statistical analysis |
| ✍️ **Writer** | Viết literature review, báo cáo, tài liệu | Multi-section output |
| ✅ **Reviewer** | QA, fact-check, verify claims | Quality gates |

### Hai giao diện sử dụng

```
┌─────────────────────────────────────────────────────────────┐
│                    AutoResearch                             │
├──────────────────────────┬──────────────────────────────────┤
│  🌐 Web Chatbot           │  ⌨️  Enhanced CLI                │
│  http://localhost:3000    │  npm run cli -- ...               │
├──────────────────────────┼──────────────────────────────────┤
│  Dark terminal aesthetic  │  Real-time agent streaming        │
│  SSE live events         │  Colored output per agent         │
│  Command palette (/)     │  watch / --stream modes            │
│  Session history sidebar  │  Multiple output formats          │
│  Knowledge Hub stats     │  Full API + local modes           │
└──────────────────────────┴──────────────────────────────────┘
```

### Điểm khác biệt

| | NotebookLM | AutoResearch |
|--|----------|-------------|
| Số sources | 50-100 | Unlimited |
| Agents | 1 | 7 chuyên môn |
| Parallel processing | Không | Có |
| Code generation | Không | Có |
| Real-time streaming | Không | Có (SSE) |
| Self-verification | Không | Reviewer Agent |
| Long-term memory | Không | Knowledge Hub (pgvector) |
| Reuse insights cũ | Không | Có (vector similarity) |
| Giao diện | Google Docs-style | Claude CLI-style |

---

## 2. Kiến trúc

### 2.1 Pipeline Flow

```
USER INPUT
    │
    ▼
Orchestrator
    │
    ├── Query Knowledge Hub → Reuse similar past research?
    │
    ├── Researcher ──→ Real web search (Tavily)
    │         └── Extract structured findings
    │
    ├── Reasoner ──→ 6 reasoning strategies
    │         ├── CROSS_PAPER_SYNTHESIS
    │         ├── CONTRADICTION_HUNTING
    │         ├── TEMPORAL_ANALYSIS
    │         ├── GAP_DISCOVERY
    │         ├── CROSS_DOMAIN_TRANSFER
    │         └── FAILURE_ANALYSIS
    │
    ├── Coder (optional) ──→ Code prototype
    ├── Analyst (optional) ──→ Data analysis
    ├── Writer ──→ Literature review
    ├── Reviewer ──→ QA + fact-check
    │
    ▼
Archive to Knowledge Hub → Final Output
```

### 2.2 Knowledge Hub

```
PostgreSQL + pgvector  │  Redis              │  SSE Events
──────────────────────┼────────────────────┼────────────────────
• Findings (vector)   │  • Session state    │  Real-time agents
• Insights            │  • Job queue        │  Progress updates
• Sessions            │  • Cache            │  Live insights
• Graph nodes/edges   │  • Rate limiting    │  Finding alerts
```

### 2.3 File Structure

```
autoresearch/
├── src/                          # Backend (Node.js/Express)
│   ├── index.ts                  # API server (port 3001)
│   ├── config.ts                 # Configuration
│   ├── types.ts                  # TypeScript types
│   ├── schema.sql                # PostgreSQL schema
│   ├── agents/
│   │   ├── orchestrator.ts       # Pipeline orchestration
│   │   ├── researcher.ts        # Web search + summarization
│   │   ├── reasoner.ts          # Deep insights (6 strategies)
│   │   ├── coder.ts             # Code generation
│   │   ├── analyst.ts           # Data analysis
│   │   ├── writer.ts            # Literature review
│   │   ├── reviewer.ts          # QA + fact-check
│   │   └── run-all.ts           # Standalone CLI runner
│   ├── hub/
│   │   ├── db.ts                # PostgreSQL + pgvector
│   │   ├── redis.ts             # Redis cache + queue
│   │   ├── embeddings.ts        # OpenAI embeddings
│   │   ├── events.ts            # SSE event emitter
│   │   ├── queries.ts           # High-level KB operations
│   │   └── search.ts            # Web search (Tavily)
│   ├── llm/
│   │   └── client.ts            # Unified LLM client (9 providers)
│   ├── utils/
│   │   └── json.ts              # Robust JSON parsing utilities
│   └── cli/
│       ├── index.ts             # CLI entry point
│       ├── config.ts            # CLI config loader
│       ├── sessions.ts          # Session management
│       ├── formatters.ts        # Output formatters
│       └── theme.ts             # Terminal colors
├── frontend/                     # Frontend (Next.js 16)
│   ├── app/
│   │   ├── globals.css           # Terminal aesthetic CSS
│   │   ├── page.tsx             # Redirect → /chat
│   │   └── chat/
│   │       └── page.tsx         # Main chatbot page
│   ├── components/
│   │   ├── chat/               # Chat UI components
│   │   │   ├── ChatContainer.tsx
│   │   │   ├── MessageList.tsx
│   │   │   ├── MessageBubble.tsx
│   │   │   ├── AgentCard.tsx
│   │   │   ├── StreamingText.tsx
│   │   │   ├── ThinkingBlock.tsx
│   │   │   └── InputBar.tsx
│   │   ├── sidebar/            # Sidebar + session list
│   │   ├── command/            # Command palette
│   │   └── shared/             # Spinner, Toast
│   ├── hooks/
│   │   ├── useSSEStream.ts     # SSE event stream hook
│   │   ├── useChatState.ts     # Chat state management
│   │   └── useCommandPalette.ts
│   ├── lib/
│   │   ├── api.ts              # Existing API client
│   │   └── chat-api.ts         # Chat-specific API wrapper
│   └── types/
│       └── chat.ts             # Chat TypeScript types
├── package.json
├── tsconfig.json
└── README.md
```

---

## 3. Cài đặt

### Yêu cầu

- **Node.js** >= 18
- **Docker & Docker Compose** (cho PostgreSQL + Redis)
- **LLM API key** (Anthropic, Groq, OpenAI, Ollama local...)

### Nhanh nhất

```bash
# Clone và cài đặt
cd autoresearch
npm install

# Infrastructure (PostgreSQL + Redis)
docker-compose up -d postgres redis

# Khởi động API
npm run dev                    # → http://localhost:3001

# Terminal mới — khởi động frontend
cd frontend && npm install && npm run dev   # → http://localhost:3000
```

### Kiểm tra nhanh

```bash
# Health check
curl http://localhost:3001/health

# Stats
curl http://localhost:3001/api/hub/stats

# System status
curl http://localhost:3001/api/status
```

---

## 4. Cách sử dụng

### 4.1 Web Chatbot (Recommended)

Mở **http://localhost:3000** — giao diện chatbot terminal-style.

**Commands:**

| Command | Mô tả |
|---------|--------|
| `/research <topic>` | Bắt đầu research session |
| `/stats` | Xem Knowledge Hub statistics |
| `/kb <query>` | Tìm kiếm knowledge base |
| `/sessions` | Xem danh sách sessions |
| `/clear` | Xóa conversation hiện tại |
| `/help` | Hiển thị tất cả commands |

### 4.2 Enhanced CLI

```bash
# Research cơ bản
npm run cli -- research "RAG optimization techniques"

# Với keywords
npm run cli -- research "LLM fine-tuning" -k "rag,retrieval,chunking"

# Với real-time streaming (xem agents hoạt động)
npm run cli -- research "RAG optimization" --stream

# Watch một session đang chạy
npm run cli -- watch <sessionId>

# Session management
npm run cli -- session list
npm run cli -- session show <sessionId> --format md
npm run cli -- session export <sessionId> md output.md

# Knowledge base
npm run cli -- kb search "chunking strategies"
npm run cli -- kb stats
npm run cli -- kb graph

# Config
npm run cli -- config show
npm run cli -- config init        # Tạo ~/.autoresearchrc
```

**Streaming output mẫu:**
```
🔬 AutoResearch — Streaming Mode
   Topic: RAG optimization techniques
────────────────────────────────────────────────────────────
   Starting research pipeline...
   Session: abc-123

  ⚡ researcher  Searching web for sources
  🔍 Source: Self-RAG: Learning to Retrieve, Generate, and Critique
  🔍 Source: HyDE: Hypothetical Document Embeddings
  ⚡ researcher  done (3.2s)
  ⚡ reasoner  Generating deep insights
  💡 Insight: Hierarchical chunking + reranking synergy
  ⚡ reasoner  done (8.1s)
  ⚡ writer  Writing literature review
  ⚡ writer  done (5.7s)
  ⚡ reviewer  QA verification
  ⚡ reviewer  done (2.3s)

✅ Research completed!
   5 findings, 8 insights
```

### 4.3 API Server (background)

```bash
# Bắt đầu research (async — trả về sessionId ngay)
curl -X POST http://localhost:3001/api/research \
  -H "Content-Type: application/json" \
  -d '{"topic": "RAG optimization", "keywords": ["rag", "retrieval"]}'

# Poll kết quả
curl http://localhost:3001/api/research/{sessionId}

# SSE real-time stream
curl -N http://localhost:3001/api/events/{sessionId}/stream

# Xem sessions
curl http://localhost:3001/api/sessions

# Knowledge graph
curl http://localhost:3001/api/graph/stats
curl "http://localhost:3001/api/graph/search?q=chunking"

# Proposal analyzer (multipart file upload)
curl -X POST http://localhost:3001/api/proposal/analyze \
  -F "text=Your research proposal text here..."
```

---

## 5. API Reference

### Core Endpoints

| Method | Endpoint | Mô tả |
|--------|---------|--------|
| `GET` | `/health` | Health check |
| `POST` | `/api/research` | Bắt đầu research job |
| `GET` | `/api/research/:id` | Lấy kết quả / trạng thái |
| `GET` | `/api/research/:id/findings` | Lấy findings của session |
| `GET` | `/api/sessions` | Danh sách sessions |
| `GET` | `/api/status` | System + agent status |
| `GET` | `/api/hub/stats` | Knowledge Hub statistics |
| `GET` | `/api/graph` | Full knowledge graph |
| `GET` | `/api/graph/stats` | Graph statistics |
| `GET` | `/api/graph/search?q=` | Tìm kiếm graph |
| `GET` | `/api/graph/contradictions` | Các contradictions |
| `GET` | `/api/graph/gaps` | Research gaps |
| `GET` | `/api/events/:id/stream` | SSE real-time event stream |
| `POST` | `/api/proposal/analyze` | Phân tích research proposal |

### POST /api/research

**Request:**
```json
{
  "topic": "RAG optimization techniques",
  "keywords": ["rag", "retrieval", "chunking"],
  "sessionId": "uuid (optional)",
  "maxSources": 10
}
```

**Response (immediate):**
```json
{
  "sessionId": "abc-123",
  "status": "pending",
  "message": "Research started"
}
```

### GET /api/research/:id (completed)

```json
{
  "sessionId": "abc-123",
  "status": "completed",
  "findings": [
    {
      "id": "f001",
      "title": "Self-RAG: Learning to Retrieve...",
      "sourceUrl": "https://arxiv.org/...",
      "sourceType": "paper",
      "confidence": 0.9,
      "keyFindings": [
        { "finding": "...", "evidence": "...", "confidence": 0.85 }
      ]
    }
  ],
  "insights": {
    "id": "abc-123",
    "totalFindingsAnalyzed": 5,
    "insights": [
      {
        "id": "i001",
        "type": "synthesis",
        "title": "Hierarchical Chunking + Reranking",
        "summary": "...",
        "confidence": 0.82,
        "noveltyScore": 0.6,
        "evidenceRefs": ["f001", "f003"]
      }
    ],
    "knowledgeGaps": ["...", "..."],
    "researchTrends": {
      "rising": ["long-context", "multi-modal-rag"],
      "stable": ["reranking", "hybrid-search"],
      "declining": ["fixed-chunk"]
    }
  },
  "reusedFromKnowledgeHub": [],
  "duration": 142700
}
```

### SSE Event Types

| Event | Payload | Mô tả |
|-------|---------|--------|
| `connected` | `{ sessionId, timestamp }` | Kết nối thành công |
| `agent.start` | `{ agent, task }` | Agent bắt đầu |
| `agent.complete` | `{ agent, output? }` | Agent hoàn thành |
| `agent.error` | `{ agent, error }` | Agent lỗi |
| `orchestrator.phase` | `{ phase, progress }` | Pipeline phase update |
| `reasoner.insight` | `{ insight }` | Insight mới được sinh ra |
| `researcher.found` | `{ title, summary }` | Finding mới được tìm thấy |

---

## 6. LLM Providers & Models

### Supported Providers

| Provider | API Key | Ví dụ Model | Chi phí |
|----------|---------|-------------|---------|
| **Anthropic** | `ANTHROPIC_API_KEY` | `claude-opus-4-6`, `claude-sonnet-4-6` | 💰 |
| **OpenAI** | `OPENAI_API_KEY` | `gpt-4o`, `gpt-4o-mini`, `o1` | 💰 |
| **Groq** | `GROQ_API_KEY` | `llama-3.3-70b-versatile`, `mixtral-8x7b` | 🆓 Free |
| **Ollama** | Không cần | `llama3.2`, `qwen2.5`, `codellama` | 🆓 |
| **LM Studio** | Không cần | Bất kỳ model nào đã tải | 🆓 |
| **vLLM** | Tự set | `Llama-3.1-8B`, `Qwen-2.5` | 🆓 |
| **Fireworks AI** | `FIREWORKS_API_KEY` | `llama-v3p3-70b-instruct` | 💰 |
| **HuggingFace** | `HF_TOKEN` | `mistralai/Mixtral-8x7B` | 💰 |
| **Kyma** | `KYMA_API_KEY` | Custom endpoints | 💰 |

### Model Recommendations per Agent

| Agent | Primary | Free (Groq) | Local (24GB VRAM) |
|-------|---------|------------|-------------------|
| Orchestrator | Claude Opus 4 | llama-3.3-70b | llama3.1:70b |
| Reasoner | Claude Opus 4 | llama-3.3-70b | llama3.1:70b |
| Research | Claude Sonnet 4 | llama-3.3-70b | llama3.2:3b |
| Coder | Claude Sonnet 4 | llama-3.3-70b | qwen2.5:32b |
| Analyst | Claude Sonnet 4 | llama-3.3-70b | qwen2.5:32b |
| Writer | Claude Opus 4 | llama-3.3-70b | llama3.1:8b |
| Reviewer | Claude Opus 4 | llama-3.3-70b | llama3.1:70b |

### Quick Config — Switch Provider

```env
# .env
ANTHROPIC_API_KEY=sk-...
ANTHROPIC_BASE_URL=https://pro-x.io.vn/

# Hoặc dùng Groq (free tier — nhanh)
GROQ_API_KEY=gsk_...
```

### Ollama Setup (free local)

```bash
ollama serve
ollama pull llama3.1:70b     # Reasoning (80GB VRAM)
ollama pull qwen2.5:32b     # Coding (24GB VRAM)
```

---

## 7. Cấu hình

### .env

```env
# ─── Anthropic (Claude) ───────────────────────────────────────────────
ANTHROPIC_API_KEY=sk-...           # Required
ANTHROPIC_BASE_URL=https://pro-x.io.vn/

# ─── OpenAI (GPT-4, embeddings) ──────────────────────────────────────
OPENAI_API_KEY=sk-...

# ─── Groq (free, fast) ────────────────────────────────────────────────
GROQ_API_KEY=gsk_...

# ─── Ollama (local) ──────────────────────────────────────────────────
OLLAMA_BASE_URL=http://localhost:11434

# ─── Infrastructure ─────────────────────────────────────────────────
DATABASE_URL=postgres://postgres:password@localhost:5432/autoresearch
POSTGRES_PASSWORD=password
REDIS_URL=redis://:password@localhost:6380
PORT=3001
NODE_ENV=development
```

### Switching Models per Agent

Edit `src/config.ts`:

```typescript
models: {
  orchestrator: "llama-3.3-70b-versatile",  // Groq: free
  reasoning:    "claude-opus-4-6",          // Anthropic: quality
  research:     "llama-3.3-70b-versatile",  // Groq: free
}
```

---

## 8. Development

```bash
# API + hot-reload
npm run dev

# CLI runner
npm run cli -- research "..."
npm run cli -- research "..." --stream

# Watch a session live
npm run cli -- watch <sessionId>

# TypeScript check
npx tsc -p tsconfig.json              # Backend
cd frontend && npx tsc --noEmit       # Frontend

# Build frontend
cd frontend && npm run build
```

### Adding a New Agent

```typescript
// src/agents/myxgent.ts
import { llm } from "../llm/client.ts";

export async function runMyAgent(task: string) {
  const result = await llm.call(task, "llama-3.3-70b-versatile");
  return parseResponse(result);
}
```

### Graceful Degradation

Tất cả DB/Redis operations đều wrapped in try/catch — hệ thống chạy được dù DB/Redis không khả dụng:

```
[Redis] Connection error — continuing without cache
[DB] upsertFinding failed — continuing without persistence
[Hub] Embedding search failed — falling back to text search
[Search] Tavily unavailable — LLM fallback mode
```

---

## License

MIT — xem `AUTORESEARCH_SYSTEM.md` để biết chi tiết thiết kế hệ thống.
