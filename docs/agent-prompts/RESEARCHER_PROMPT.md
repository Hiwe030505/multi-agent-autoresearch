# Researcher Agent — Prompt & Skills Reference

**File**: `src/agents/researcher.ts`
**Score**: 8/10
**Status**: Functional, cascade search rất tốt

---

## System Prompts

### PAPER_SUMMARY_PROMPT (Line 8-25) ⚠️ INCONSISTENT LANGUAGE

```typescript
const PAPER_SUMMARY_PROMPT = `You are summarizing research sources for a research team.

Title: {title}
Source URL: {url}
Content/snippets: {content}

Extract and summarize in JSON format:
{
  "title": "cleaned title",
  "key_findings": [
    { "finding": "specific finding", "evidence": "specific evidence from source", "confidence": 0.0-1.0 }
  ],
  "summary": "2-3 sentence summary of the main contribution",
  "questions_raised": ["question raised by this source"],
  "source_type": "paper|web"
}

Focus on specific, verifiable claims. Do not invent details not present in the content.`;
```

⚠️ **Issue**: Prompt này là **English**, trong khi tất cả agents khác dùng **Vietnamese**. Cần thống nhất.

### System Prompt for Summarization (Line 100)

```typescript
"You are a precise research analyst. Extract factual information only. Do not invent or hallucinate details."
```

---

## Skills

### 1. Cascade Web Search

**Provider Order** (từ `src/hub/search.ts`):
```
1. arXiv          → Academic papers (free, no key needed)
2. Tavily         → Web search (needs TAVILY_API_KEY)
3. Semantic Scholar → Academic search (free tier available)
4. DuckDuckGo     → Fallback web search (free, no key needed)
```

**Code**:
```typescript
const searchQueries = buildSearchQueries(topic, keywords);
const searchResults = await Promise.all(
  searchQueries.map((q) => webSearch(q, { maxResults: 5 })),
);
```

**Search Query Generation**:
```typescript
function buildSearchQueries(topic: string, keywords: string[]): string[] {
  const queries: string[] = [topic];

  if (keywords.length > 0) {
    queries.push(...keywords.slice(0, 3).map((k) => `${topic} ${k}`));
  }

  queries.push(`${topic} research paper survey`);
  queries.push(`${topic} state of the art 2025 2026`);

  return [...new Set(queries)].slice(0, 5);
}
```

---

### 2. Source Summarization

```typescript
async function summarizeSource(
  src: { title: string; url: string; snippet: string; source: string },
  topic: string,
  keywords: string[],
): Promise<Finding | null>
```

**Flow**:
1. Replace placeholders in PAPER_SUMMARY_PROMPT
2. Call LLM with extracted content
3. Parse JSON response
4. Filter: skip if no key findings AND no snippet
5. Return structured Finding

**Finding Structure**:
```typescript
{
  id: uuidv4(),
  topic,
  sourceUrl: src.url || undefined,
  sourceType: "paper" | "web" | "internal",
  title: parsed.title ?? src.title,
  content: keyFindings.map(...).join("\n"),
  summary: parsed.summary ?? src.snippet.slice(0, 300),
  confidence: 0.7,
  createdBy: "researcher",
  createdAt: new Date().toISOString(),
  verified: false,
  tags: keywords,
  keyFindings: [...],
  questionsRaised: [...],
  connections: [],
  metadata: { searchProvider, searchSnippet, authors, year }
}
```

---

### 3. Fallback Research (No Web Access)

```typescript
async function fallbackResearch(topic: string, kw: string): Promise<ResearchResult>
```

**Trigger**: Khi `allSearchResults.length === 0`

**Prompt**:
```typescript
`Provide a structured analysis of the research topic: "${topic}"

For each point, clearly distinguish between:
- KNOWN FACTS: things well-established in the research community
- INFERRED PATTERNS: reasonable extrapolations based on your knowledge
- SPECULATIVE: hypotheses that need verification

Format as JSON: {...}`
```

**Output**: Single "internal" Finding với `_fallback: true` flag.

---

## Missing Skills

### 1. Source Quality Scoring

**Status**: Not implemented
**Priority**: HIGH

Should score each source 0-10 before processing:
- Citation count
- Venue reputation (journal > conference > arXiv > web)
- Recency
- Methodology rigor

### 2. Author/Citation Network Analysis

**Status**: Not implemented
**Priority**: MEDIUM

Should extract:
- Author names
- Citation relationships
- Research communities
- h-index estimates

---

## Recommended Prompts (Improved)

### Improved Paper Summary Prompt (Vietnamese)

```typescript
const PAPER_SUMMARY_PROMPT_V2 = `Bạn là Research Analyst chuyên nghiệp — chuyên trích xuất thông tin từ các research papers và web sources.

NHIỆM VỤ: Trích xuất thông tin cụ thể, có thể kiểm chứng từ source.

TITLE: {title}
SOURCE URL: {url}
CONTENT/SNIPPETS:
{content}

QUY TẮC TRÍCH XUẤT:
1. CHỈ trích xuất thông tin CÓ TRONG source — không bịa đặt
2. Mỗi key_finding phải có: finding + evidence cụ thể + confidence score
3. Confidence: 0.0-1.0 (0.9 = rất chắc chắn, 0.5 = có thể đúng, 0.2 = highly speculative)
4. Đặt câu hỏi (questions_raised) mà source KHÔNG trả lời được

OUTPUT JSON:
{
  "title": "Tiêu đề đã clean",
  "key_findings": [
    {
      "finding": "Mô tả cụ thể về phát hiện",
      "evidence": "Trích dẫn chính xác từ source (quote hoặc paraphrase)",
      "confidence": 0.0-1.0
    }
  ],
  "summary": "Tóm tắt 2-3 câu về contribution chính",
  "questions_raised": [
    "Câu hỏi mà source không trả lời được",
    "Limitations mà source đề cập"
  ],
  "source_type": "paper|web",
  "methodology": "experimental|observational|review|theoretical"  // ← THÊM MỚI
}

CÁC TRƯỜNG HỢP TỪ CHỐI:
- Không có snippet: Skip source
- Chỉ có title không có content: Skip source
- Content quá ngắn (<50 chars): Yêu cầu bổ sung`;
```

---

### Skill: Source Quality Scoring

```typescript
async function scoreSource(source: SearchResult): Promise<{
  score: number;        // 0-10
  breakdown: {
    citations: number;   // 0-3
    venue: number;      // 0-3
    recency: number;    // 0-2
    methodology: number; // 0-2
  };
  recommendation: "include" | "prefer" | "skip";
}> {
  let total = 0;

  // Citations (0-3)
  if (source.citations > 500) total += 3;
  else if (source.citations > 100) total += 2;
  else if (source.citations > 10) total += 1;

  // Venue (0-3)
  if (source.url?.includes("nature.com") || source.url?.includes("science.")) total += 3;
  else if (source.url?.includes("arxiv.org")) total += 2;
  else if (source.url?.includes("github.com")) total += 1;
  else total += 0;

  // Recency (0-2)
  const year = source.year ?? new Date().getFullYear();
  if (year >= 2024) total += 2;
  else if (year >= 2022) total += 1;

  // Methodology indicators (0-2)
  const content = source.snippet?.toLowerCase() ?? "";
  const methods = ["randomized", "controlled trial", "ablation", "benchmark", "dataset"];
  const found = methods.filter(m => content.includes(m)).length;
  total += Math.min(found, 2);

  return {
    score: total,
    recommendation: total >= 6 ? "include" : total >= 4 ? "prefer" : "skip",
  };
}
```
