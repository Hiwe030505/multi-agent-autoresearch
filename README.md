# ORIN — Multi-Agent Research Engine

```
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
```

> **ORIN** — Autonomous multi-agent research engine. 7 AI agents chuyên môn hoạt động phối hợp như một Senior Research Team. Giao diện: **Claude CLI-style chatbot REPL** + **Enhanced CLI** với real-time streaming.

---

## TL;DR — Quick Start

```bash
# 1. Cài đặt
npm install

# 2. Link binary toàn cục (gọi tên là chạy)
npm link

# 3. Bắt đầu chat ngay lập tức — như Claude CLI!
orin
```

**Hoặc dùng tên đầy đủ:**
```bash
orin chat                          # Interactive chat REPL
orin research "RAG optimization"   # Research pipeline
autoresearch research "..."         # Bằng tên autoresearch
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

### ORIN là gì?

ORIN là một **multi-agent research engine** với 7 agents hoạt động phối hợp như một nhóm nghiên cứu chuyên nghiệp:

| Agent | Vai trò | Chiến lược |
|-------|---------|-----------|
| 🎛 **Orchestrator** | Điều phối pipeline, phân công task, tổng hợp kết quả | Multi-phase pipeline |
| 🔍 **Researcher** | Tìm kiếm web, trích xuất findings từ papers/sources | Real web search (Tavily + arXiv) |
| 🧠 **Reasoner** | Phân tích deep insights, tìm hidden connections | 6 chiến lược reasoning |
| 💻 **Coder** | Generate code, unit tests, debug | Code synthesis |
| 📊 **Analyst** | Phân tích dữ liệu, so sánh benchmarks | Statistical analysis |
| ✍️ **Writer** | Viết literature review, báo cáo, tài liệu | Multi-section output |
| ✅ **Reviewer** | QA, fact-check, verify claims | Quality gates |

### Ba giao diện sử dụng

```
┌────────────────────────────────────────────────────────────────┐
│                         ORIN                                   │
├──────────────────┬─────────────────────┬────────────────────┤
│  🌐 Web Chatbot   │   ⌨️  orin chat     │  💻  orin research │
│  localhost:3000   │   Interactive REPL  │  CLI pipeline      │
├──────────────────┼─────────────────────┼────────────────────┤
│  Dark terminal   │  Claude CLI-style   │  Real-time stream  │
│  Command palette  │  /research /stats   │  Colored agents    │
│  Session sidebar   │  Agent cards live   │  Progress bars     │
│  SSE live events  │  Tab-complete ↑↓     │  Multiple formats  │
└──────────────────┴─────────────────────┴────────────────────┘
```

### Điểm khác biệt

| | NotebookLM | ORIN |
|--|----------|------|
| Số sources | 50-100 | Unlimited |
| Agents | 1 | **7 chuyên môn** |
| Parallel processing | Không | Có |
| Code generation | Không | Có |
| Real-time streaming | Không | Có (SSE) |
| Self-verification | Không | ✅ Reviewer Agent |
| Long-term memory | Không | **Knowledge Hub (pgvector)** |
| Reuse insights cũ | Không | Có (vector similarity) |
| Interactive CLI | Không | ✅ `orin` chat REPL |

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
    ├── Researcher ──→ Real web search (Tavily + arXiv + Semantic Scholar)
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
Knowledge Hub (pgvector) ──→ Final Output
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
├── src/
│   ├── index.ts                  # API server (port 3001)
│   ├── config.ts                 # Configuration
│   ├── types.ts                  # TypeScript types
│   ├── schema.sql                # PostgreSQL schema
│   ├── agents/
│   │   ├── orchestrator.ts       # Pipeline orchestration
│   │   ├── researcher.ts          # Web search + summarization
│   │   ├── reasoner.ts           # Deep insights (6 strategies)
│   │   ├── coder.ts              # Code generation
│   │   ├── analyst.ts            # Data analysis
│   │   ├── writer.ts             # Literature review
│   │   ├── reviewer.ts            # QA + fact-check
│   │   └── run-all.ts            # Standalone CLI runner
│   ├── hub/
│   │   ├── db.ts                 # PostgreSQL + pgvector
│   │   ├── redis.ts              # Redis cache + queue
│   │   ├── embeddings.ts          # OpenAI embeddings
│   │   ├── events.ts             # SSE event emitter
│   │   ├── queries.ts            # High-level KB operations
│   │   └── search.ts             # Web search (Tavily + arXiv)
│   ├── llm/
│   │   └── client.ts             # Unified LLM client (9 providers)
│   ├── utils/
│   │   └── json.ts               # Robust JSON parsing
│   └── cli/
│       ├── index.ts              # CLI entry point
│       ├── repl.ts                # Interactive chat REPL
│       ├── logo.ts               # ORIN ASCII block-letter logo
│       ├── config.ts             # CLI config loader
│       ├── sessions.ts            # Session management
│       ├── formatters.ts         # Output formatters
│       └── theme.ts              # Terminal colors
├── frontend/                      # Frontend (Next.js)
│   ├── app/
│   │   ├── page.tsx             # Redirect → /chat
│   │   └── chat/
│   │       └── page.tsx         # Main chatbot page
│   ├── components/
│   │   ├── chat/               # ChatContainer, MessageList, InputBar...
│   │   ├── sidebar/            # Sidebar + SessionList
│   │   ├── command/            # Command palette
│   │   └── shared/             # Spinner, Toast
│   ├── hooks/
│   │   ├── useChatState.ts     # Conversation state
│   │   ├── useSSEStream.ts     # SSE event stream
│   │   └── useCommandPalette.ts
│   ├── lib/
│   │   └── chat-api.ts         # Chat API wrapper
│   └── types/
│       └── chat.ts             # Chat TypeScript types
├── tests/                        # System tests
│   ├── unit/                   # Unit tests (Vitest)
│   ├── api/                    # API integration tests
│   └── e2e/                   # End-to-end smoke tests
├── vitest.config.ts
├── package.json
└── README.md
```

