/**
 * CLI Runner — Run all agents standalone (for testing)
 *
 * Usage: npx tsx src/agents/run-all.ts --topic "RAG optimization" --keywords rag,retrieval
 */

import { parseArgs } from "util";
import { runResearchPipeline } from "./orchestrator.ts";
import { generateCode } from "./coder.ts";
import { analyzeFindings } from "./analyst.ts";
import { writeLiteratureReview } from "./writer.ts";
import { initSchema } from "../hub/db.ts";

async function main() {
  const { values } = parseArgs({
    options: {
      topic: { type: "string", short: "t" },
      keywords: { type: "string", short: "k" },
      help: { type: "boolean", short: "h", default: false },
      full: { type: "boolean", default: false },  // run full pipeline with all agents
    },
  });

  if (values.help) {
    console.log(`
AutoResearch CLI

Usage:
  npx tsx src/agents/run-all.ts --topic "RAG optimization"
  npx tsx src/agents/run-all.ts --topic "LLM fine-tuning" --keywords "rag,llm"
  npx tsx src/agents/run-all.ts --topic "..." --full   # run all agents

Options:
  --topic, -t     Research topic (required)
  --keywords, -k Comma-separated keywords
  --full          Run full pipeline with code generation + analysis + writing
  --help, -h      Show this help
    `);
    return;
  }

  const topic = values.topic;
  if (!topic) {
    console.error("Error: --topic is required");
    process.exit(1);
  }

  const keywords = values.keywords
    ? values.keywords.split(",").map((k: string) => k.trim())
    : [];

  console.log(`\n🔬 AutoResearch — Research Topic: "${topic}"`);
  console.log(`Keywords: ${keywords.join(", ") || "(none)"}`);
  console.log("─".repeat(60));

  // Initialize DB schema
  try {
    await initSchema();
  } catch (e) {
    console.warn("[DB] Schema init skipped (DB may not be running):", (e as Error).message);
  }

  // ─── Core Pipeline ──────────────────────────────────────────────────────────
  const researchStart = Date.now();
  const result = await runResearchPipeline(topic, keywords);
  console.log(`\n✅ Research completed in ${((Date.now() - researchStart) / 1000).toFixed(1)}s`);
  console.log(`📄 Findings: ${result.findings.length}`);
  console.log(`💡 Insights: ${result.insights.insights.length}`);
  console.log(`📊 Knowledge Gaps: ${result.insights.knowledgeGaps.length}`);

  // ─── Top Insights ────────────────────────────────────────────────────────────
  console.log(`\n${"─".repeat(60)}`);
  console.log("TOP INSIGHTS:");
  for (let i = 0; i < Math.min(3, result.insights.insights.length); i++) {
    const insight = result.insights.insights[i]!;
    console.log(`\n  ${i + 1}. [${insight.type.toUpperCase()}] ${insight.title}`);
    console.log(`     Confidence: ${(insight.confidence * 100).toFixed(0)}%`);
    console.log(`     ${insight.summary.slice(0, 150)}...`);
  }

  // ─── Full Pipeline: Coder + Analyst + Writer ────────────────────────────────
  if (values.full) {
    console.log(`\n${"─".repeat(60)}`);
    console.log("RUNNING FULL PIPELINE...\n");

    // Code generation
    console.log("💻 Coder Agent: generating prototype code...");
    const code = await generateCode(
      `Implement a ${topic} system based on research findings`,
      result.findings,
      "python",
    );
    console.log(`   Generated: ${code.files.length} files | Quality: ${(code.quality * 100).toFixed(0)}%`);

    // Analysis
    console.log("📊 Analyst Agent: analyzing findings...");
    const analysis = await analyzeFindings(result.findings);
    console.log(`   Statistics: ${JSON.stringify(analysis.statistics)}`);
    console.log(`   Conclusions: ${analysis.conclusions.length} generated`);

    // Literature review
    console.log("📝 Writer Agent: writing literature review...");
    const report = await writeLiteratureReview(topic, result.findings);
    console.log(`   Report: ${report.wordCount} words | Quality: ${(report.quality * 100).toFixed(0)}%`);
    console.log(`   Sections: ${report.sections.length}`);
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log("✅ AutoResearch pipeline complete");
  console.log(`   Session ID: ${result.sessionId}`);
  console.log(`   Total time: ${(result.duration / 1000).toFixed(1)}s`);
  console.log(`   Reused findings from KB: ${result.reusedFromKnowledgeHub.length}`);
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
