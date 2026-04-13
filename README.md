# AutoResearch — Multi-Agent Research System

> Hệ thống nghiên cứu tự động với nhiều AI agent chuyên môn, tương tự nhóm Senior Research Team.

## Mục lục

1. [Tổng quan](#1-tổng-quan)
2. [Kiến trúc](#2-kiến-trúc)
3. [Cài đặt](#3-cài-đặt)
4. [Cách sử dụng](#4-cách-sử-dụng)
5. [API Reference](#5-api-reference)
6. [LLM Providers & Models](#6-llm-providers--models)
7. [Cấu hình](#7-cấu-hình)
8. [Development](#8-development)
9. [Deployment](#9-deployment)

---

## 1. Tổng quan

### AutoResearch là gì?

AutoResearch là một hệ thống **multi-agent research engine** gồm 6 agents hoạt động phối hợp như một nhóm nghiên cứu chuyên nghiệp:

| Agent | Vai trò |
|-------|---------|
| 🧠 **Orchestrator** | Điều phối pipeline, phân công task, tổng hợp kết quả |
| 🔬 **Researcher** | Tìm kiếm paper, tổng hợp tài liệu, trích xuất findings |
| 💡 **Reasoner** | Phân tích deep insights, tìm hidden connections |
| 💻 **Coder** | Generate code, unit tests, debug |
| 📊 **Analyst** | Phân tích dữ liệu, so sánh benchmarks |
| 📝 **Writer** | Viết literature review, báo cáo, tài liệu |
| ✅ **Reviewer** | QA, fact-check, verify claims |

### Điểm khác biệt với NotebookLM

| | NotebookLM | AutoResearch |
|--|----------|-------------|
| Số sources | 50-100 | Unlimited |
| Agents | 1 | 6 chuyên môn |
| Parallel processing | Không | Có |
| Code generation | Không | Có |
| Self-verification | Không | Reviewer Agent |
| Long-term memory | Không | Knowledge Hub (vector DB) |
| Reuse insights cũ | Không | Có (vector similarity) |

---

## 2. Kiến trúc

### 2.1 Data Flow

```
USER INPUT: "Research RAG optimization techniques"
        │
        ▼
   Orchestrator (PM)
        │
   [1] Query Knowledge Hub ──→ Similar past research?
        │
   [2] DECOMPOSE ───────────────────────────────────┐
        │                                             │
        ├─► Researcher ──► Web/Paper search          │
        │         │                                  │
        │    [Extract findings]                       │
        │         │                                  │
        ├─► Reasoner ──► Deep Insights (6 strategies) │
        │         │                                  │
        ├─► Coder ──► Code prototype (optional)       │
        │         │                                  │
        ├─► Analyst ──► Data analysis (optional)     │
        │         │                                  │
        ├─► Writer ──► Literature review (optional)   │
        │         │                                  │
        └─► Reviewer ──► Quality verification         │
                                              │      │
                                    ┌─────────┘      │
                                    ▼                  │
                               [PASS? / FAIL]          │
                                 │      │              │
                                YES    NO ──► Retry ───┘
                                 │                        │
                                 ▼                        │
                        Archive to Knowledge Hub          │
                                 │                        │
                                 ▼                        │
                        Final Output → User ◄────────────┘
```

### 2.2 Knowledge Hub

```
┌────────────────────────────────────────────────────────────┐
│                      KNOWLEDGE HUB                          │
├──────────────┬───────────────────┬──────────────────────────┤
│ Long-term    │ Working          │ Communication           │
│ Memory       │ Context          │ History                 │
├──────────────┼───────────────────┼──────────────────────────┤
│ PostgreSQL   │ Redis            │ JSONL File               │
│ (pgvector)   │ (hot data)       │ (full log)              │
├──────────────┼───────────────────┼──────────────────────────┤
│ • Findings   │ • Task queue      │ • All agent messages     │
│ • Insights   │ • Agent status    │ • Decision rationale     │
│ • Sessions   │ • Session state   │ • Error log             │
│ • Code lib   │ • Rate limiting   │ • Review threads        │
├──────────────┼───────────────────┼──────────────────────────┤
│ Vector       │ Structured        │ Full-text               │
│ similarity   │ key-value         │ search                  │
│ search       │ hash             │ + filters               │
└──────────────┴───────────────────┴──────────────────────────┘
```

### 2.3 File Structure

```
autoresearch/
├── src/
│   ├── index.ts              # Express API server
│   ├── config.ts              # Configuration
│   ├── types.ts               # TypeScript types
│   ├── schema.sql             # PostgreSQL schema
│   ├── agents/
│   │   ├── orchestrator.ts    # Pipeline orchestration
│   │   ├── researcher.ts      # Web search + summarization
│   │   ├── reasoner.ts        # Deep insights (6 strategies)
│   │   ├── coder.ts           # Code generation + review
│   │   ├── analyst.ts         # Data analysis + charts
│   │   ├── writer.ts          # Literature review + reports
│   │   ├── reviewer.ts        # QA + fact-check
│   │   ├── run-all.ts         # CLI runner
│   │   └── lib/
│   │       └── claude.ts      # Claude API client
│   └── hub/
│       ├── db.ts              # PostgreSQL + pgvector
│       ├── redis.ts           # Redis queue + cache
│       ├── embeddings.ts      # OpenAI embeddings
│       └── queries.ts         # High-level KB operations
├── docker-compose.yml         # Full stack deployment
├── .env                       # Environment variables
├── package.json
├── tsconfig.json
├── AUTORESEARCH_SYSTEM.md     # Full system design doc
└── README.md                  # This file
```

---

## 3. Cài đặt

### 3.1 Yêu cầu

- **Node.js** >= 18
- **Docker & Docker Compose** (cho PostgreSQL + Redis)
- **Claude API key** (hoặc proxy như pro-x.io.vn)
- **OpenAI API key** (cho embeddings — optional)

### 3.2 Nhanh nhất

```bash
# Clone hoặc cd vào project
cd autoresearch

# Cài đặt dependencies
npm install

# Khởi động infrastructure (PostgreSQL + Redis)
docker-compose up -d postgres redis

# Chạy pipeline ngay (không cần DB)
npx tsx src/agents/run-all.ts --topic "RAG optimization techniques"
```

### 3.3 Đầy đủ (với Docker)

```bash
# Build và chạy toàn bộ stack
docker-compose up --build -d

# API chạy tại http://localhost:3001
curl http://localhost:3001/health
```

---

## 4. Cách sử dụng

### 4.1 CLI — Chạy Research Pipeline

```bash
# Research cơ bản
npx tsx src/agents/run-all.ts --topic "RAG optimization techniques"

# Với keywords
npx tsx src/agents/run-all.ts --topic "LLM fine-tuning" --keywords "rag,llm,fine-tuning"

# Full pipeline (bao gồm code gen, analysis, writing)
npx tsx src/agents/run-all.ts --topic "Knowledge Graph + RAG" --full
```

**Output mẫu:**
```
🔬 AutoResearch — Research Topic: "RAG optimization techniques"
────────────────────────────────────────────────────────────
[Orchestrator] Phase 1: Research...
[Orchestrator] Phase 2: Reasoning (Deep Insights)...
[Orchestrator] Phase 3: Writing...
✅ Research completed in 142.7s

📄 Findings: 5
💡 Insights: 8
📊 Knowledge Gaps: 5

TOP INSIGHTS:
  1. [TEMPORAL] RAG Optimization Has Shifted...
  2. [SYNTHESIS] Hierarchical Chunking + Reranking...
  3. [CONTRADICTION] Dense Retrieval vs BM25...
```

### 4.2 API Server

```bash
# Khởi động server
npm run dev

# Bắt đầu research (async)
curl -X POST http://localhost:3001/api/research \
  -H "Content-Type: application/json" \
  -d '{"topic": "RAG optimization techniques", "keywords": ["rag", "retrieval"]}'

# Poll kết quả
curl http://localhost:3001/api/research/{sessionId}

# Xem danh sách sessions
curl http://localhost:3001/api/sessions

# System status
curl http://localhost:3001/api/status
```

### 4.3 API Response Format

**POST /api/research** trả về ngay (xử lý background):

```json
{
  "sessionId": "abc-123",
  "status": "pending",
  "message": "Research started"
}
```

**GET /api/research/{id}** — khi hoàn thành:

```json
{
  "sessionId": "abc-123",
  "status": "completed",
  "findings": [
    {
      "id": "f001",
      "title": "Self-RAG: Learning to Retrieve...",
      "sourceUrl": "https://arxiv.org/...",
      "confidence": 0.9,
      "summary": "..."
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
        "confidence": 0.82
      }
    ],
    "knowledgeGaps": ["..."],
    "researchTrends": {
      "rising": ["long-context", "multi-modal-rag"],
      "stable": ["reranking", "hybrid-search"],
      "declining": ["fixed-chunk"]
    }
  },
  "tasks": [...],
  "duration": 142700
}
```

---

## 5. API Reference

### Endpoints

| Method | Endpoint | Mô tả |
|--------|---------|--------|
| `GET` | `/health` | Health check |
| `POST` | `/api/research` | Bắt đầu research job |
| `GET` | `/api/research/:id` | Lấy kết quả / trạng thái job |
| `GET` | `/api/sessions` | Danh sách tất cả sessions |
| `GET` | `/api/status` | System status + agent health |

### POST /api/research

**Request:**
```json
{
  "topic": "string (required)",
  "keywords": ["string"] (optional),
  "sessionId": "string (optional, dùng lại session)",
  "maxSources": 10 (optional, default: 10)
}
```

**Response:**
```json
{
  "sessionId": "uuid",
  "status": "pending",
  "message": "Research started"
}
```

### GET /api/research/:id

**Response (completed):**
```json
{
  "sessionId": "uuid",
  "status": "completed",
  "findings": [...],
  "insights": {...},
  "tasks": [...],
  "duration": 142700,
  "reusedFromKnowledgeHub": [...]
}
```

**Response (pending/running):**
```json
{
  "sessionId": "uuid",
  "status": "running",
  "message": "Research in progress..."
}
```

---

## 6. LLM Providers & Models

### 6.1 Supported Providers

| Provider | Loại | API Key | Ví dụ Model | Chi phí |
|----------|------|---------|-------------|---------|
| **Anthropic** | Cloud | `ANTHROPIC_API_KEY` | `claude-opus-4-6`, `claude-sonnet-4-6` | 💰 Cao |
| **OpenAI** | Cloud | `OPENAI_API_KEY` | `gpt-4o`, `gpt-4o-mini`, `o1` | 💰 Trung |
| **Groq** | Cloud | `GROQ_API_KEY` | `llama-3.3-70b-versatile`, `mixtral-8x7b` | 🆓 Free tier (30 req/min) |
| **Ollama** | Local | Không cần | `llama3.2`, `qwen2.5`, `codellama` | 🆓 Miễn phí |
| **LM Studio** | Local | Không cần | Bất kỳ model nào đã tải | 🆓 Miễn phí |
| **vLLM** | Local | Tự set | `Llama-3.1-8B`, `Qwen-2.5` | 🆓 Miễn phí |
| **Fireworks AI** | Cloud | `FIREWORKS_API_KEY` | `llama-v3p3-70b-instruct` | 💰 Rẻ |

### 6.2 Thêm API Keys

Mở file `.env` và thêm các biến sau:

```env
# ─── Anthropic (Claude) — hiện tại đang dùng ─────────────────────────
ANTHROPIC_API_KEY=sk-c2f7fd5fc46e43279fb9c27d46aff48669f1da8db5ad5655b3606fcc9477e22b
ANTHROPIC_BASE_URL=https://pro-x.io.vn/          # proxy hoặc https://api.anthropic.com

# ─── OpenAI (GPT-4, o1, embeddings) ──────────────────────────────────
OPENAI_API_KEY=sk-...                              # platform.openai.com
OPENAI_BASE_URL=https://api.openai.com/v1

# ─── Groq — free tier rất nhanh ─────────────────────────────────────
# Đăng ký: console.groq.com (free 30 req/min)
GROQ_API_KEY=gsk_...
GROQ_BASE_URL=https://api.groq.com/openai/v1

# ─── Ollama — local models miễn phí ────────────────────────────────
# Chạy: `ollama serve` (mặc định localhost:11434)
OLLAMA_BASE_URL=http://localhost:11434

# ─── LM Studio — local GUI ──────────────────────────────────────────
# Mở LM Studio → Server Settings → Enable OpenAI-Compatible API
LMSTUDIO_BASE_URL=http://localhost:1234/v1
LMSTUDIO_API_KEY=lm-studio

# ─── vLLM — self-hosted production ─────────────────────────────────
# python -m vllm.entrypoints.openai.api_server --model meta-llama/Llama-3.1-8B-Instruct
VLLM_BASE_URL=http://localhost:8000/v1
VLLM_API_KEY=EMPTY

# ─── Fireworks AI — fast inference ─────────────────────────────────
FIREWORKS_API_KEY=...
```

### 6.3 Model Selection Guide — Tại sao chọn model này?

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                     MODEL SELECTION DECISION TREE                              ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                               ║
║  Bạn có GPU mạnh (24GB+ VRAM)?                                              ║
║     │                                                                        ║
║     ├─ YES ──► Chạy local (Ollama / LM Studio / vLLM)  → Tiết kiệm 100%    ║
║     │                 Recommendation: llama3.1:70b (reasoning)               ║
║     │                                  qwen2.5:32b (coding)                    ║
║     │                                  codellama:34b (code)                    ║
║     │                                                                        ║
║     └─ NO ───► Chạy cloud API                                                ║
║                 │                                                             ║
║                 ├─ Budget cao ──► Claude Opus 4 (best quality)               ║
║                 │                  + GPT-4o (backup)                        ║
║                 │                                                             ║
║                 ├─ Budget trung ──► Groq + Claude Sonnet (fast + good)       ║
║                 │                  Groq: llama-3.3-70b (free!)             ║
║                 │                                                             ║
║                 └─ Budget thấp ──► Groq + GPT-4o-mini (rẻ nhất)            ║
║                                    Ollama llama3.2:3b (free, fast)            ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

### 6.4 Model Recommendations per Agent

| Agent | Primary (Cloud) | Fallback (Free) | Local GPU | Notes |
|-------|----------------|----------------|-----------|-------|
| **Orchestrator** | Claude Opus 4 | Groq llama-3.3-70b | llama3.1:70b | Cần chain-of-thought mạnh |
| **Reasoning** | Claude Opus 4 | Groq llama-3.3-70b | llama3.1:70b | Deep reasoning — avoid small models |
| **Research** | Claude Sonnet 4 | Groq llama-3.3-70b | llama3.2:3b | Small model OK cho summarization |
| **Coder** | Claude Sonnet 4 | Groq llama-3.3-70b | qwen2.5:32b | Qwen mạnh về code |
| **Analyst** | Claude Sonnet 4 | Groq llama-3.3-70b | qwen2.5:32b | Qwen tốt về math/stats |
| **Writer** | Claude Opus 4 | Groq llama-3.3-70b | llama3.1:8b | Opus viết hay nhất |
| **Reviewer** | Claude Opus 4 | Groq llama-3.3-70b | llama3.1:70b | Cần strict reasoning |

### 6.5 Benchmark Comparison (Approximate)

| Model | Code | Reasoning | Writing | Speed | VRAM |
|-------|------|-----------|---------|-------|------|
| `claude-opus-4-6` | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | Medium | N/A |
| `gpt-4o` | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | Medium | N/A |
| `llama-3.3-70b` (Groq) | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⚡ Very Fast | N/A |
| `codellama:34b` (Ollama) | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | Medium | 24GB |
| `qwen2.5:32b` (Ollama) | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | Medium | 24GB |
| `llama3.1:70b` (Ollama) | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | Slow | 80GB |
| `llama3.2:3b` (Ollama) | ⭐⭐ | ⭐⭐ | ⭐⭐ | ⚡ Very Fast | 4GB |

### 6.6 Sử dụng Unified LLM Client

```typescript
import { llm } from "./src/llm/client.ts";

// ─── Cách 1: Qua shortcut (nhanh nhất) ─────────────────────────────────
const result = await llm.call(
  "Viết một function fibonacci",
  "claude-opus-4-6"     // auto-detect provider từ tên
);
console.log(result);

// ─── Cách 2: Chỉ rõ provider ────────────────────────────────────────────
const result2 = await llm.call(
  "Explain RAG in 3 sentences",
  "llama-3.3-70b",       // → provider: "groq"
  { provider: "groq" }
);

// ─── Cách 3: Đầy đủ options ─────────────────────────────────────────────
const result3 = await llm.chat(
  [{ role: "user", content: "Tóm tắt paper này..." }],
  {
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    system: "You are a senior research analyst.",
    temperature: 0.3,
    maxTokens: 2048,
  }
);

// ─── Cách 4: Check provider health ───────────────────────────────────────
const health = await llm.status();
console.log(health);
// { anthropic: true, openai: false, groq: true, ollama: true, lmstudio: false, ... }
```

### 6.7 Ollama — Setup và Recommended Models

```bash
# 1. Cài Ollama
curl -fsSL https://ollama.com/install.sh | sh

# 2. Khởi động server
ollama serve

# 3. Pull models (chọn theo VRAM của bạn)

# ── 4GB VRAM: Small & Fast ──────────────────────────────────
ollama pull llama3.2:3b                    # General (4GB)
ollama pull llama3.2:1b                   # Ultra fast (2GB)

# ── 8GB VRAM: Medium quality ────────────────────────────────
ollama pull llama3.1:8b                   # General (8GB)
ollama pull qwen2.5:14b                   # Coding (14GB)

# ── 24GB VRAM: Good quality ────────────────────────────────
ollama pull codellama:34b                  # Code specialized (24GB)
ollama pull qwen2.5:32b                   # Code + Math (24GB)
ollama pull llama3.1:70b                  # Best local reasoning (80GB!)

# ── 80GB VRAM: Production quality ───────────────────────────
ollama pull llama3.1:70b                  # Near GPT-4 quality (80GB)

# 4. Verify
ollama list
```

**Tại sao `llama3.1:70b` cho reasoning?**
- Small models (3B, 8B) gặp khó với multi-step reasoning và long context
- `llama3.1:70b` đủ lớn để hiểu được complex research analysis
- `qwen2.5:32b` tốt hơn `llama3.1:70b` về code generation ở cùng VRAM
- `codellama:34b` specialized cho code nhưng yếu hơn về reasoning tổng quát

### 6.8 LM Studio — Setup

```bash
# 1. Tải LM Studio: https://lmstudio.ai

# 2. Mở app → Tải model
#    Recommend: Meta-Llama-3.1-70B-Instruct-Q4_K_M (nếu đủ RAM)

# 3. Server Settings (sidebar)
#    □ Enable OpenAI-Compatible API
#    Port: 1234
#    API Key: (để trống hoặc điền "lm-studio")

# 4. Nhấn ▶ Start Server

# 5. Test
curl http://localhost:1234/v1/models
```

### 6.9 Cost Comparison (1 triệu tokens)

| Provider/Model | Input | Output | Notes |
|---------------|-------|--------|-------|
| Claude Opus 4 | $15 | $75 | Best quality |
| Claude Sonnet 4 | $3 | $15 | Good value |
| GPT-4o | $5 | $15 | Good all-round |
| GPT-4o-mini | $0.15 | $0.60 | Very cheap |
| Groq llama-3.3-70b | Free* | Free* | *30 req/min free |
| Ollama (local) | $0 | $0 | Free if you have GPU |

**Recommendation cho cost-conscious users:**
```
Research Agent  → Groq llama-3.3-70b (free, fast)
Coder Agent     → Groq llama-3.3-70b (free, fast)
Reasoner Agent  → Claude Sonnet 4 (quality matters)
Writer Agent    → Claude Sonnet 4 (quality matters)
```

### 6.10 Production: Ollama vs LM Studio vs vLLM

| Criteria | Ollama | LM Studio | vLLM |
|----------|--------|-----------|------|
| Setup | ⭐⭐ Easy (CLI) | ⭐⭐⭐ Easy (GUI) | ⭐ Complex |
| GPU usage | ⭐ Basic | ⭐⭐ Advanced | ⭐⭐⭐⭐⭐ Best |
| Throughput | ⭐ Basic | ⭐⭐ Good | ⭐⭐⭐⭐⭐ Best |
| Model variety | ⭐⭐ Good | ⭐⭐⭐ Many | ⭐⭐⭐⭐ Many |
| API compatibility | Ollama native | OpenAI-compatible | OpenAI-compatible |
| Best for | Dev, testing | Local dev | Production |

**Production recommendation:** vLLM > LM Studio > Ollama
**Local dev recommendation:** LM Studio (GUI dễ dùng)

---

## 7. Cấu hình

### 7.1 Environment Variables (`.env`)

Thêm các API key vào file `.env`:

```env
# ─── Anthropic (Claude) ───────────────────────────────────────────────
ANTHROPIC_API_KEY=sk-...           # Required
ANTHROPIC_BASE_URL=https://pro-x.io.vn/

# ─── OpenAI (GPT-4, o1, embeddings) ──────────────────────────────────
OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=https://api.openai.com/v1

# ─── Groq (fast, free) ────────────────────────────────────────────────
GROQ_API_KEY=gsk_...              # console.groq.com

# ─── Ollama (local) ──────────────────────────────────────────────────
OLLAMA_BASE_URL=http://localhost:11434

# ─── LM Studio (local) ──────────────────────────────────────────────
LMSTUDIO_BASE_URL=http://localhost:1234/v1
LMSTUDIO_API_KEY=lm-studio

# ─── vLLM (self-hosted) ──────────────────────────────────────────────
VLLM_BASE_URL=http://localhost:8000/v1
VLLM_API_KEY=EMPTY

# ─── Fireworks AI ────────────────────────────────────────────────────
FIREWORKS_API_KEY=...

# ─── Infrastructure ─────────────────────────────────────────────────
DATABASE_URL=postgres://postgres:ar_password_2026@localhost:5432/autoresearch
POSTGRES_PASSWORD=ar_password_2026
REDIS_URL=redis://:ar_redis_2026@localhost:6380
PORT=3001
NODE_ENV=development
```

### 7.2 Switching Between Providers

Cách nhanh nhất để chuyển provider cho một agent — edit `src/config.ts`:

```typescript
// Trước (Anthropic):
models: {
  research: "claude-sonnet-4-6",  // $$$

  research: "llama-3.3-70b-versatile",  // Groq: free, fast
  research: "llama3.2",              // Ollama: free, local
}
```

Hoặc dùng env var để override:
```env
# Override model per agent via environment
AGENT_MODEL_RESEARCH=llama-3.3-70b-versatile
AGENT_MODEL_CODER=qwen2.5:32b
```

### 7.3 Provider Health Check

```bash
# Kiểm tra tất cả providers cùng lúc
npx tsx -e "
import { llm } from './src/llm/client.ts';
const s = await llm.status();
console.table(Object.entries(s).map(([k,v]) => ({ provider: k, available: v ? '✅' : '❌' })));
"
```

---

## 8. Development

### 8.1 Chạy development server

```bash
# API server với hot-reload
npm run dev

# CLI runner
npx tsx src/agents/run-all.ts --topic "..."
npx tsx src/agents/run-all.ts --topic "..." --full
```

### 8.2 TypeScript check

```bash
./node_modules/.bin/tsc -p tsconfig.json
```

### 8.3 Chạy tests

```bash
npm test
```

### 8.4 Thêm Agent mới

```typescript
// src/agents/newagent.ts
import { llm } from "../llm/client.ts";

export async function runMyAgent(task: string): Promise<Result> {
  const response = await llm.chat(
    [{ role: "user", content: task }],
    {
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      system: "Your system prompt here",
    }
  );
  return parseResponse(response.content);
}

// Hoặc dùng unified llm client:
import { llm } from "../llm/client.ts";

const result = await llm.call(
  "Analyze this research finding",
  "claude-sonnet-4-6",  // auto-detects provider
  { provider: "anthropic" }
);
```

### 8.5 Graceful Degradation

Tất cả DB/Redis operations đều wrap trong try/catch — hệ thống chạy được dù DB/Redis không khả dụng:
[Redis] Connection error (continuing without cache): connect ECONNREFUSED
[DB] upsertFinding failed: ... (continuing without persistence)
[Hub] Embedding search failed: ... (falling back to text search)
```

---

## 9. Deployment

### 9.1 Docker Compose
    ports:
      - "3001:3001"
    environment:
      DATABASE_URL: postgres://postgres:ar_password_2026@postgres:5432/autoresearch
      REDIS_URL: redis://:ar_redis_2026@redis:6379
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_healthy }
```

```bash
# Khởi động
docker-compose up -d

# Xem logs
docker-compose logs -f api

# Stop
docker-compose down
```

### 9.2 Init Database Schema

Schema tự động init khi API start, hoặc chạy thủ công:

```bash
psql $DATABASE_URL -f src/schema.sql
```

### 9.3 Production Checklist

- [ ] Claude API key hợp lệ
- [ ] PostgreSQL + Redis running
- [ ] Database schema initialized
- [ ] OpenAI API key cho embeddings (optional)
- [ ] Rate limiting configured (Redis)
- [ ] Logs monitoring set up
- [ ] Backup strategy cho PostgreSQL

---

## License

MIT — xem `AUTORESEARCH_SYSTEM.md` để biết chi tiết thiết kế hệ thống.
