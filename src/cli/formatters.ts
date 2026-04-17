/**
 * Output formatters — JSON, Markdown, HTML, and Terminal text
 */
import chalk from "chalk";
import boxen from "boxen";
import type { Finding, Insight, InsightSession } from "../types.ts";

// ─── Terminal Formatter ────────────────────────────────────────────────────────

export function formatTerminal(
  topic: string,
  findings: Finding[],
  insights: InsightSession,
  opts?: {
    verbose?: boolean;
    showSources?: boolean;
    showFindings?: boolean;
    reviewResult?: { score: number; approved: boolean; issues: unknown[] };
  },
): string {
  const verbose = opts?.verbose ?? false;
  const parts: string[] = [];

  // Header
  parts.push("");
  parts.push(chalk.blue.bold(`🔬 AutoResearch — ${topic}`));
  parts.push(chalk.gray(`Session: ${insights.id} | ${findings.length} sources | ${insights.insights.length} insights`));
  parts.push("");

  // Review result
  if (opts?.reviewResult) {
    const r = opts.reviewResult;
    if (r.approved) {
      parts.push(chalk.green(`✅ Review PASSED (${r.score}/100)`));
    } else {
      parts.push(chalk.yellow(`⚠️  Review scored ${r.score}/100 with ${r.issues.length} issues`));
    }
    parts.push("");
  }

  // Findings summary
  if (opts?.showSources ?? true) {
    parts.push(chalk.cyan.bold("📚 SOURCES"));
    parts.push(chalk.gray("─".repeat(60)));
    for (const f of findings.slice(0, 5)) {
      const source = f.sourceUrl
        ? chalk.blue.underline(f.sourceUrl)
        : chalk.gray("(no URL)");
      parts.push(`  ${chalk.white.bold(f.title)}`);
      parts.push(`  ${source}`);
      parts.push(`  ${chalk.gray("type:")} ${chalk.cyan(f.sourceType)} | ${chalk.gray("confidence:")} ${confidence(f.confidence)}`);
      parts.push("");
    }
    if (findings.length > 5) {
      parts.push(chalk.gray(`  ... and ${findings.length - 5} more sources`));
      parts.push("");
    }
  }

  // Insights
  parts.push(chalk.magenta.bold("💡 INSIGHTS"));
  parts.push(chalk.gray("─".repeat(60)));
  for (let i = 0; i < Math.min(insights.insights.length, 10); i++) {
    const insight = insights.insights[i]!;
    const badge = insightBadge(insight.type);
    parts.push(`  ${badge} ${chalk.white.bold(insight.title)}`);
    parts.push(`     ${chalk.gray("confidence:")} ${confidence(insight.confidence)}`);
    parts.push(`     ${insight.summary.slice(0, 120)}${insight.summary.length > 120 ? "..." : ""}`);
    if (verbose && insight.evidenceRefs.length > 0) {
      parts.push(`     ${chalk.gray("evidence:")} ${insight.evidenceRefs.length} source(s)`);
    }
    parts.push("");
  }

  // Knowledge gaps
  if (insights.knowledgeGaps.length > 0) {
    parts.push(chalk.yellow.bold("🔍 RESEARCH GAPS"));
    parts.push(chalk.gray("─".repeat(60)));
    for (const gap of insights.knowledgeGaps.slice(0, 5)) {
      parts.push(`  • ${gap}`);
    }
    parts.push("");
  }

  // Research trends
  if (insights.researchTrends.rising.length > 0) {
    parts.push(chalk.green.bold("📈 TRENDING"));
    parts.push(chalk.gray("─".repeat(60)));
    parts.push(`  ${chalk.green("↑ rising:")}  ${insights.researchTrends.rising.join(", ")}`);
    parts.push(`  ${chalk.red("↓ declining:")} ${insights.researchTrends.declining.join(", ")}`);
    parts.push(`  ${chalk.gray("→ stable:")}  ${insights.researchTrends.stable.join(", ")}`);
    parts.push("");
  }

  return parts.join("\n");
}

function confidence(pct: number): string {
  if (pct >= 0.85) return chalk.green(`${(pct * 100).toFixed(0)}%`);
  if (pct >= 0.7) return chalk.yellow(`${(pct * 100).toFixed(0)}%`);
  return chalk.red(`${(pct * 100).toFixed(0)}%`);
}

function insightBadge(type: string): string {
  const badges: Record<string, string> = {
    synthesis: chalk.green("[SYN]"),
    contradiction: chalk.red("[CON]"),
    gap: chalk.yellow("[GAP]"),
    transfer: chalk.cyan("[TRN]"),
    failure: chalk.red("[FLR]"),
    temporal: chalk.blue("[TMP]"),
  };
  return badges[type] ?? chalk.gray(`[${type.slice(0, 3).toUpperCase()}]`);
}

// ─── Markdown Formatter ─────────────────────────────────────────────────────────