---

## 3. Cài đặt

### Yêu cầu

- **Node.js** >= 18
- **Docker & Docker Compose** (cho PostgreSQL + Redis)
- **LLM API key** — Kyma (mặc định), Anthropic, Groq, OpenAI, Ollama...

### Nhanh nhất

```bash
# 1. Clone và cài đặt
cd autoresearch
npm install

# 2. Infrastructure (PostgreSQL + Redis)
docker-compose up -d postgres redis

# 3. Cấu hình API key — sao chép .env.example
cp .env.example .env
# Sau đó điền KYMA_API_KEY (hoặc ANTHROPIC_API_KEY) vào .env

# 4. Link binary toàn cục
npm link

# 5. Bắt đầu chat — như Claude CLI!
orin
```

**Hoặc chạy từng phần riêng:**
```bash
npm run dev                    # API server → http://localhost:3001
cd frontend && npm install && npm run dev  # Web chatbot → http://localhost:3000
```

### Kiểm tra nhanh

```bash
# Health check
curl http://localhost:3001/health

# Hub stats
curl http://localhost:3001/api/hub/stats
```

---

## 4. Cách sử dụng

### 4.1 Interactive Chat REPL (`orin chat`) — Recommended

```bash
orin
```

```
  ┌────────────────────────────────────────┐
  │  ORIN         Multi-Agent Research   │
  └────────────────────────────────────────┘

  orin > /research RAG optimization techniques
  ⚡ orchestrator  starting pipeline
  🔍 researcher   searching web for sources
  🔍 Source: Self-RAG: Learning to Retrieve...
  🧠 reasoner     generating insights
  ✅ research complete!  5 findings, 8 insights

  orin > /stats
  📊 Knowledge Hub Stats
  ──────────────────────────────
  Findings:     1,247
  Insights:       834
  Graph nodes:  2,391

  orin > /exit
```

**Commands trong REPL:**

