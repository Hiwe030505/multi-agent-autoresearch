/**
 * Writer Agent — Technical Writer
 *
 * Capabilities:
 * - Literature review writing
 * - Technical report generation
 * - Research paper drafting
 * - API documentation
 * - Presentation outline
 */

import { claudeChat } from "./lib/claude.ts";
import { config } from "../config.ts";
import type { Finding, InsightSession } from "../types.ts";

export interface ReportResult {
  title: string;
  sections: Section[];
  markdown: string;
  wordCount: number;
  quality: number;
}

export interface Section {
  heading: string;
  level: number;
  content: string;
}

const SYSTEM_PROMPT = `Bạn là Senior Technical Writer chuyên viết báo cáo nghiên cứu.
Viết rõ ràng, có cấu trúc, có citations.
Giải thích technical concepts sao cho người đọc không chuyên cũng hiểu được.
Luôn có: abstract, introduction, methodology, findings, discussion, conclusion.`;

export async function writeLiteratureReview(
  topic: string,
  findings: Finding[],
): Promise<ReportResult> {
  const findingsText = findings
    .map((f, i) => {
      const keys = (f.keyFindings ?? [])
        .map((k: any) => `    - ${k.finding} (${k.evidence})`)
        .join("\n");
      return [
        `## Source ${i + 1}: ${f.title}`,
        `**Type:** ${f.sourceType} | **Confidence:** ${f.confidence} | **Source:** ${f.sourceUrl ?? "N/A"}`,
        `**Summary:** ${f.summary ?? f.content.slice(0, 300)}`,
        (f.keyFindings?.length ?? 0) > 0 ? `**Key Findings:**\n${keys}` : "",
        (f.questionsRaised ?? []).length ? `**Questions Raised:** ${(f.questionsRaised ?? []).join(", ")}` : "",
      ].filter(Boolean).join("\n");
    })
    .join("\n\n");

  const response = await claudeChat(
    [{
      role: "user",
      content: `Write a comprehensive literature review on the topic: "${topic}"

Use the following research findings as your sources:

${findingsText}

Write in academic style with proper structure. Include:
1. Abstract (150-200 words)
2. Introduction (context + research question)
3. Methodology Overview (how sources were collected)
4. Key Findings (organized by theme, not by source)
5. Comparative Analysis
6. Discussion (what it means, implications)
7. Conclusion + Future Directions
8. References (list all sources)

Format output as JSON:
{
  "title": "Literature Review: [topic]",
  "sections": [
    {"heading": "Section Name", "level": 1-3, "content": "..."}
  ],
  "markdown": "full report in markdown",
  "wordCount": number,
  "quality": 0.0-1.0
}`,
    }],
    SYSTEM_PROMPT,
    config.models.writer,
    8192,
  );

  return parseReportResponse(response.content);
}

export async function writeDeepInsightsReport(
  topic: string,
  insights: InsightSession,
): Promise<ReportResult> {
  const insightsText = insights.insights
    .map((i, idx) => [
      `### ${idx + 1}. ${i.title} [${i.type.toUpperCase()}]`,
      `**Confidence:** ${i.confidence} | **Novelty:** ${i.noveltyScore ?? "N/A"}`,
      `**Summary:** ${i.summary}`,
      i.description ? `**Details:** ${i.description}` : "",
      i.evidenceRefs.length ? `**Evidence:** ${i.evidenceRefs.length} sources cited` : "",
    ].join("\n"))
    .join("\n\n");

  const gapsText = insights.knowledgeGaps.length
    ? `## Knowledge Gaps\n${insights.knowledgeGaps.map((g) => `- ${g}`).join("\n")}`
    : "";

  const trendsText = [
    `## Research Trends`,
    `**Rising:** ${insights.researchTrends.rising.join(", ") || "N/A"}`,
    `**Stable:** ${insights.researchTrends.stable.join(", ") || "N/A"}`,
    `**Declining:** ${insights.researchTrends.declining.join(", ") || "N/A"}`,
  ].join("\n");

  const response = await claudeChat(
    [{
      role: "user",
      content: `Write a Deep Insights Report for research topic: "${topic}"

This report synthesizes ${insights.totalFindingsAnalyzed} research findings into actionable insights.

## Insights

${insightsText}

${gapsText}

${trendsText}

Write in engaging, accessible style. Structure:
1. Executive Summary
2. Key Insights (each insight gets its own section with explanation)
3. Research Trends
4. Knowledge Gaps & Future Directions
5. Recommendations

Format as JSON:
{
  "title": "Deep Insights Report: [topic]",
  "sections": [...],
  "markdown": "full report in markdown",
  "wordCount": number,
  "quality": 0.0-1.0
}`,
    }],
    SYSTEM_PROMPT,
    config.models.writer,
    8192,
  );

  return parseReportResponse(response.content);
}

export async function writeExecutiveBrief(
  topic: string,
  findings: Finding[],
  insights: InsightSession,
): Promise<{ brief: string; actionableNextSteps: string[] }> {
  const topInsights = insights.insights.slice(0, 5);

  const response = await claudeChat(
    [{
      role: "user",
      content: `Write an executive brief (2-3 pages max) for decision-makers on: "${topic}"

Key Insights (top 5):
${topInsights.map((i, idx) => `${idx + 1}. ${i.title}: ${i.summary}`).join("\n")}

Research Coverage: ${findings.length} sources analyzed

Include:
1. TL;DR (3 bullet points)
2. Key Findings (condensed)
3. Strategic Implications
4. Top 3 Actionable Recommendations
5. Risk Assessment

Format as JSON:
{
  "brief": "full markdown brief",
  "actionableNextSteps": ["step 1", "step 2", "step 3"]
}`,
    }],
    SYSTEM_PROMPT,
    config.models.writer,
    4096,
  );

  try {
    const match = response.content.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      return {
        brief: parsed.brief ?? response.content,
        actionableNextSteps: Array.isArray(parsed.actionableNextSteps)
          ? parsed.actionableNextSteps
          : [],
      };
    }
  } catch {}

  return { brief: response.content, actionableNextSteps: [] };
}

function parseReportResponse(content: string): ReportResult {
  try {
    const match = content.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      return {
        title: parsed.title ?? "Report",
        sections: Array.isArray(parsed.sections) ? parsed.sections : [],
        markdown: parsed.markdown ?? content,
        wordCount: typeof parsed.wordCount === "number" ? parsed.wordCount : content.split(/\s+/).length,
        quality: typeof parsed.quality === "number" ? parsed.quality : 0.7,
      };
    }
  } catch {}

  return {
    title: "Report",
    sections: [],
    markdown: content,
    wordCount: content.split(/\s+/).length,
    quality: 0.5,
  };
}
