/**
 * Reasoning Agent — Deep Insights Engine
 *
 * Like NotebookLM "Deep Insights" feature, but with multi-agent orchestration.
 * Takes a set of research findings and extracts high-quality insights using
 * 6 reasoning strategies:
 *
 * 1. CROSS_PAPER_SYNTHESIS  — combine findings from multiple papers
 * 2. TEMPORAL_ANALYSIS      — research trends over time
 * 3. CONTRADICTION_HUNTING  — find conflicting results
 * 4. GAP_DISCOVERY          — find what hasn't been studied
 * 5. CROSS_DOMAIN_TRANSFER  — apply insights from field A to field B
 * 6. FAILURE_ANALYSIS       — learn from failed experiments
 */

import { v4 as uuidv4 } from "uuid";
import { claudeChat } from "./lib/claude.ts";
import { config } from "../config.ts";
import { graphQuery } from "../hub/graph.ts";
import { emitThinking, emitInsight } from "../hub/events.ts";
import { parseJson, parseJsonArray, normalizeFields } from "../utils/json.ts";
import type { Finding, Insight, InsightSession, InsightType } from "../types.ts";

const REASONING_SYSTEM_PROMPT = `Bạn là Reasoning Agent — Senior Research Analyst của nhóm nghiên cứu AI.

NHIỆM VỤ: Phân tích các research findings và đưa ra DEEP INSIGHTS — những connection và pattern mà con người hoặc single-agent dễ bỏ sót.

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
- Skip insights quá generic ("deep learning is important")
`;

