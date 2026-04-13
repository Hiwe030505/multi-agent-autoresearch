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

const SYSTEM_PROMPT = `Bạn là Senior Data Scientist với 15 năm kinh nghiệm.
Phân tích dữ liệu cẩn thận, đưa ra insights có data-driven.
Trực quan hóa bằng các chart/table rõ ràng.
Luôn chỉ ra confidence level và limitations.`;

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

  const response = await claudeChat(
    [{
      role: "user",
      content: `Analyze these research findings${focus ? ` with focus on: ${focus}` : ""}.

Findings:
${findingsText}

Return a JSON object:
{
  "summary": "2-3 sentence overview of key patterns across findings",
  "statistics": {
    "total_findings": number,
    "avg_confidence": number,
    "papers_count": number,
    "web_sources_count": number
  },
  "visualizations": [
    {
      "type": "bar|line|pie|table",
      "title": "Chart title",
      "data": {},
      "description": "what this visualization shows"
    }
  ],
  "comparisons": [
    {
      "subjectA": "approach A",
      "subjectB": "approach B",
      "metric": "accuracy|speed|cost|...",
      "valueA": number,
      "valueB": number,
      "winner": "A|B|tie",
      "confidence": 0.0-1.0
    }
  ],
  "conclusions": ["key takeaway 1", "key takeaway 2"],
  "quality": 0.0-1.0
}`,
    }],
    SYSTEM_PROMPT,
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
      content: `Compare these approaches and rank them.

Approaches:
${approachesText}

Return a JSON object:
{
  "ranking": [
    {"name": "approach name", "score": 0-100, "reasoning": "why this approach scored this way"}
  ],
  "radarData": {
    "metric_name": [score1, score2, ...]  // normalized 0-100 for radar chart
  }
}`,
    }],
    SYSTEM_PROMPT,
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
      content: `Generate a markdown benchmark comparison report.

Benchmarks:
${benchmarks.map((b) => `- ${b.name} on ${b.dataset}: ${b.value} ${b.unit} (${b.metric})`).join("\n")}

Generate a well-formatted markdown report with tables and analysis.`,
    }],
    SYSTEM_PROMPT,
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