| Command | Mô tả |
|---------|--------|
| `/research <topic>` | Bắt đầu deep research session |
| `/stats` | Xem Knowledge Hub statistics |
| `/kb <query>` | Tìm kiếm knowledge base |
| `/sessions` | Xem danh sách sessions |
| `/clear` | Xóa conversation history |
| `/help` | Hiển thị tất cả commands |
| `/exit` | Thoát REPL |

> Tab-completion cho tất cả commands, ↑↓ để duyệt history.

### 4.2 Research CLI (`autoresearch research`)

```bash
# Research cơ bản
orin research "RAG optimization techniques"

# Với keywords
orin research "LLM fine-tuning" -k "rag,retrieval,chunking"

# Với real-time streaming (xem agents hoạt động)
orin research "RAG optimization" --stream

# Watch một session đang chạy
autoresearch watch <sessionId>

# Session management
autoresearch session list
autoresearch session show <sessionId> --format md

# Knowledge base
autoresearch kb search "chunking strategies"
autoresearch kb stats

# Config
autoresearch config show
autoresearch config init        # Tạo ~/.autoresearchrc
```

**Streaming output mẫu:**
```
  🔬 Starting research: "RAG optimization"
  ─────────────────────────────────────────────────────
  ⚡ orchestrator  starting pipeline
  ⚡ researcher  Searching web for sources
  🔍 Source: Self-RAG: Learning to Retrieve...
  🔍 Source: HyDE: Hypothetical Document Embeddings
  ⚡ researcher  done (3.2s)
  ⚡ reasoner  Generating deep insights
  💡 Insight: Hierarchical chunking + reranking
  ⚡ reasoner  done (8.1s)
  ⚡ writer  Writing literature review
  ⚡ writer  done (5.7s)
  ⚡ reviewer  QA verification
  ⚡ reviewer  done (2.3s)

✅ Research completed in 19.3s
   Findings: 5  |  Insights: 8
   Session: abc-123
```

### 4.3 Web Chatbot

Mở **http://localhost:3000** — giao diện chatbot terminal-style.

Commands trong web: `/research`, `/stats`, `/kb`, `/sessions`, `/clear`, `/help`.

### 4.4 API Server

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

# Hub stats
curl http://localhost:3001/api/hub/stats
```

---

## 5. API Reference

### Core Endpoints

| Method | Endpoint | Mô tả |
|--------|---------|--------|
| `GET` | `/health` | Health check |
| `POST` | `/api/research` | Bắt đầu research job |
| `GET` | `/api/research/:id` | Lấy kết quả / trạng thái |
| `GET` | `/api/sessions` | Danh sách sessions |
| `GET` | `/api/status` | System + agent status |
| `GET` | `/api/hub/stats` | Knowledge Hub statistics |
| `GET` | `/api/hub/search?q=` | Tìm kiếm knowledge base |
| `GET` | `/api/hub/graph` | Full knowledge graph |
| `GET` | `/api/events/:id/stream` | SSE real-time event stream |

### SSE Event Types

| Event | Payload | Mô tả |
|-------|---------|--------|
| `connected` | `{ sessionId, timestamp }` | Kết nối thành công |
| `agent.start` | `{ agent, task }` | Agent bắt đầu |
| `agent.complete` | `{ agent, output? }` | Agent hoàn thành |
| `agent.error` | `{ agent, error }` | Agent lỗi |
| `orchestrator.phase` | `{ phase, progress }` | Pipeline phase update |
| `reasoner.insight` | `{ insight }` | Insight mới |
| `reasoner.thinking` | `{ strategy, thought }` | Thinking process |
| `researcher.found` | `{ title, source }` | Finding mới được tìm thấy |
| `graph.node_added` | `{ name, type }` | Node mới trong graph |

---

## 6. LLM Providers & Models

### Supported Providers

| Provider | API Key | Ví dụ Model | Chi phí |
|----------|---------|-------------|---------|
| **Kyma** (mặc định) | `KYMA_API_KEY` | Anthropic-compatible endpoint | 💰 |
| **Anthropic** | `ANTHROPIC_API_KEY` | `claude-opus-4-6`, `claude-sonnet-4-6` | 💰 |
| **OpenAI** | `OPENAI_API_KEY` | `gpt-4o`, `gpt-4o-mini`, `o1` | 💰 |
| **Groq** | `GROQ_API_KEY` | `llama-3.3-70b-versatile` | 🆓 Free tier |
| **Ollama** | Không cần | `llama3.2`, `qwen2.5`, `codellama` | 🆓 |
| **LM Studio** | `lm-studio` | Bất kỳ model nào đã tải | 🆓 |
| **vLLM** | Tự set | `Llama-3.1-8B` | 🆓 |
| **Fireworks AI** | `FIREWORKS_API_KEY` | `llama-v3p3-70b` | 💰 |

### Model Recommendations per Agent

| Agent | Primary | Free (Groq) | Local (24GB VRAM) |
|-------|---------|-------------|-------------------|
| Orchestrator | Claude Opus 4 | llama-3.3-70b | llama3.1:70b |
| Reasoner | Claude Opus 4 | llama-3.3-70b | llama3.1:70b |
| Research | Claude Sonnet 4 | llama-3.3-70b | llama3.2:3b |
| Coder | Claude Sonnet 4 | llama-3.3-70b | qwen2.5:32b |
| Writer | Claude Opus 4 | llama-3.3-70b | llama3.1:8b |
| Reviewer | Claude Opus 4 | llama-3.3-70b | llama3.1:70b |

---

## 7. Cấu hình

### .env

```env
# ─── Kyma AI (mặc định — Anthropic-compatible) ─────────────────
KYMA_API_KEY=your-kyma-key-here
KYMA_BASE_URL=https://kymaapi.com/v1