export async function generateDeepInsights(
  findings: Finding[],
  sessionId: string,
): Promise<InsightSession> {
  if (findings.length === 0) {
    return {
      id: sessionId,
      totalFindingsAnalyzed: 0,
      insights: [],
      knowledgeGaps: [],
      researchTrends: { rising: [], declining: [], stable: [] },
      generatedAt: new Date().toISOString(),
    };
  }

  // Build research context
  const context = findings.map((f, i) => {
    const keys = (f.keyFindings ?? []).map((k: any) =>
      `  - ${k.finding} (confidence: ${k.confidence}, evidence: ${k.evidence})`
    ).join("\n");
    return [
      `FINDING #${i + 1} [ID: ${f.id}]`,
      `Title: ${f.title}`,
      `Source: ${f.sourceUrl ?? "unknown"} (${f.sourceType})`,
      `Summary: ${f.summary ?? f.content.slice(0, 200)}`,
      `Key Findings:\n${keys || "  (none)"}`,
      `Questions Raised: ${(f.questionsRaised ?? []).join(", ") || "none"}`,
      `Confidence: ${f.confidence}`,
    ].join("\n");
  }).join("\n\n");

  // ─── Stage 1: Fetch graph context + generate all insights ────────────────

  const allInsights: Insight[] = [];

  // Fetch existing graph context to enrich reasoning
  let graphContext = "";
  try {
    const [contradictions, gaps, stats] = await Promise.all([
      graphQuery.contradictions(),
      graphQuery.potentialGaps(),
      graphQuery.stats(),
    ]);
    if (stats.totalNodes > 0) {
      const gapsList = gaps.slice(0, 10).map((g) => `  - ${g.name}: ${g.summary || "unstudied area"}`).join("\n");
      const contradictionsList = contradictions.slice(0, 5).map((c) => `  - "${c.source.name}" contradicts "${c.target.name}": ${c.edge.description ?? "conflicting claims"}`).join("\n");
      graphContext = `
=== EXISTING KNOWLEDGE GRAPH CONTEXT ===
This research builds on a graph with ${stats.totalNodes} nodes and ${stats.totalEdges} edges.

KNOWN RESEARCH GAPS (potential new findings):
${gapsList || "  (none identified yet)"}

KNOWN CONTRADICTIONS in prior research:
${contradictionsList || "  (none identified yet)"}

Use this context to:
- Build ON TOP of existing findings (avoid rediscovering known things)
- RESOLVE contradictions by finding evidence that favors one side
- FILL GAPS by connecting new findings to unstudied areas
`;
    }
  } catch (e) {
    console.warn("[Reasoner] Graph context unavailable:", (e as Error).message);
  }

  // Single comprehensive prompt with all 6 strategies
  const comprehensivePrompt = `Analyze these research findings and generate deep insights using ALL 6 reasoning strategies.${graphContext}

When generating insights, follow this reasoning chain for each strategy:

1. SYNTHESIS — Combine findings from multiple papers. Find complementary insights, methodological differences, and generalizable patterns. Cite at least 2 finding IDs per insight.
   Reasoning chain: "I found that [finding A] says X but [finding B] says Y. These complement each other because [reason]. The combined insight is [conclusion]."

2. CONTRADICTION — Find conflicting results between papers. Explain why they disagree and what context determines which is correct.
   Reasoning chain: "Paper [A] claims [X] while Paper [B] claims [Y]. The conflict arises because [different conditions]. The resolution is [context-dependent conclusion]."

3. GAP — Identify what hasn't been studied yet. Look for methods suggested but not implemented, questions raised but unanswered, or combinations of A+B never tried.
   Reasoning chain: "Multiple papers suggest [X] but none implement it. The gap exists because [barrier]. Suggested experiment: [specific next step]."

4. CROSS-DOMAIN TRANSFER — Find techniques from one field that could apply to another. Look for unexpected parallels.
   Reasoning chain: "[Technique] works in [Field A] for [reason]. This could transfer to [Field B] because [parallel structure]."

5. TEMPORAL — Analyze research evolution over time. Identify paradigm shifts, rising trends, declining approaches, and stable fundamentals.
   Reasoning chain: "[Approach] dominated from [year] to [year]. The shift to [new approach] was driven by [trigger]. Current trend: [direction]."

6. FAILURE — Learn from limitations and failed approaches. Identify common pitfalls and suggest better alternatives.
   Reasoning chain: "Many papers fail at [problem] because [common pitfall]. A better approach is [alternative]."

Research findings (${findings.length} sources):
${context}

Generate insights for EACH of these 6 strategies:

1. SYNTHESIS — Combine findings from multiple papers. Find complementary insights, methodological differences, and generalizable patterns. Cite at least 2 finding IDs per insight.

2. CONTRADICTION — Find conflicting results between papers. Explain why they disagree and what context determines which is correct.

3. GAP — Identify what hasn't been studied yet. Look for methods suggested but not implemented, questions raised but unanswered, or combinations of A+B never tried.

4. CROSS-DOMAIN TRANSFER — Find techniques from one field that could apply to another. Look for unexpected parallels.

5. TEMPORAL — Analyze research evolution over time. Identify paradigm shifts, rising trends, declining approaches, and stable fundamentals.

6. FAILURE — Learn from limitations and failed approaches. Identify common pitfalls and suggest better alternatives.

Return a JSON array with ALL insights. Format:
[
  {
    "type": "synthesis|contradiction|gap|transfer|temporal|failure",
    "title": "Short headline",
    "summary": "2-3 sentence explanation",
    "description": "Additional detail",
    "confidence": 0.0-1.0,
    "novelty": "low|medium|high",
    "papers_cited": ["finding_id_1", "finding_id_2"],
    "tags": ["keyword1", "keyword2"],
    "why_this_matters": "1 sentence on importance"
  }
]

Generate at least 6 insights (one per strategy). Skip a strategy only if genuinely nothing can be found for it.`;

  try {
    const response = await claudeChat(
      [{ role: "user", content: comprehensivePrompt }],
      "You are a Senior Research Analyst. Generate deep, novel insights from research findings. Be specific and cite evidence. Output valid JSON only.",
      config.models.reasoning,
      4096,
    );

    const parsed = parseInsightsResponse(response.content, sessionId, "synthesis");
    allInsights.push(...parsed);
  } catch (e) {
    console.error("Deep insights generation failed:", e);
  }

  // ─── Stage 2: Deduplicate and rank ────────────────────────────────────────

  const ranked = rankAndFilterInsights(allInsights, findings);

  // ─── Stage 3: Generate knowledge gaps ──────────────────────────────────────

  const gaps = await generateKnowledgeGaps(findings, ranked);

  // ─── Stage 4: Identify research trends ──────────────────────────────────────

  const trends = identifyResearchTrends(findings, ranked);

  return {
    id: sessionId,
    totalFindingsAnalyzed: findings.length,
    insights: ranked.slice(0, config.reasoning.maxInsightsPerSession),
    knowledgeGaps: gaps,
    researchTrends: trends,
    generatedAt: new Date().toISOString(),
  };
}

// ─── Strategy Prompts ─────────────────────────────────────────────────────────

