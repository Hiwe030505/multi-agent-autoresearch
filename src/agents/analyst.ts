/**
 * Analyst Agent — Data Scientist
 *
 * Capabilities:
 * - Statistical analysis of research data
 * - Chart/visualization generation (as markdown ASCII or JSON specs)
 * - Experiment result analysis
 * - Benchmark comparisons
 * - Data pipeline design
 */

import { claudeChat } from "./lib/claude.ts";
import { config } from "../config.ts";
import type { Finding, Insight } from "../types.ts";

export interface AnalysisResult {
  summary: string;
  statistics: Record<string, number | string>;
  visualizations: VisualizationSpec[];
  comparisons: Comparison[];
  conclusions: string[];
  quality: number;
}

export interface VisualizationSpec {
  type: "bar" | "line" | "pie" | "scatter" | "table" | "heatmap";
  title: string;
  data: Record<string, unknown>;
  description: string;
}

export interface Comparison {
  subjectA: string;
  subjectB: string;
  metric: string;
  valueA: number;
  valueB: number;
  winner: string;
  confidence: number;
}

const ANALYZE_FINDINGS_PROMPT = `Phân tích các research findings sau để tìm patterns, so sánh approaches, và đưa ra conclusions.

Findings:
{findingsText}

{focusText}

Trả về JSON object:
{{
  "summary": "Tóm tắt 2-3 câu về các patterns chính",
  "statistics": {{
    "total_findings": number,
    "avg_confidence": number,
    "papers_count": number,
    "web_sources_count": number
  }},
  "visualizations": [
    {{ "type": "bar|line|pie|table", "title": "Chart title", "data": {{}}, "description": "mô tả" }}
  ],
  "comparisons": [
    {{
      "subjectA": "approach A",
      "subjectB": "approach B",
      "metric": "accuracy|speed|cost|...",
      "valueA": number,
      "valueB": number,
      "winner": "A|B|tie",
      "confidence": 0.0-1.0
    }}
  ],
  "conclusions": ["key takeaway 1", "key takeaway 2"],
  "quality": 0.0-1.0
}}`;

export async function analyzeFindings(
  findings: Finding[],
  focus?: string,
): Promise<AnalysisResult> {
  const findingsText = findings
    .map((f, i) => [
      `Finding ${i + 1}: ${f.title}`,
      `  Confidence: ${f.confidence}`,
      `  Source: ${f.sourceType}`,
      `  Summary: ${f.summary ?? f.content.slice(0, 200)}`,
      f.keyFindings?.length
        ? `  Key Findings: ${(f.keyFindings).map((k: any) => k.finding).join("; ")}`
        : "",
    ].filter(Boolean).join("\n"))
    .join("\n\n");

  const focusText = focus ? `FOCUS: ${focus}` : "";

  const response = await claudeChat(
    [{
      role: "user",
      content: ANALYZE_FINDINGS_PROMPT
        .replace("{findingsText}", findingsText)
        .replace("{focusText}", focusText),
    }],
    "Bạn là Senior Data Scientist. Phân tích dữ liệu cẩn thận, đưa ra data-driven insights. Luôn chỉ ra confidence level và limitations.",
    config.models.analyst,
    4096,
  );

  return parseAnalysisResponse(response.content, findings);
}

export async function compareApproaches(
  approaches: Array<{ name: string; metrics: Record<string, number>; description: string }>,
): Promise<{
  ranking: Array<{ name: string; score: number; reasoning: string }>;
  radarData: Record<string, number[]>;
}> {
  const approachesText = approaches
    .map((a, i) => `${i + 1}. ${a.name}: ${a.description}\n   Metrics: ${JSON.stringify(a.metrics)}`)
    .join("\n\n");

  const response = await claudeChat(
    [{
      role: "user",
      content: `So sánh và rank các approaches sau.

Approaches:
${approachesText}

Trả về JSON object:
{
  "ranking": [
    {"name": "approach name", "score": 0-100, "reasoning": "tại sao approach này được score như vậy"}
  ],
  "radarData": {
    "metric_name": [score1, score2, ...]
  }
}`,
    }],
    "Bạn là Senior Data Scientist. So sánh và rank các approaches dựa trên metrics một cách công bằng.",
    config.models.analyst,
    2048,
  );

  try {
    const match = response.content.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch {}

  return { ranking: [], radarData: {} };
}

export async function generateBenchmarkReport(
  benchmarks: Array<{
    name: string;
    dataset: string;
    metric: string;
    value: number;
    unit: string;
  }>,
): Promise<string> {
  const response = await claudeChat(
    [{
      role: "user",
      content: `Tạo benchmark comparison report bằng markdown với tables và analysis.

Benchmarks:
${benchmarks.map((b) => `- ${b.name} on ${b.dataset}: ${b.value} ${b.unit} (${b.metric})`).join("\n")}`,
    }],
    "Bạn là Senior Data Scientist. Tạo benchmark report rõ ràng, có tables và analysis.",
    config.models.analyst,
    2048,
  );

  return response.content;
}

function parseAnalysisResponse(content: string, findings: Finding[]): AnalysisResult {
  try {
    const match = content.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      return {
        summary: parsed.summary ?? "",
        statistics: parsed.statistics ?? {},
        visualizations: Array.isArray(parsed.visualizations) ? parsed.visualizations : [],
        comparisons: Array.isArray(parsed.comparisons) ? parsed.comparisons : [],
        conclusions: Array.isArray(parsed.conclusions) ? parsed.conclusions : [],
        quality: typeof parsed.quality === "number" ? parsed.quality : 0.7,
      };
    }
  } catch {}

  return {
    summary: "Analysis parse failed",
    statistics: { total_findings: findings.length },
    visualizations: [],
    comparisons: [],
    conclusions: [],
    quality: 0.5,
  };
}
