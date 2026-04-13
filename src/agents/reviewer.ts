/**
 * Reviewer Agent — QA / Senior Reviewer
 *
 * Capabilities:
 * - Technical accuracy verification
 * - Claim verification against sources
 * - Fact-checking
 * - Edge case identification
 * - Feedback generation
 * - Code review
 */

import { claudeChat } from "./lib/claude.ts";
import { config } from "../config.ts";
import type { Finding, Insight, InsightSession } from "../types.ts";

export interface ReviewResult {
  approved: boolean;
  score: number;           // 0-100
  issues: Issue[];
  suggestions: Suggestion[];
  verifiedClaims: Claim[];
  overallFeedback: string;
}

export interface Issue {
  severity: "critical" | "major" | "minor";
  type: "factual" | "logical" | "citation" | "completeness" | "style";
  description: string;
  location?: string;
  recommendation: string;
}

export interface Suggestion {
  type: "improvement" | "clarification" | "extension";
  description: string;
  impact: "high" | "medium" | "low";
}

export interface Claim {
  claim: string;
  verified: boolean;
  evidence?: string;
  confidence: number;
}

const SYSTEM_PROMPT = `Bạn là Senior Reviewer với 15 năm kinh nghiệm trong QA và technical review.
Phát hiện vấn đề một cách chính xác và đưa ra feedback xây dựng.
Không quá khắt khe nhưng cũng không bỏ qua lỗi thật.
Ưu tiên: factual accuracy > logical consistency > completeness > style.`;

export async function reviewInsights(
  insights: InsightSession,
  findings: Finding[],
): Promise<ReviewResult> {
  const findingsMap = new Map(findings.map((f) => [f.id, f]));

  const insightsText = insights.insights
    .map((i, idx) => [
      `Insight ${idx + 1}: ${i.title}`,
      `Type: ${i.type} | Confidence: ${i.confidence}`,
      `Summary: ${i.summary}`,
      `Evidence refs: ${i.evidenceRefs.join(", ") || "none"}`,
    ].join("\n"))
    .join("\n\n");

  const findingsTextForReview = findings
    .map((f) => `• [${f.id}] ${f.title}: ${f.summary ?? f.content.slice(0, 150)}`)
    .join("\n");

  const response = await claudeChat(
    [{
      role: "user",
      content: `Review these research insights for quality, accuracy, and completeness.

Insights to review:
${insightsText}

Source findings:
${findingsTextForReview}

Check each insight for:
1. Is the claim supported by the cited evidence?
2. Is the confidence score reasonable given the evidence?
3. Are there any logical fallacies or overgeneralizations?
4. Is the insight novel or just a restatement of existing findings?
5. Are citations accurate (do the cited finding IDs exist)?

Return a JSON object:
{
  "approved": boolean,
  "score": 0-100,
  "issues": [
    {
      "severity": "critical|major|minor",
      "type": "factual|logical|citation|completeness|style",
      "description": "what's wrong",
      "location": "which insight or section",
      "recommendation": "how to fix"
    }
  ],
  "suggestions": [
    {
      "type": "improvement|clarification|extension",
      "description": "suggestion text",
      "impact": "high|medium|low"
    }
  ],
  "verifiedClaims": [
    {
      "claim": "exact claim text",
      "verified": true|false,
      "evidence": "what source supports or contradicts",
      "confidence": 0.0-1.0
    }
  ],
  "overallFeedback": "summary paragraph of review"
}`,
    }],
    SYSTEM_PROMPT,
    config.models.reviewer,
    4096,
  );

  return parseReviewResponse(response.content);
}