function buildStrategyPrompt(
  strategy: InsightType,
  context: string,
  n: number,
): string {
  const prompts: Record<InsightType, string> = {
    synthesis: `STRATEGY: CROSS_PAPER_SYNTHESIS

Tìm insights bằng cách tổng hợp findings từ NHIỀU papers khác nhau.

Tìm:
- Papers cùng topic nhưng khác methodology → methodological insights
- Finding A bổ sung Finding B → complementary insights
- Pattern xuất hiện ở nhiều papers → generalizable insights
- Điều kiện nào làm kết quả khác nhau → context factors

Phân tích ${n} findings sau:

${context}

TRẢ VỀ JSON array các insights (type="synthesis"). Tối thiểu 2, tối đa 4 insights. Mỗi insight phải cite ít nhất 2 finding IDs.`,

    contradiction: `STRATEGY: CONTRADICTION_HUNTING

Tìm insights bằng cách phát hiện CONFLICTS giữa các papers.

Tìm:
- Papers cùng problem nhưng kết quả khác nhau
- Method A được证明 tốt hơn trong paper này nhưng paper kia nói ngược lại
- Baseline khác nhau → kết quả không so sánh được
- Population/context khác nhau giải thích contradiction

Phân tích ${n} findings sau:

${context}

TRẢ VỀ JSON array các insights (type="contradiction"). Mô tả rõ CONFLICT và GIẢI THÍCH. Mỗi insight phải cite findings từ cả 2 "bên" của contradiction.`,

    gap: `STRATEGY: GAP_DISCOVERY

Tìm những gì CHƯA được nghiên cứu — những holes trong knowledge landscape.

Tìm:
- Topic được mention nhưng không ai nghiên cứu sâu
- Method X được suggest nhưng chưa có paper nào implement
- Câu hỏi được raised nhưng không có answer
- Kết hợp A+B chưa từng được thử (với A và B đều đã được research riêng)
- Industry đang làm gì đó không có trong academic literature

Phân tích ${n} findings sau:

${context}

TRẢ VỀ JSON array các insights (type="gap"). Mỗi gap phải có suggested_experiment hoặc next_steps cụ thể.`,

    transfer: `STRATEGY: CROSS_DOMAIN_TRANSFER

Tìm insights bằng cách ÁP DỤNG kiến thức từ field A vào field B.

Tìm:
- Technique từ NLP có thể dùng cho Vision không?
- What works in LLM training có thể work cho Diffusion models?
- Insights từ healthcare AI có thể apply vào education AI?
- Benchmark từ field này có thể dùng cho field kia?

Phân tích ${n} findings sau:

${context}

TRẢ VỀ JSON array các insights (type="transfer"). Mỗi transfer phải mô tả rõ: technique gốc, target domain, tại sao có thể apply.`,

    temporal: `STRATEGY: TEMPORAL_ANALYSIS

Phân tích evolution của research field theo thời gian.

Tìm:
- Paradigm shifts: từ rule-based → statistical → deep learning → transformers → ...
- Cái gì đang declining (outdated approaches)?
- Cái gì đang rising (emerging trends)?
- Cái gì stable qua nhiều năm (fundamental methods)?
- Research momentum: field đang accelerate hay saturating?

Phân tích ${n} findings sau:

${context}

TRẢ VỀ JSON array các insights (type="temporal"). Include trend_direction: "rising|stable|declining".`,

    failure: `STRATEGY: FAILURE_ANALYSIS

Phân tích LIMITATIONS và failures để extract lessons learned.

Tìm:
- Papers mention limitations nhưng không fix
- Approaches đã bị proven không work
- Common pitfalls nhiều papers mắc phải
- Baseline comparisons không fair → misleading conclusions
- Reproducibility issues

Phân tích ${n} findings sau:

${context}

TRẢ VỀ JSON array các insights (type="failure"). Mỗi failure insight phải có lesson_learned và recommended_alternative cụ thể.`,
  };

  return prompts[strategy];
}

// ─── Parse Response ──────────────────────────────────────────────────────────

function parseInsightsResponse(
  content: string,
  sessionId: string,
  defaultType: InsightType,
): Insight[] {
  // Try robust JSON array parsing
  const result = parseJsonArray<Record<string, unknown>>(content);

  if (result.data && result.data.length > 0) {
    return result.data
      .map((item) => normalizeFields(item))
      .map((item) => normalizeInsight(item, sessionId, (item.type as string) ?? defaultType));
  }

  // Fallback: try top-level object with "insights" field
  const objResult = parseJson<{ insights?: Record<string, unknown>[] }>(content);
  if (objResult.data?.insights && Array.isArray(objResult.data.insights)) {
    return objResult.data.insights
      .map((item) => normalizeFields(item))
      .map((item) => normalizeInsight(item, sessionId, (item.type as string) ?? defaultType));
  }

  return [];
}

