# Orchestrator Agent — Prompt & Skills Reference

**File**: `src/agents/orchestrator.ts`
**Score**: 6/10
**Status**: Functional, có room for improvement

---

## System Prompts

### decomposeTask() — Task Decomposition Prompt

```typescript
// Line 335
"You are a project manager. Break down research topics into clear, actionable subtasks."
```

**Input**: Research topic string
**Output**: JSON array of subtasks
```json
[
  {
    "title": "Subtask name",
    "description": "Specific description",
    "type": "research|analysis|implementation|writing",
    "priority": 1
  }
]
```

**Issues**:
- Không có domain context
- Không có few-shot examples
- Không có fallback when parsing fails

---

## Skills

### 1. Task Decomposition

```typescript
async function decomposeTask(topic: string): Promise<Task[]>
```

**Flow**:
1. Gọi LLM với decomposeTask prompt
2. Parse JSON response
3. Map types sang Agent types
4. Fallback: return single "Research" task

**Improvement needed**:
- Add domain-specific decomposition rules
- Add few-shot examples
- Add confidence scoring per subtask

---

### 2. Parallel Orchestration

```typescript
// Phase 2: researcher + analyst + graph run in parallel
const [analystResult, graphResult] = await Promise.all([
  analyzeFindings(sources),
  buildGraphFromFindings(allFindings, id),
]);

// Phase 3: reasoner + writer run in parallel
const [insights, report] = await Promise.all([
  generateDeepInsights(sources, id),
  writeLiteratureReview(topic, sources),
]);
```

**Parallel groups**:
- Group 1 (sequential): Researcher (critical path)
- Group 2 (parallel): Analyst + Graph Builder
- Group 3 (parallel): Reasoner + Writer
- Group 4 (sequential): Reviewer

---

### 3. Knowledge Hub Reuse

```typescript
// Step 1: Check Knowledge Hub before research
const { findings: reusedFindings, reuseRatio } = await querySimilarResearch(topic, 5);
console.log(`[Orchestrator] Found ${reusedFindings.length} similar past findings`);
```

**Logic**:
- Query Knowledge Hub với topic
- Retrieve top 5 similar past findings
- Merge reused findings vào new findings
- Report reuse ratio

---

## dead Code: selfReview()

```typescript
// Line 371-393
async function selfReview(
  findings: Finding[],
  insights: InsightSession,
): Promise<Insight[]> {
  const verified = insights.insights.filter((insight) => {
    // Filter: skip insights with < 2 evidence refs AND low confidence
    if (insight.evidenceRefs.length < 2 && insight.confidence < 0.8) {
      return false;
    }
    // Filter: skip generic titles
    const genericTerms = ["important", "significant", "useful", "beneficial"];
    const isGeneric = genericTerms.every(
      (term) => !insight.title.toLowerCase().includes(term),
    );
    return isGeneric;
  });

  return verified.map((i) => ({ ...i, verified: true }));
}
```

**Status**: Defined but never called. Should be integrated after `reviewInsights()`.

---

## Recommended Prompts (Improved)

### Improved Task Decomposition Prompt

```typescript
const DECOMPOSE_TASK_PROMPT_V2 = `Bạn là Senior Research Project Manager với 15 năm kinh nghiệm.
Nhiệm vụ: Phân tích research topic và break down thành 3-5 subtasks cụ thể.

TOPIC: {topic}

QUY TẮC:
1. Mỗi subtask phải có: title, description, type, priority (1-3)
2. Type: "research" | "analysis" | "implementation" | "writing"
3. Ưu tiên cao nhất (priority 1) cho subtask core — những cái KHÔNG thể thiếu
4. Mỗi subtask phải có context về TẠI SAO nó cần thiết

VÍ DỤ:

Topic: "RAG optimization techniques"
Output:
[
  {
    "title": "Survey current RAG architectures",
    "description": "Tìm hiểu các RAG architectures hiện tại: naive RAG, advanced RAG, modular RAG. So sánh retrieval vs synthesis.",
    "type": "research",
    "priority": 1,
    "why": "Cần hiểu baseline trước khi đề xuất cải tiến"
  },
  {
    "title": "Identify retrieval bottlenecks",
    "description": "Phân tích chi tiết retrieval stage: embedding quality, chunking strategy, vector DB performance.",
    "type": "analysis",
    "priority": 1,
    "why": "Retrieval là bottleneck phổ biến nhất trong RAG"
  },
  {
    "title": "Benchmark generation strategies",
    "description": "So sánh các generation strategies: context window management, reranking, self-RAG.",
    "type": "analysis",
    "priority": 2,
    "why": "Cần data để so sánh trade-offs"
  }
]

Trả về JSON array.`;
```