# ─── Tavily (web search — recommended) ────────────────────────
TAVILY_API_KEY=your-tavily-key

# ─── PostgreSQL ───────────────────────────────────────────────
POSTGRES_PASSWORD=your_password
# PORT mặc định: 5434 (local docker)

# ─── Redis ────────────────────────────────────────────────────
REDIS_URL=redis://:password@localhost:6380

# ─── Server ──────────────────────────────────────────────────
PORT=3001
NODE_ENV=development
```

> **Không share `.env` lên GitHub.** File `.env.example` chứa template có thể push.

### Switching Provider

```env
# Dùng Groq (miễn phí)
GROQ_API_KEY=gsk_...

# Hoặc Anthropic trực tiếp
ANTHROPIC_API_KEY=sk-ant-...

# Hoặc Ollama local (miễn phí, private)
OLLAMA_BASE_URL=http://localhost:11434
```

---

## 8. Development

```bash
# API + hot-reload
npm run dev                          # → http://localhost:3001

# CLI
orin chat                           # Interactive REPL
autoresearch research "..."         # Research pipeline
autoresearch research "..." --stream  # Real-time streaming

# Watch a session live
autoresearch watch <sessionId>

# TypeScript check
npx tsc -p tsconfig.json              # Backend
cd frontend && npx tsc --noEmit       # Frontend

# Tests
npm run test:unit   # Unit tests (16 tests, no deps)
npm run test:api     # API integration tests
npm run test:e2e     # End-to-end smoke tests

# Build frontend
cd frontend && npm run build
```

### Adding a New Agent

```typescript
// src/agents/myxgent.ts
import { llm } from "../llm/client.ts";

export async function runMyAgent(task: string) {
  const result = await llm.chat(
    [{ role: "user", content: task }],
    { provider: "groq", model: "llama-3.3-70b-versatile" }
  );
  return parseResponse(result);
}
```

### Graceful Degradation

Tất cả DB/Redis operations đều wrapped in try/catch — hệ thống vẫn chạy khi infrastructure không khả dụng:

```
[Redis] Connection error — continuing without cache
[DB] upsertFinding failed — continuing without persistence
[Hub] Embedding search failed — falling back to text search
[Search] Tavily unavailable — LLM fallback mode
```

---

## License

MIT — xem `AUTORESEARCH_SYSTEM.md` để biết chi tiết thiết kế hệ thống.