function normalizeInsight(raw: any, sessionId: string, type: string): Insight {
  const confidence = typeof raw.confidence === "number"
    ? Math.max(0, Math.min(1, raw.confidence))
    : 0.5;

  const noveltyScore = raw.novelty === "high" ? 0.9 : raw.novelty === "medium" ? 0.6 : 0.3;

  return {
    id: raw.id ?? uuidv4(),
    sessionId,
    type: (type ?? "synthesis") as InsightType,
    title: raw.title ?? raw.Title ?? "Untitled insight",
    summary: raw.summary ?? raw.description ?? "",
    description: raw.description ?? raw.summary ?? "",
    confidence,
    noveltyScore,
    actionable: raw.actionable ?? true,
    evidenceRefs: Array.isArray(raw.papers_cited) ? raw.papers_cited
      : Array.isArray(raw.evidence_refs) ? raw.evidence_refs
        : [],
    createdAt: new Date().toISOString(),
    verified: false,
    tags: Array.isArray(raw.tags) ? raw.tags : [],
  };
}

// ─── Rank & Filter ────────────────────────────────────────────────────────────

function rankAndFilterInsights(
  insights: Insight[],
  findings: Finding[],
): Insight[] {
  // Filter by minimum confidence
  const filtered = insights.filter((i) => i.confidence >= config.reasoning.minConfidence);

  // Score = confidence * novelty * (1 - duplicate_penalty)
  const scored = filtered.map((i) => ({
    ...i,
    _score: i.confidence * (i.noveltyScore ?? 0.5) * (i.evidenceRefs.length >= 2 ? 1.2 : 0.8),
  }));

  // Sort by score descending
  scored.sort((a, b) => b._score - a._score);

  // Remove near-duplicates (similar titles)
  const unique: typeof scored = [];
  for (const s of scored) {
    const tooSimilar = unique.some(
      (u) => similarity(s.title, u.title) > 0.7,
    );
    if (!tooSimilar) unique.push(s);
  }

  return unique;
}

function similarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/));
  const wordsB = new Set(b.toLowerCase().split(/\s+/));
  const intersection = [...wordsA].filter((w) => wordsB.has(w)).length;
  const union = new Set([...wordsA, ...wordsB]).size;
  return union === 0 ? 0 : intersection / union;
}

// ─── Knowledge Gaps ───────────────────────────────────────────────────────────

async function generateKnowledgeGaps(
  findings: Finding[],
  insights: Insight[],
): Promise<string[]> {
  const gapInsights = insights.filter((i) => i.type === "gap");
  if (gapInsights.length >= 3) {
    return gapInsights.map((g) => g.summary).slice(0, 5);
  }

  // Fallback: generate additional gaps
  try {
    const response = await claudeChat(
      [{
        role: "user",
        content: `Based on these ${findings.length} research findings, identify 5 major knowledge gaps that need future research.

Findings:
${findings.slice(0, 20).map((f, i) => `${i + 1}. ${f.title}: ${f.summary ?? f.content.slice(0, 150)}`).join("\n")}

Return a JSON array of gap descriptions (strings). Each should be a 1-sentence specific research gap.`,
      }],
      "Identify specific, actionable knowledge gaps in this research area. Be concrete and avoid generic statements.",
      config.models.reasoning,
      1024,
    );

    const match = response.content.match(/\[[\s\S]*?\]/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed)) return parsed.slice(0, 5).map(String);
    }
  } catch {}

  return gapInsights.map((g) => g.summary).slice(0, 5);
}

// ─── Research Trends ───────────────────────────────────────────────────────────

function identifyResearchTrends(
  findings: Finding[],
  insights: Insight[],
): { rising: string[]; declining: string[]; stable: string[] } {
  const rising: Set<string> = new Set();
  const declining: Set<string> = new Set();
  const stable: Set<string> = new Set();

  const trendKeywords = {
    rising: ["emerging", "new", "recent", "2024", "2025", "2026", "breakthrough", "state-of-the-art", "sota"],
    declining: ["outdated", "deprecated", "legacy", "traditional", "classical", "obsolete"],
    stable: ["fundamental", "established", "core", "standard", "proven"],
  };

  for (const f of findings) {
    const text = `${f.title} ${f.summary ?? ""}`.toLowerCase();
    for (const kw of trendKeywords.rising) {
      if (text.includes(kw)) rising.add(kw);
    }
    for (const kw of trendKeywords.declining) {
      if (text.includes(kw)) declining.add(kw);
    }
    for (const kw of trendKeywords.stable) {
      if (text.includes(kw)) stable.add(kw);
    }
  }

  // Add from insights
  for (const i of insights) {
    if (i.tags) {
      for (const t of i.tags) {
        if (i.type === "temporal" && i.description) {
          if (i.description.includes("rising")) rising.add(t);
          if (i.description.includes("declining")) declining.add(t);
          if (i.description.includes("stable")) stable.add(t);
        }
      }
    }
  }

  return {
    rising: [...rising].slice(0, 10),
    declining: [...declining].slice(0, 10),
    stable: [...stable].slice(0, 10),
  };
}