export function formatMarkdown(
  topic: string,
  findings: Finding[],
  insights: InsightSession,
  opts?: { reviewResult?: { score: number; approved: boolean } },
): string {
  const date = new Date().toISOString().slice(0, 10);
  const lines: string[] = [];

  lines.push(`# 🔬 Research: ${topic}`);
  lines.push("");
  lines.push(`**Date:** ${date}  |  **Session:** \`${insights.id}\`  |  **Sources:** ${findings.length}  |  **Insights:** ${insights.insights.length}`);
  lines.push("");

  if (opts?.reviewResult) {
    const r = opts.reviewResult;
    lines.push(r.approved
      ? `> ✅ **Review passed** — Quality score: ${r.score}/100`
      : `> ⚠️ **Review scored** ${r.score}/100 with issues to address`);
    lines.push("");
  }

  // Sources
  lines.push("## 📚 Sources");
  lines.push("");
  for (const f of findings) {
    const url = f.sourceUrl ? `[${f.title}](${f.sourceUrl})` : `**${f.title}**`;
    lines.push(`- ${url} *(type: ${f.sourceType}, confidence: ${(f.confidence * 100).toFixed(0)}%)*`);
    if (f.summary) lines.push(`  - ${f.summary}`);
  }
  lines.push("");

  // Key Findings
  if (findings.some((f) => (f.keyFindings ?? []).length > 0)) {
    lines.push("## 🔎 Key Findings");
    lines.push("");
    for (const f of findings) {
      if ((f.keyFindings ?? []).length > 0) {
        lines.push(`### ${f.title}`);
        for (const k of f.keyFindings ?? []) {
          lines.push(`- **${k.finding}** — *${k.evidence}* (confidence: ${(k.confidence * 100).toFixed(0)}%)`);
        }
        lines.push("");
      }
    }
  }

  // Insights
  lines.push("## 💡 Deep Insights");
  lines.push("");
  for (const insight of insights.insights) {
    lines.push(`### ${insight.title}`);
    lines.push(`- **Type:** ${insight.type}  |  **Confidence:** ${(insight.confidence * 100).toFixed(0)}%  |  **Novelty:** ${((insight.noveltyScore ?? 0.5) * 100).toFixed(0)}%`);
    lines.push(`- ${insight.summary}`);
    if (insight.description) lines.push(`- **Details:** ${insight.description}`);
    if (insight.evidenceRefs.length > 0) lines.push(`- **Evidence:** ${insight.evidenceRefs.length} source(s) cited`);
    lines.push("");
  }

  // Knowledge gaps
  if (insights.knowledgeGaps.length > 0) {
    lines.push("## 🔍 Research Gaps");
    lines.push("");
    for (const gap of insights.knowledgeGaps) {
      lines.push(`- ${gap}`);
    }
    lines.push("");
  }

  // Trends
  if (insights.researchTrends.rising.length > 0) {
    lines.push("## 📈 Research Trends");
    lines.push("");
    lines.push(`| Status | Topics |`);
    lines.push(`|--------|--------|`);
    lines.push(`| 📈 Rising | ${insights.researchTrends.rising.join(", ")} |`);
    lines.push(`| 📉 Declining | ${insights.researchTrends.declining.join(", ")} |`);
    lines.push(`| → Stable | ${insights.researchTrends.stable.join(", ")} |`);
    lines.push("");
  }

  // Questions
  const allQuestions = findings.flatMap((f) => f.questionsRaised ?? []).filter(Boolean);
  if (allQuestions.length > 0) {
    lines.push("## ❓ Open Questions");
    lines.push("");
    for (const q of [...new Set(allQuestions)].slice(0, 10)) {
      lines.push(`- ${q}`);
    }
    lines.push("");
  }

  lines.push("---");
  lines.push(`*Generated by AutoResearch on ${date}*`);

  return lines.join("\n");
}

// ─── HTML Formatter ─────────────────────────────────────────────────────────────

