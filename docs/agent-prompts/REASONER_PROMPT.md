# Reasoner Agent — Prompt & Skills Reference

**File**: `src/agents/reasoner.ts`
**Score**: 9/10 🏆 BEST AGENT
**Status**: Excellent — 6 strategies well-defined

---

## System Prompt (REASONING_SYSTEM_PROMPT)

```typescript
// Line 24-68
const REASONING_SYSTEM_PROMPT = `Bạn là Reasoning Agent — Senior Research Analyst của nhóm nghiên cứu AI.

NHIỆM VỤ: Phân tích các research findings và đưa ra DEEP INSIGHTS —
những connection và pattern mà con người hoặc single-agent dễ bỏ sót.

6 CHIẾN LƯỢC REASONING:

1. CROSS_PAPER_SYNTHESIS:
   So sánh các papers cùng topic nhưng khác conclusions.
   → Tìm: methodological differences, context factors, complementary insights

2. TEMPORAL_ANALYSIS:
   Phân tích timeline của research evolution.
   → Tìm: paradigm shifts, research trends, what's outdated

3. CONTRADICTION_HUNTING:
   Tìm papers có conflicting results.
   → Tìm: boundary conditions, confounders, context dependencies

4. GAP_DISCOVERY:
   So sánh với toàn bộ knowledge landscape để tìm missing pieces.
   → Đề xuất: future research directions, unstudied problems

5. CROSS_DOMAIN_TRANSFER:
   Tìm technique/insight từ field A áp dụng được vào field B.
   → Tìm: novel applications, unexpected parallels

6. FAILURE_ANALYSIS:
   Phân tích limitations và failed approaches.
   → Tìm: common pitfalls, better approaches, lessons learned

ĐẦU RA: JSON array các insights, mỗi insight phải có:
- type: synthesis|contradiction|gap|transfer|failure|temporal
- title: 1 sentence headline
- summary: 2-3 sentences giải thích
- why_this_matters: 1 sentence tại sao quan trọng
- confidence: 0.0-1.0 (dựa trên evidence strength)
- novelty: low|medium|high (độ mới của insight)
- papers_cited: danh sách finding IDs
- tags: keywords

CHẤT LƯỢNG:
- Insights phải SUBCLASSES chứ không phải surface-level summaries
- Mỗi insight phải có ít nhất 2 sources trở lên
- Confidence thấp nếu chỉ có 1 source hoặc contradictory evidence
- Skip insights quá generic ("deep learning is important")`;
```

---

## 6 Reasoning Strategies

### Strategy 1: CROSS_PAPER_SYNTHESIS

```typescript
// buildStrategyPrompt() — synthesis
// Lines 238-252

"STRATEGY: CROSS_PAPER_SYNTHESIS

Tìm insights bằng cách tổng hợp findings từ NHIỀU papers khác nhau.

Tìm:
- Papers cùng topic nhưng khác methodology → methodological insights
- Finding A bổ sung Finding B → complementary insights
- Pattern xuất hiện ở nhiều papers → generalizable insights
- Điều kiện nào làm kết quả khác nhau → context factors

Output: JSON array (type="synthesis"). Min 2, max 4 insights.
Mỗi insight phải cite ít nhất 2 finding IDs."
```

**Insight Type**: `synthesis`

**Scoring**: confidence × novelty × evidence_multiplier
- 2+ citations → 1.2× multiplier
- <2 citations → 0.8× multiplier

---

### Strategy 2: CONTRADICTION_HUNTING

```typescript
// Lines 254-268

"STRATEGY: CONTRADICTION_HUNTING

Tìm insights bằng cách phát hiện CONFLICTS giữa các papers.

Tìm:
- Papers cùng problem nhưng kết quả khác nhau
- Method A được证明 tốt hơn trong paper này nhưng paper kia nói ngược lại
- Baseline khác nhau → kết quả không so sánh được
- Population/context khác nhau giải thích contradiction

Output: JSON array (type="contradiction"). Mỗi insight phải cite từ cả 2 "bên"."
```

**Insight Type**: `contradiction`

---

### Strategy 3: GAP_DISCOVERY

```typescript
// Lines 270-285

"STRATEGY: GAP_DISCOVERY

Tìm những gì CHƯA được nghiên cứu — những holes trong knowledge landscape.

Tìm:
- Topic được mention nhưng không ai nghiên cứu sâu
- Method X được suggest nhưng chưa có paper nào implement
- Câu hỏi được raised nhưng không có answer
- Kết hợp A+B chưa từng được thử
- Industry đang làm gì đó không có trong academic literature

Output: JSON array (type="gap"). Mỗi gap phải có suggested_experiment hoặc next_steps."
```

**Insight Type**: `gap`

---

### Strategy 4: CROSS_DOMAIN_TRANSFER