export async function reviewFinding(
  finding: Finding,
  claims?: string[],
): Promise<{ validClaims: Claim[]; issues: Issue[]; overallConfidence: number }> {
  const response = await claudeChat(
    [{
      role: "user",
      content: `Review this research finding for accuracy and identify which claims are well-supported.

Finding:
Title: ${finding.title}
Content: ${finding.content}
Summary: ${finding.summary ?? "N/A"}
Confidence: ${finding.confidence}

Key Findings:
${(finding.keyFindings ?? []).map((k: any) => `- ${k.finding} (evidence: ${k.evidence})`).join("\n")}

${claims ? `\nClaims to verify:\n${claims.map((c) => `- ${c}`).join("\n")}` : ""}

Return a JSON object:
{
  "validClaims": [
    {
      "claim": "claim text",
      "verified": true|false,
      "evidence": "supporting or contradicting evidence",
      "confidence": 0.0-1.0
    }
  ],
  "issues": [
    {
      "severity": "critical|major|minor",
      "type": "factual|logical|citation|completeness",
      "description": "issue description",
      "recommendation": "how to address"
    }
  ],
  "overallConfidence": 0.0-1.0
}`,
    }],
    SYSTEM_PROMPT,
    config.models.reviewer,
    2048,
  );

  try {
    const match = response.content.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      return {
        validClaims: Array.isArray(parsed.validClaims) ? parsed.validClaims : [],
        issues: Array.isArray(parsed.issues) ? parsed.issues : [],
        overallConfidence: typeof parsed.overallConfidence === "number"
          ? parsed.overallConfidence
          : finding.confidence,
      };
    }
  } catch {}

  return {
    validClaims: [],
    issues: [],
    overallConfidence: finding.confidence,
  };
}

export async function reviewCodeQuality(
  code: string,
  language = "python",
): Promise<ReviewResult> {
  const response = await claudeChat(
    [{
      role: "user",
      content: `Review this ${language} code for correctness, security, performance, and maintainability.

\`\`\`${language}
${code}
\`\`\`

Check for:
1. Syntax and logic errors
2. Security vulnerabilities (injection, auth issues, etc.)
3. Performance bottlenecks
4. Error handling
5. Code style and readability
6. Test coverage gaps
7. Documentation quality

Return a JSON object:
{
  "approved": boolean,
  "score": 0-100,
  "issues": [
    {
      "severity": "critical|major|minor",
      "type": "factual|logical|citation|completeness|style",
      "description": "issue description",
      "location": "file:line or section",
      "recommendation": "how to fix"
    }
  ],
  "suggestions": [...],
  "verifiedClaims": [],
  "overallFeedback": "summary"
}`,
    }],
    SYSTEM_PROMPT,
    config.models.reviewer,
    4096,
  );

  return parseReviewResponse(response.content);
}

export async function verifyCitation(
  claim: string,
  finding: Finding,
): Promise<{ supported: boolean; confidence: number; explanation: string }> {
  const response = await claudeChat(
    [{
      role: "user",
      content: `Verify if this claim is supported by the source finding.

Claim to verify: "${claim}"

Source finding:
Title: ${finding.title}
Content: ${finding.content}
Key Findings: ${(finding.keyFindings ?? []).map((k: any) => k.finding).join("; ")}

Return a JSON object:
{
  "supported": true|false,
  "confidence": 0.0-1.0,
  "explanation": "how the source does or does not support this claim"
}`,
    }],
    SYSTEM_PROMPT,
    config.models.reviewer,
    1024,
  );

  try {
    const match = response.content.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      return {
        supported: parsed.supported ?? false,
        confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
        explanation: parsed.explanation ?? "",
      };
    }
  } catch {}

  return { supported: false, confidence: 0.5, explanation: "Parse failed" };
}

function parseReviewResponse(content: string): ReviewResult {
  try {
    const match = content.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      return {
        approved: parsed.approved ?? false,
        score: typeof parsed.score === "number" ? parsed.score : 70,
        issues: Array.isArray(parsed.issues) ? parsed.issues : [],
        suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
        verifiedClaims: Array.isArray(parsed.verifiedClaims) ? parsed.verifiedClaims : [],
        overallFeedback: parsed.overallFeedback ?? "",
      };
    }
  } catch {}

  return {
    approved: false,
    score: 50,
    issues: [],
    suggestions: [],
    verifiedClaims: [],
    overallFeedback: "Review parse failed",
  };
}