export function formatHTML(
  topic: string,
  findings: Finding[],
  insights: InsightSession,
  opts?: { reviewResult?: { score: number; approved: boolean } },
): string {
  const date = new Date().toISOString().slice(0, 10);
  const insightsHTML = insights.insights.map((i) => `
    <div class="insight insight-${i.type}">
      <span class="badge badge-${i.type}">${i.type}</span>
      <h3>${escapeHtml(i.title)}</h3>
      <p>${escapeHtml(i.summary)}</p>
      <div class="meta">
        <span>Confidence: ${(i.confidence * 100).toFixed(0)}%</span>
        <span>Novelty: ${((i.noveltyScore ?? 0.5) * 100).toFixed(0)}%</span>
        ${i.evidenceRefs.length > 0 ? `<span>Evidence: ${i.evidenceRefs.length} sources</span>` : ""}
      </div>
    </div>`).join("\n");

  const sourcesHTML = findings.map((f) => `
    <div class="source">
      <h4>${escapeHtml(f.title)}</h4>
      ${f.sourceUrl ? `<a href="${escapeHtml(f.sourceUrl)}">${escapeHtml(f.sourceUrl)}</a>` : ""}
      <p>${escapeHtml(f.summary ?? f.content.slice(0, 200))}</p>
      <div class="meta">
        <span>Type: ${f.sourceType}</span>
        <span>Confidence: ${(f.confidence * 100).toFixed(0)}%</span>
      </div>
    </div>`).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Research: ${escapeHtml(topic)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; max-width: 900px; margin: 0 auto; padding: 2rem; background: #fafafa; color: #1a1a2e; }
  h1 { color: #4f46e5; border-bottom: 2px solid #4f46e5; padding-bottom: .5rem; }
  h2 { color: #1e40af; margin-top: 2rem; }
  h3 { color: #374151; margin-top: 1rem; }
  .header { background: #4f46e5; color: white; padding: 2rem; border-radius: 8px; margin-bottom: 2rem; }
  .header h1 { color: white; border: none; }
  .badge { display: inline-block; padding: .15rem .5rem; border-radius: 4px; font-size: .75rem; font-weight: 700; text-transform: uppercase; }
  .badge-synthesis { background: #d1fae5; color: #065f46; } .badge-contradiction { background: #fee2e2; color: #991b1b; }
  .badge-gap { background: #fef3c7; color: #92400e; } .badge-transfer { background: #e0f2fe; color: #075985; }
  .badge-failure { background: #fee2e2; color: #991b1b; } .badge-temporal { background: #dbeafe; color: #1e40af; }
  .insight, .source { background: white; border-radius: 8px; padding: 1.25rem; margin-bottom: 1rem; box-shadow: 0 1px 3px rgba(0,0,0,.1); }
  .insight h3 { margin-top: .5rem; }
  .meta { font-size: .85rem; color: #6b7280; margin-top: .5rem; }
  .meta span { margin-right: 1rem; }
  .source a { color: #4f46e5; }
  .trends { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem; margin-top: 1rem; }
  .trend-card { background: white; padding: 1rem; border-radius: 8px; text-align: center; }
  .trend-rising { border-left: 4px solid #10b981; }
  .trend-declining { border-left: 4px solid #ef4444; }
  .trend-stable { border-left: 4px solid #9ca3af; }
  .footer { margin-top: 3rem; color: #9ca3af; font-size: .85rem; text-align: center; }
</style>
</head>
<body>
  <div class="header">
    <h1>🔬 ${escapeHtml(topic)}</h1>
    <p>${date} &nbsp;|&nbsp; ${findings.length} sources &nbsp;|&nbsp; ${insights.insights.length} insights &nbsp;|&nbsp; Session: ${insights.id}</p>
  </div>

  ${opts?.reviewResult ? `<div class="review-banner" style="background:${opts.reviewResult.approved ? "#d1fae5" : "#fef3c7"};padding:1rem;border-radius:8px;margin-bottom:1rem">
    <strong>${opts.reviewResult.approved ? "✅ Review PASSED" : "⚠️ Review scored " + opts.reviewResult.score + "/100"}</strong> — Quality score: ${opts.reviewResult.score}/100
  </div>` : ""}

  <h2>📚 Sources</h2>
  ${sourcesHTML}

  <h2>💡 Deep Insights</h2>
  ${insightsHTML}

  ${insights.knowledgeGaps.length > 0 ? `
  <h2>🔍 Research Gaps</h2>
  <ul>${insights.knowledgeGaps.map((g) => `<li>${escapeHtml(g)}</li>`).join("")}</ul>
  ` : ""}

  ${insights.researchTrends.rising.length > 0 ? `
  <h2>📈 Research Trends</h2>
  <div class="trends">
    <div class="trend-card trend-rising"><strong>📈 Rising</strong><p>${insights.researchTrends.rising.join(", ")}</p></div>
    <div class="trend-card trend-declining"><strong>📉 Declining</strong><p>${insights.researchTrends.declining.join(", ")}</p></div>
    <div class="trend-card trend-stable"><strong>→ Stable</strong><p>${insights.researchTrends.stable.join(", ")}</p></div>
  </div>
  ` : ""}

  <div class="footer">Generated by <strong>AutoResearch</strong> on ${date}</div>
</body>
</html>`;
}

// ─── JSON Formatter ─────────────────────────────────────────────────────────────

export function formatJSON(
  findings: Finding[],
  insights: InsightSession,
  extra?: Record<string, unknown>,
): string {
  return JSON.stringify({
    generatedAt: new Date().toISOString(),
    sessionId: insights.id,
    topic: insights.totalFindingsAnalyzed,
    ...extra,
    findings: findings.map((f) => ({
      id: f.id,
      title: f.title,
      url: f.sourceUrl,
      type: f.sourceType,
      summary: f.summary,
      content: f.content,
      confidence: f.confidence,
      verified: f.verified,
      tags: f.tags,
      keyFindings: f.keyFindings,
      questionsRaised: f.questionsRaised,
    })),
    insights: {
      ...insights,
      insights: insights.insights.map((i) => ({
        ...i,
        // Remove heavy fields
      })),
    },
  }, null, 2);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
