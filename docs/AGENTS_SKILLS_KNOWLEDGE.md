# ORIN Multi-Agent Research Engine — Agents, Skills & Knowledge Architecture

> **Version**: 1.0.0 | **Date**: 2026-04-18 | **Author**: ORIN System Analysis

---

## Mục lục

1. [Tổng quan Kiến trúc](#1-tổng-quan-kiến-trúc)
2. [Đánh giá Chi tiết 7 Agents](#2-đánh-giá-chi-tiết-7-agents)
3. [Bugs & Issues](#3-bugs--issues)
4. [Skills hiện có & Còn thiếu](#4-skills-hiện-có--còn-thiếu)
5. [Knowledge Base Architecture](#5-knowledge-base-architecture)
6. [Điều hệ thống đang tối ưu](#6-điều-hệ-thống-đang-tối-ưu)
7. [Hạn chế & Improvement Areas](#7-hạn-chế--improvement-areas)
8. [Kế hoạch Triển khai](#8-kế-hoạch-triển-khai)

---

## 1. Tổng quan Kiến trúc

### 1.1 Pipeline Flow

```
USER INPUT
    │
    ▼
Orchestrator
    │
    ├── Query Knowledge Hub → Reuse similar past research?
    │
    ├── Researcher ──→ Real web search (Tavily + arXiv + Semantic Scholar + DuckDuckGo)
    │         └── Extract structured findings
    │
    ├── Analyst ──→ Statistical analysis, visualizations
    ├── Graph Builder ──→ Knowledge graph entities
    │
    ├── Reasoner ──→ 6 reasoning strategies
    │         ├── CROSS_PAPER_SYNTHESIS
    │         ├── CONTRADICTION_HUNTING
    │         ├── TEMPORAL_ANALYSIS
    │         ├── GAP_DISCOVERY
    │         ├── CROSS_DOMAIN_TRANSFER
    │         └── FAILURE_ANALYSIS
    │
    ├── Writer ──→ Literature review, reports
    │
    ├── Reviewer ──→ QA + fact-check
    │
    ▼
Knowledge Hub (pgvector) ──→ Final Output
```

### 1.2 Parallel Execution Model

```
Phase 1: Research (sequential — critical path)
  └── Researcher → Sources

Phase 2: Analysis (PARALLEL — after sources ready)
  ├── Analyst      → Statistics + comparisons
  └── Graph Builder → Knowledge graph

Phase 3: Synthesis (PARALLEL — after Phase 2)
  ├── Reasoner     → Deep insights
  └── Writer       → Literature review

Phase 4: Review (sequential)
  └── Reviewer     → QA + verification
```

---

## 2. Đánh giá Chi tiết 7 Agents

### 2.1 🎛 Orchestrator Agent — Điểm: 6/10

**File**: `src/agents/orchestrator.ts`

**System Prompt** (implicit via `decomposeTask`):
```
You are a project manager. Break down research topics into clear, actionable subtasks.
```

**Capabilities**:
- Task decomposition
- Parallel pipeline orchestration
- Knowledge Hub reuse query
- Result aggregation
- Progress tracking via SSE events

**Strengths**:
- ✅ Parallel execution model (researcher+analyst+graph đồng thời)
- ✅ Knowledge Hub reuse query trước khi research mới
- ✅ Graceful error handling với try/catch
- ✅ SSE event emission cho real-time progress

**Weaknesses**:
- ❌ `decomposeTask()` prompt rất generic — không có domain context
- ❌ Không có few-shot examples cho task decomposition
- ❌ `selfReview()` function không được gọi trong pipeline
- ❌ Không có retry logic cho failed agents

**Skills hiện có**:
- Task decomposition
- Parallel orchestration
- Progress tracking

**Skills cần thêm**:
- Domain-specific decomposition rules
- Agent retry/backoff logic
- Multi-session coordination

---

### 2.2 🔍 Researcher Agent — Điểm: 8/10 ⭐

**File**: `src/agents/researcher.ts`

**System Prompt** (line 100):
```
You are a precise research analyst. Extract factual information only.
Do not invent or hallucinate details.
```

**PAPER_SUMMARY_PROMPT** (English — có inconsistency với Vietnamese prompts khác):
```
You are summarizing research sources for a research team.

Title: {title}
Source URL: {url}
Content/snippets: {content}

Extract and summarize in JSON format:
{
  "title": "cleaned title",
  "key_findings": [...],
  "summary": "2-3 sentence summary",
  "questions_raised": ["question raised"],
  "source_type": "paper|web"
}
```

**Capabilities**:
- Web search (4 providers cascade)
- Structured finding extraction
- LLM fallback khi không có web
- Source deduplication

**Strengths**:
- ✅ Cascade search: arXiv → Tavily → Semantic Scholar → DuckDuckGo
- ✅ Fallback strategy rõ ràng khi web fails
- ✅ Source deduplication via Set
- ✅ Structured JSON extraction

**Weaknesses**:
- ⚠️ Prompt language mismatch (PAPER_SUMMARY_PROMPT = English, system = Vietnamese)
- ❌ Không có quality scoring cho sources
- ❌ Không có author/citation network analysis
- ❌ Rate limit handling không explicit

**Skills hiện có**:
- Web search orchestration (4 providers)
- JSON extraction từ web content
- Fallback reasoning mode
- Source deduplication

**Skills cần thêm**:
- Source quality scoring (0-10)
- Author/citation network analysis
- Domain-specific search query templates

---

### 2.3 🧠 Reasoner Agent — Điểm: 9/10 🏆 BEST AGENT

**File**: `src/agents/reasoner.ts`

**REASONING_SYSTEM_PROMPT** (Vietnamese):
```
Bạn là Reasoning Agent — Senior Research Analyst của nhóm nghiên cứu AI.

NHIỆM VỤ: Phân tích các research findings và đưa ra DEEP INSIGHTS —
những connection và pattern mà con người hoặc single-agent dễ bỏ sót.
```

**6 CHIẾN LƯỢC REASONING**:

| Strategy | Type | Mô tả |
|----------|------|--------|
| `CROSS_PAPER_SYNTHESIS` | synthesis | Tổng hợp findings từ nhiều papers |
| `TEMPORAL_ANALYSIS` | temporal | Research evolution over time |
| `CONTRADICTION_HUNTING` | contradiction | Phát hiện conflicting results |
| `GAP_DISCOVERY` | gap | Tìm unstudied areas |
| `CROSS_DOMAIN_TRANSFER` | transfer | Cross-field technique transfer |
| `FAILURE_ANALYSIS` | failure | Lessons from failed approaches |

**Capabilities**:
- Multi-strategy reasoning
- Knowledge graph enrichment
- Insight deduplication
- Knowledge gap discovery
- Research trend identification

**Strengths**:
- ✅ 6 strategies rõ ràng với Vietnamese explanations
- ✅ Graph context enrichment (tránh rediscover known things)
- ✅ Deduplication via `similarity()` function
- ✅ Separate stage cho knowledge gaps
- ✅ Evidence-based confidence scoring

**Weaknesses**:
- ⚠️ `identifyResearchTrends()` chỉ keyword-based — yếu
- ❌ Không có LLM-based trend analysis
- ❌ Không có cross-session insight comparison

**Skills hiện có** (6 chiến lược đầy đủ):
1. CROSS_PAPER_SYNTHESIS — Tổng hợp findings từ nhiều papers
2. CONTRADICTION_HUNTING — Phát hiện conflicting results
3. GAP_DISCOVERY — Tìm unstudied areas
4. CROSS_DOMAIN_TRANSFER — Cross-field technique transfer
5. TEMPORAL_ANALYSIS — Research evolution timeline
6. FAILURE_ANALYSIS — Lessons from failed approaches

**Skills cần thêm**:
- LLM-based trend analysis (thay keyword matching)
- Cross-session insight comparison
- Methodology taxonomy integration

---

### 2.4 💻 Coder Agent — Điểm: 6/10 ⚠️ BROKEN

**File**: `src/agents/coder.ts`

**SYSTEM_PROMPT** (Vietnamese):
```
Bạn là Senior Software Engineer với 15 năm kinh nghiệm.
Bạn viết code sạch, hiệu quả, có documentation, và có unit tests.
Luôn tuân thủ best practices cho từng ngôn ngữ.
Code phải production-ready, không phải prototype.
```

**⚠️ CRITICAL BUG** — `CODE_GENERATION_TEMPLATE` reference BEFORE definition:

```typescript
// line 57-84: generateCode() sử dụng:
// line 71: content: CODE_GENERATION_TEMPLATE  ← REFERENCE ERROR!

// line 86-112: Constant được ĐỊNH NGHĨA Ở ĐÂY (SAU khi dùng)
const CODE_GENERATION_TEMPLATE = `You are generating...`
```

**Bug**: Trong ES modules, `const` không hoisted → runtime crash `ReferenceError`.

**Fix**: Đổi tên `CODE_GENERATION_TEMPLATE` → `CODE_GENERATION_PROMPT` (trùng với constant ở line 30) và move lên TRƯỚC function.

**Capabilities**:
- Code generation (multi-language)
- Code review
- Debug and fix

**Skills hiện có**:
- Code generation
- Code review
- Debugging

**Skills cần thêm**:
- `generateTests()` — Dedicated test generation function
- API design + OpenAPI spec generation
- Security vulnerability scanning
- Performance profiling suggestions

---

### 2.5 📊 Analyst Agent — Điểm: 7/10

**File**: `src/agents/analyst.ts`

**SYSTEM_PROMPT** (Vietnamese):
```
Bạn là Senior Data Scientist với 15 năm kinh nghiệm.
Phân tích dữ liệu cẩn thận, đưa ra insights có data-driven.
Trực quan hóa bằng các chart/table rõ ràng.
Luôn chỉ ra confidence level và limitations.
```

**Capabilities**:
- Statistical analysis
- Visualization specs (JSON)
- Benchmark comparisons
- Ranking + radar data

**Strengths**:
- ✅ Multiple output modes (analysis, comparison, benchmark)
- ✅ JSON visualization specs (bar/line/pie/scatter/table/heatmap)
- ✅ Confidence + limitations awareness

**Weaknesses**:
- ❌ `analyzeFindings()` nhận raw text — phải parse lại
- ❌ Không có temporal/time-series analysis
- ❌ Không có anomaly/outlier detection
- ❌ Visualizations là JSON specs, không phải actual charts

**Skills hiện có**:
- Statistical analysis (avg confidence, count metrics)
- Visualization specs generation
- Benchmark comparison + ranking
- Radar chart data generation

**Skills cần thêm**:
- Temporal/time-series analysis
- Anomaly/outlier detection
- Longitudinal data analysis
- Dataset comparison framework

---

### 2.6 ✍️ Writer Agent — Điểm: 8/10

**File**: `src/agents/writer.ts`

**SYSTEM_PROMPT** (Vietnamese):
```
Bạn là Senior Technical Writer chuyên viết báo cáo nghiên cứu.
Viết rõ ràng, có cấu trúc, có citations.
Giải thích technical concepts sao cho người đọc không chuyên cũng hiểu được.
Luôn có: abstract, introduction, methodology, findings, discussion, conclusion.
```

**3 Output Modes**:

| Function | Output | Audience |
|---------|--------|---------|
| `writeLiteratureReview()` | 8-section academic paper | Researchers |
| `writeDeepInsightsReport()` | Executive-style report | Analysts |
| `writeExecutiveBrief()` | 2-3 page decision brief | Decision makers |

**Capabilities**:
- Literature review writing
- Deep insights report
- Executive briefs

**Strengths**:
- ✅ 3 distinct output modes cho 3 audiences
- ✅ 8-section structure đầy đủ
- ✅ JSON structured output với markdown fallback
- ✅ Citation handling

**Weaknesses**:
- ❌ Không có technical blog posts mode
- ❌ Không có presentation outline (được đề cập trong comment nhưng không implement)
- ❌ Không có multi-language support
- ❌ Không có versioning/diffing cho report updates

**Skills hiện có**:
- Academic writing (literature review)
- Deep insights synthesis
- Executive brief generation
- Citation formatting

**Skills cần thêm**:
- Technical blog posts (developer audience)
- Presentation slide outlines
- Multi-language output
- Report comparison/diff

---

### 2.7 ✅ Reviewer Agent — Điểm: 9/10 🏆 BEST AGENT (tied)

**File**: `src/agents/reviewer.ts`

**SYSTEM_PROMPT** (Vietnamese):
```
Bạn là Senior Reviewer với 15 năm kinh nghiệm trong QA và technical review.
Phát hiện vấn đề một cách chính xác và đưa ra feedback xây dựng.
Không quá khắt khe nhưng cũng không bỏ qua lỗi thật.
Ưu tiên: factual accuracy > logical consistency > completeness > style.
```

**4 Review Functions**:

| Function | Focus | Output |
|---------|-------|--------|
| `reviewInsights()` | Full insight quality | ReviewResult with issues + suggestions |
| `reviewFinding()` | Single finding accuracy | Valid claims + issues |
| `reviewCodeQuality()` | Code correctness/security | Security + style + performance |
| `verifyCitation()` | Claim vs finding | Supported/not supported |

**Capabilities**:
- Factual accuracy verification
- Logical consistency check
- Citation verification
- Code quality review

**Strengths**:
- ✅ 4 distinct review functions
- ✅ Severity × Type classification matrix
- ✅ Evidence-based claim verification
- ✅ Structured feedback với recommendations

**Weaknesses**:
- ❌ Không có reproducibility scoring
- ❌ Không có statistical significance checking
- ❌ Không có peer-review style feedback
- ❌ Không có cross-validation với external sources

**Skills hiện có**:
- Factual accuracy verification
- Logical consistency checking
- Citation verification
- Code quality review
- Edge case identification
- Issue classification (severity × type)

**Skills cần thêm**:
- Reproducibility scoring
- Statistical significance validation
- Peer-review style feedback
- External source cross-validation

---

## 3. Bugs & Issues

### 🔴 CRITICAL — Phải fix NGAY

#### Bug 1: `CODE_GENERATION_TEMPLATE` ReferenceError (coder.ts)

**Severity**: CRITICAL — Runtime crash
**File**: `src/agents/coder.ts`, line 71
**Status**: Unfixed

**Root Cause**: ES module `const` không hoisted. Function `generateCode()` dùng biến ở line 71 nhưng constant được define ở line 86.

**Impact**: Gọi `generateCode()` → `ReferenceError: CODE_GENERATION_TEMPLATE is not defined`

**Fix Required**:
```typescript
// Move constant lên TRƯỚC function
const CODE_GENERATION_PROMPT = `You are generating production-ready code based on research findings.
...`;

// Sau đó:
export async function generateCode(...) {
  content: CODE_GENERATION_PROMPT  // Correct name + position
}
```

---

### 🟡 MEDIUM — Nên fix sớm

#### Bug 2: `selfReview()` Dead Code (orchestrator.ts)

**Severity**: MEDIUM
**File**: `src/agents/orchestrator.ts`, line 371-393
**Status**: Unused

**Root Cause**: `selfReview()` được định nghĩa nhưng không được gọi trong `runResearchPipeline()`.

**Current behavior**: Chỉ có `reviewInsights()` từ Reviewer agent được gọi.

**Options**:
1. **Integrate**: Call `selfReview()` sau `reviewInsights()` để filter insights thấp
2. **Delete**: Remove function nếu không cần

**Recommended**: Integrate — `selfReview()` có logic tốt (filter generic insights, low-confidence insights).

---

#### Bug 3: Prompt Language Inconsistency

**Severity**: MEDIUM
**Files**: Multiple agent files

**Root Cause**:
- `PAPER_SUMMARY_PROMPT` (researcher.ts) → **English**
- All other SYSTEM_PROMPTs → **Vietnamese**
- `decomposeTask()` (orchestrator.ts) → **English**

**Impact**: Inconsistent language có thể ảnh hưởng đến output quality khi agents interact.

**Fix**: Thống nhất tất cả prompts sang Vietnamese (recommend) hoặc English.

---

## 4. Skills hiện có & Còn thiếu

### 4.1 Skills Matrix

| Agent | ✅ Skills hiện có | ❌ Skills còn thiếu | Priority |
|-------|------------------|-------------------|----------|
| **Orchestrator** | Task decomposition, Parallel orchestration, Progress tracking | Domain-specific decomposition, Retry logic, Multi-session coordination | HIGH |
| **Researcher** | Web search (4 providers), JSON extraction, Fallback reasoning, Source dedup | Quality scoring, Author/citation network, Rate limit handling | HIGH |
| **Reasoner** | 6 reasoning strategies, Graph integration, Deduplication, Gap discovery | LLM trend analysis, Cross-session comparison, Methodology taxonomy | HIGH |
| **Coder** | Code generation, Code review, Debugging | Test generation, API design, Security scanning | HIGH |
| **Analyst** | Statistical analysis, Visualization specs, Benchmark comparison | Temporal analysis, Anomaly detection, Longitudinal analysis | MEDIUM |
| **Writer** | Literature review, Executive brief, Deep insights report | Technical blog, Presentation slides, Multi-language | MEDIUM |
| **Reviewer** | Factual verification, Logical check, Citation verify, Code quality | Reproducibility scoring, Statistical validation, Peer-review feedback | MEDIUM |

### 4.2 Skills cần build chi tiết

#### HIGH Priority Skills

**1. Domain-Specific Decomposition (Orchestrator)**
```
Input: Research topic
Process:
  - Detect domain (AI/ML, Biotech, Finance, etc.)
  - Apply domain-specific decomposition rules
  - Generate 3-5 actionable subtasks
Output: Structured subtasks với domain context
```

**2. Source Quality Scoring (Researcher)**
```
Input: Raw search result
Process:
  - Score: citation count, venue reputation, author h-index
  - Filter: reject sources < 5/10
  - Rank: sort by quality score
Output: Ranked findings với quality scores
```

**3. Test Generation (Coder)**
```typescript
// Function signature:
export async function generateTests(
  code: string,
  language: string,
  framework: string
): Promise<{ tests: string; coverage: number; testCases: string[] }>
```

**4. LLM-Based Trend Analysis (Reasoner)**
```
Input: Research findings
Process:
  - LLM analyzes evolution patterns
  - Identify paradigm shifts
  - Generate trend descriptions (not keyword-based)
Output: Structured trends với reasoning chain
```

---

## 5. Knowledge Base Architecture

### 5.1 Knowledge Bases per Agent

```
src/knowledge/
├── researcher/
│   ├── source-quality-rules.ts     # Source scoring heuristics
│   ├── search-templates.ts         # Domain-specific query templates
│   └── citation-patterns.ts        # Citation network patterns
├── reasoner/
│   ├── methodology-taxonomy.ts     # Research methodology classification
│   ├── evidence-hierarchy.ts       # Evidence quality hierarchy
│   └── cross-domain-mappings.ts    # Cross-field technique transfers
├── coder/
│   ├── language-best-practices.ts # Per-language idioms
│   ├── bug-patterns.ts             # Common bug patterns (OWASP, etc.)
│   └── test-frameworks.ts          # Testing frameworks per language
├── analyst/
│   ├── stat-pitfalls.ts            # Statistical analysis pitfalls
│   └── visualization-types.ts      # When to use which chart type
├── writer/
│   ├── citation-styles.ts          # APA, MLA, Chicago, IEEE formats
│   ├── document-templates.ts        # Structure templates
│   └── style-guide.ts             # Technical writing guidelines
└── reviewer/
    ├── logical-fallacies.ts         # Fallacy taxonomy
    ├── stat-red-flags.ts          # P-hacking, cherry-picking patterns
    └── reproducibility-checklist.ts # Reproducibility criteria
```

### 5.2 Evidence Hierarchy (cho Reasoner)

```typescript
// src/knowledge/reasoner/evidence-hierarchy.ts
export const EVIDENCE_HIERARCHY = [
  { level: 1, name: "Systematic Review + Meta-analysis", weight: 1.0 },
  { level: 2, name: "Randomized Controlled Trial (RCT)", weight: 0.95 },
  { level: 3, name: "Prospective Cohort Study", weight: 0.85 },
  { level: 4, name: "Case-Control Study", weight: 0.75 },
  { level: 5, name: "Cross-sectional Study", weight: 0.65 },
  { level: 6, name: "Case Report / Series", weight: 0.50 },
  { level: 7, name: "Expert Opinion", weight: 0.30 },
  { level: 8, name: "Anecdotal / Preprint", weight: 0.15 },
];

// Confidence adjustment: base_confidence * evidence_weight
```

### 5.3 Methodology Taxonomy (cho Reasoner)

```typescript
// src/knowledge/reasoner/methodology-taxonomy.ts
export const METHODOLOGY_TAXONOMY = {
  experimental: [
    "A/B Testing",
    "Randomized Controlled Trial",
    "Factorial Design",
    "Within-subjects",
    "Between-subjects",
  ],
  observational: [
    "Cohort Study",
    "Case-Control",
    "Cross-sectional",
    "Longitudinal",
    "Ecological",
  ],
  computational: [
    "Simulation",
    "Agent-based Modeling",
    "Molecular Dynamics",
    "Finite Element Analysis",
  ],
  qualitative: [
    "Interview",
    "Focus Group",
    "Ethnography",
    "Grounded Theory",
    "Phenomenology",
  ],
  review: [
    "Systematic Review",
    "Meta-analysis",
    "Narrative Review",
    "Scoping Review",
    "Rapid Review",
  ],
};
```

### 5.4 Logical Fallacy Taxonomy (cho Reviewer)

```typescript
// src/knowledge/reviewer/logical-fallacies.ts
export const LOGICAL_FALLACIES = {
  confirmation_bias: {
    description: "Favoring information that confirms prior beliefs",
    detection_patterns: ["cherry-pick", "selective", "ignore contrary"],
  },
  survivorship_bias: {
    description: "Focusing on successful cases while ignoring failures",
    detection_patterns: ["only successful", "survivors", "failed cases ignored"],
  },
  p_hacking: {
    description: "Manipulating data analysis to find significant p-values",
    detection_patterns: ["p-value", "significance", "post-hoc", "data dredging"],
  },
  harking: {
    description: "Hypothesizing after results are known",
    detection_patterns: ["predictive", "retrospective", "post-hoc hypothesis"],
  },
  correlation_causation: {
    description: "Assuming causation from correlation",
    detection_patterns: ["therefore", "causes", "leads to", "results in"],
  },
  base_rate_fallacy: {
    description: "Ignoring base rates in probability estimates",
    detection_patterns: ["unlikely", "probable", "rare", "common"],
  },
};
```

### 5.5 Common Bug Patterns (cho Coder)

```typescript
// src/knowledge/coder/bug-patterns.ts
export const BUG_PATTERNS = {
  security: [
    { pattern: "eval\\s*\\(", severity: "critical", issue: "Code injection via eval" },
    { pattern: "SELECT.*\\+.*FROM", severity: "critical", issue: "SQL injection risk" },
    { pattern: "innerHTML\\s*=", severity: "major", issue: "XSS vulnerability" },
    { pattern: "password\\s*=\\s*[^'\""]*['\"]", severity: "major", issue: "Hardcoded password" },
    { pattern: "crypto\\.md5", severity: "major", issue: "Weak hash algorithm" },
  ],
  performance: [
    { pattern: "for.*for", severity: "minor", issue: "Nested loop — check O(n²)" },
    { pattern: "\\.push.*\\.push.*in loop", severity: "minor", issue: "Array concatenation in loop" },
    { pattern: "await.*await.*in loop", severity: "major", issue: "Sequential awaits in loop" },
  ],
  reliability: [
    { pattern: "catch\\s*\\{\\s*\\}", severity: "critical", issue: "Empty catch block" },
    { pattern: "setTimeout.*without.*clearTimeout", severity: "major", issue: "Memory leak — uncleared timer" },
    { pattern: "addEventListener.*without.*removeEventListener", severity: "major", issue: "Event listener leak" },
  ],
};
```

---

## 6. Điều hệ thống đang tối ưu

### ✅ Đã tối ưu tốt

```
┌─────────────────────────────────────────────────────────────────────┐
│  OPTIMIZATION          │  IMPLEMENTATION                           │
├────────────────────────┼────────────────────────────────────────────┤
│  Knowledge Graph Reuse  │  querySimilarResearch() trước research   │
│  Parallel Execution    │  researcher+analyst+graph đồng thời      │
│  Cascade Search         │  arXiv→Tavily→SemanticScholar→DuckDuckGo │
│  Insight Deduplication  │  similarity() loại bỏ near-duplicates    │
│  SSE Event Streaming    │  Real-time agent activity updates        │
│  Graceful Degradation  │  Fallback khi infra fails                │
│  Multi-Strategy Reason  │  6 strategies defined rõ ràng           │
│  Structured Output     │  JSON everywhere + fallback parsing       │
│  Type Safety           │  Full TypeScript với Zod schemas         │
│  Config-driven Models  │  config.models.* per-agent models        │
└─────────────────────────────────────────────────────────────────────┘
```

### 📊 Optimization Scores

| Component | Score | Notes |
|-----------|-------|-------|
| Orchestrator | 6/10 | Tốt, cần domain-specific decomposition |
| Researcher | 8/10 | Rất tốt, cần quality scoring |
| Reasoner | 9/10 | 🏆 Xuất sắc — best agent |
| Coder | 6/10 | ⚠️ BROKEN — cần fix bug |
| Analyst | 7/10 | Tốt, cần temporal analysis |
| Writer | 8/10 | Rất tốt, cần thêm output modes |
| Reviewer | 9/10 | 🏆 Xuất sắc — best agent |
| **Overall** | **7.7/10** | **Khá tốt, 2 critical bugs cần fix** |

---

## 7. Hạn chế & Improvement Areas

### 7.1 Systemic Issues

| Issue | Agent(s) | Impact | Fix Difficulty |
|-------|----------|--------|---------------|
| `CODE_GENERATION_TEMPLATE` bug | Coder | Runtime crash | Easy |
| `selfReview()` unused | Orchestrator | Dead code | Easy |
| Prompt language inconsistency | All | Quality variance | Medium |
| Keyword-based trend analysis | Reasoner | Weak trends | Medium |
| No retry logic | Orchestrator | Pipeline fails on transient errors | Medium |
| No rate limit handling | Researcher | Provider bans | Medium |

### 7.2 Missing Capabilities

| Capability | Why Needed | Impact |
|-----------|-----------|--------|
| Reproducibility scoring | Validate research quality | HIGH |
| Statistical significance checking | Avoid false positives | HIGH |
| Author/citation network | Find influential work | MEDIUM |
| Cross-session insight comparison | Avoid duplicate insights | MEDIUM |
| Multi-language support | Support non-English topics | MEDIUM |
| Agent self-reflection | Self-correct bad reasoning | HIGH |

### 7.3 Knowledge Gaps

```
Researcher Knowledge Gap:
├── Khi nào dùng arXiv vs Tavily vs Semantic Scholar?
├── Source quality: arXiv preprint vs peer-reviewed journal?
└── Search query templates cho từng domain

Reasoner Knowledge Gap:
├── Evidence hierarchy không được dùng trong confidence calculation
├── Methodology taxonomy không được dùng trong synthesis
└── Cross-domain mappings chỉ là text, không structured

Coder Knowledge Gap:
├── Bug patterns không được dùng trong code review
├── Security patterns không có trong review
└── Testing frameworks không có structured data

Reviewer Knowledge Gap:
├── Logical fallacies không được check tự động
├── Statistical pitfalls không có trong validation
└── Reproducibility checklist không được dùng
```

---

## 8. Kế hoạch Triển khai

### Phase 0: Critical Bug Fixes (Week 0)

- [ ] Fix `CODE_GENERATION_TEMPLATE` → `CODE_GENERATION_PROMPT` in `coder.ts`
- [ ] Integrate or delete `selfReview()` in `orchestrator.ts`
- [ ] Standardize all prompts to Vietnamese (or English)

### Phase 1: Skills Enhancement (Week 1-2)

**Researcher Skills**:
- [ ] Add `scoreSource()` function — quality scoring per source
- [ ] Add `analyzeCitationNetwork()` function — author/citation analysis
- [ ] Add rate limit handling with exponential backoff

**Coder Skills** (after bug fix):
- [ ] Add `generateTests()` — dedicated test generation
- [ ] Add `generateOpenAPISpec()` — API design
- [ ] Integrate bug patterns from knowledge base

**Analyst Skills**:
- [ ] Add `analyzeTemporalData()` — time-series analysis
- [ ] Add `detectAnomalies()` — outlier detection
- [ ] Refactor `analyzeFindings()` để nhận structured Finding[] thay vì text

### Phase 2: Knowledge Bases (Week 3-4)

- [ ] Create `src/knowledge/` directory structure
- [ ] Implement `evidence-hierarchy.ts` (Reasoner)
- [ ] Implement `methodology-taxonomy.ts` (Reasoner)
- [ ] Implement `logical-fallacies.ts` (Reviewer)
- [ ] Implement `bug-patterns.ts` (Coder)
- [ ] Implement `stat-pitfalls.ts` (Analyst)
- [ ] Implement `citation-styles.ts` (Writer)

### Phase 3: Pipeline Optimization (Week 5-6)

- [ ] Domain-specific decomposition prompts (Orchestrator)
- [ ] LLM-based trend analysis (Reasoner — replace keyword matching)
- [ ] Add technical blog + presentation output (Writer)
- [ ] Reproducibility scoring (Reviewer)
- [ ] Agent self-reflection loop (all agents)

### Phase 4: Advanced Features (Week 7+)

- [ ] Cross-session insight comparison
- [ ] Multi-language support
- [ ] Real-time collaboration
- [ ] Scheduled research jobs
- [ ] Custom agent pipelines

---

## Appendix A: File Map

```
src/agents/
├── orchestrator.ts    # Pipeline orchestration, task decomposition
├── researcher.ts       # Web search, source extraction
├── reasoner.ts        # 6 reasoning strategies, deep insights
├── coder.ts           # ⚠️ BROKEN — Code generation
├── analyst.ts         # Statistical analysis, visualizations
├── writer.ts          # Literature review, reports
└── reviewer.ts        # QA, fact-check, citation verification

src/knowledge/         # (TO BE CREATED)
├── researcher/        # Source quality, search templates
├── reasoner/          # Evidence hierarchy, methodology taxonomy
├── coder/             # Bug patterns, best practices
├── analyst/           # Stat pitfalls, visualization types
├── writer/            # Citation styles, document templates
└── reviewer/          # Logical fallacies, reproducibility

src/hub/
├── search.ts          # Cascade search providers
├── graph.ts           # Knowledge graph building
├── queries.ts         # Knowledge Hub operations
├── events.ts          # SSE event emitter
├── redis.ts           # Redis cache + queue
└── db.ts              # PostgreSQL + pgvector
```

---

## Appendix B: LLM Model Recommendations

| Agent | Primary Model | Free Alternative | Local (24GB VRAM) |
|-------|-------------|-----------------|------------------|
| Orchestrator | Claude Opus 4 | llama-3.3-70b | llama3.1:70b |
| Reasoner | Claude Opus 4 | llama-3.3-70b | llama3.1:70b |
| Researcher | Claude Sonnet 4 | llama-3.3-70b | llama3.2:3b |
| Coder | Claude Sonnet 4 | llama-3.3-70b | qwen2.5:32b |
| Analyst | Claude Sonnet 4 | llama-3.3-70b | llama3.2:3b |
| Writer | Claude Opus 4 | llama-3.3-70b | llama3.1:8b |
| Reviewer | Claude Opus 4 | llama-3.3-70b | llama3.1:70b |