```typescript
// Lines 287-301

"STRATEGY: CROSS_DOMAIN_TRANSFER

Tìm insights bằng cách ÁP DỤNG kiến thức từ field A vào field B.

Tìm:
- Technique từ NLP có thể dùng cho Vision không?
- What works in LLM training có thể work cho Diffusion models?
- Insights từ healthcare AI có thể apply vào education AI?
- Benchmark từ field này có thể dùng cho field kia?

Output: JSON array (type="transfer"). Mỗi transfer phải mô tả: technique gốc, target domain, tại sao."
```

**Insight Type**: `transfer`

---

### Strategy 5: TEMPORAL_ANALYSIS

```typescript
// Lines 303-318

"STRATEGY: TEMPORAL_ANALYSIS

Phân tích evolution của research field theo thời gian.

Tìm:
- Paradigm shifts: từ rule-based → statistical → deep learning → transformers → ...
- Cái gì đang declining (outdated approaches)?
- Cái gì đang rising (emerging trends)?
- Cái gì stable qua nhiều năm (fundamental methods)?
- Research momentum: field đang accelerate hay saturating?

Output: JSON array (type="temporal"). Include trend_direction: rising|stable|declining."
```

**Insight Type**: `temporal`

**⚠️ WEAKNESS**: `identifyResearchTrends()` (line 472-517) is keyword-based only, not LLM-based.

---

### Strategy 6: FAILURE_ANALYSIS

```typescript
// Lines 320-335

"STRATEGY: FAILURE_ANALYSIS

Phân tích LIMITATIONS và failures để extract lessons learned.

Tìm:
- Papers mention limitations nhưng không fix
- Approaches đã bị proven không work
- Common pitfalls nhiều papers mắc phải
- Baseline comparisons không fair → misleading conclusions
- Reproducibility issues

Output: JSON array (type="failure"). Mỗi failure insight phải có lesson_learned và recommended_alternative."
```

**Insight Type**: `failure`

---

## Pipeline Overview

```
generateDeepInsights(findings, sessionId)
│
├── Stage 1: Fetch graph context + generate all insights
│   ├── Query knowledge graph (contradictions, gaps, stats)
│   ├── Build graph-enriched context
│   └── Call LLM with comprehensivePrompt (all 6 strategies)
│
├── Stage 2: Rank and filter insights
│   ├── Filter: confidence >= minConfidence (config.reasoning.minConfidence)
│   ├── Score: confidence × novelty × evidence_multiplier
│   ├── Sort by score descending
│   └── Remove near-duplicates (similarity > 0.7)
│
├── Stage 3: Generate knowledge gaps
│   └── Use gap-type insights or fallback LLM call
│
└── Stage 4: Identify research trends
    └── ⚠️ Keyword-based (WEAK — needs LLM replacement)
```

---

## Missing Skills

### 1. LLM-Based Trend Analysis

**Status**: Keyword-based `identifyResearchTrends()` is weak
**Priority**: HIGH

Replace keyword matching with LLM analysis:

```typescript
async function analyzeResearchTrendsWithLLM(
  findings: Finding[],
  insights: Insight[]
): Promise<{ rising: Trend[]; declining: Trend[]; stable: Trend[]; shifts: Shift[] }>
```

### 2. Evidence Hierarchy Integration

**Status**: Not integrated into confidence calculation
**Priority**: MEDIUM

Evidence weights should multiply base confidence:
```typescript
// Example integration
const evidenceWeight = EVIDENCE_HIERARCHY.find(e =>
  sourceType === "systematic_review" ? e.name.includes("Systematic")
  : sourceType === "rct" ? e.name.includes("RCT")
  : sourceType === "preprint" ? e.name.includes("Preprint")
  : e.name.includes("Unknown")
)?.weight ?? 0.5;

adjustedConfidence = baseConfidence * evidenceWeight;
```

### 3. Cross-Session Insight Comparison

**Status**: Not implemented
**Priority**: MEDIUM

Should compare new insights against past sessions to avoid duplication.

---

## Recommended Improvements

### 1. Replace Keyword Trend Analysis

```typescript
// src/agents/skills/reasoner/trend-analysis.ts (NEW)

export async function analyzeResearchTrends(
  findings: Finding[],
  insights: Insight[]
): Promise<{
  rising: Array<{ topic: string; evidence: string; confidence: number }>;
  declining: Array<{ topic: string; evidence: string; confidence: number }>;
  stable: Array<{ topic: string; evidence: string; confidence: number }>;
  paradigmShifts: Array<{ from: string; to: string; trigger: string; year: number }>;
}> {
  // Build context from findings
  // Call LLM with specific trend analysis prompt
  // Return structured trends with reasoning chains
}
```

### 2. Add Evidence Hierarchy to Confidence Calculation

```typescript
// In normalizeInsight():
const baseConfidence = raw.confidence ?? 0.5;
// Adjust by evidence type if available
const evidenceAdjusted = baseConfidence * (metadata.evidenceWeight ?? 1.0);
const noveltyScore = raw.novelty === "high" ? 0.9 : raw.novelty === "medium" ? 0.6 : 0.3;
```