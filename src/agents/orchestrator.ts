/**
 * Orchestrator Agent — Project Manager của AutoResearch
 *
 * Responsibilities:
 * 1. Receive research tasks from user
 * 2. Query Knowledge Hub (similar past research?)
 * 3. Decompose task into subtasks
 * 4. Assign to appropriate agents
 * 5. Monitor progress
 * 6. Merge results
 * 7. Send to Reviewer
 * 8. Archive to Knowledge Hub
 */

import { v4 as uuidv4 } from "uuid";
import { claudeChat } from "./lib/claude.ts";
import { config } from "../config.ts";
import { research, summarizeForReasoning } from "./researcher.ts";
import { generateDeepInsights } from "./reasoner.ts";
import {
  archiveFinding,
  archiveInsight,
  querySimilarResearch,
  startSession,
  finishSession,
  saveOutput,
} from "../hub/queries.ts";
import { agentHeartbeat } from "../hub/redis.ts";
import { initSchema } from "../hub/db.ts";
import { buildGraphFromFindings } from "../hub/graph.ts";
import {
  emit,
  emitPhase,
  emitAgentStart,
  emitAgentComplete,
  emitAgentError,
  emitFinding,
  emitGraphNode,
  emitGraphEdge,
  emitThinking,
  emitInsight,
} from "../hub/events.ts";
import { reviewInsights } from "./reviewer.ts";
import type {
  Task,
  Finding,
  InsightSession,
  Insight,
  AgentName,
  Priority,
} from "../types.ts";

export interface OrchestratorState {
  sessionId: string;
  topic: string;
  tasks: Task[];
  findings: Finding[];
  insights?: InsightSession;
  status: "initialized" | "researching" | "reasoning" | "writing" | "reviewing" | "completed" | "failed";
  startedAt: string;
  completedAt?: string;
}

// ─── Main Research Pipeline ───────────────────────────────────────────────────

export async function runResearchPipeline(
  topic: string,
  keywords: string[] = [],
  sessionId?: string,
): Promise<{
  sessionId: string;
  findings: Finding[];
  insights: InsightSession;
  tasks: Task[];
  duration: number;
  reusedFromKnowledgeHub: Finding[];
  graphStats: { nodes: number; edges: number; concepts: number; methods: number; datasets: number };
}> {
  const id = sessionId ?? uuidv4();
  const startedAt = Date.now();

  console.log(`[Orchestrator] Starting research session: ${id}`);
  console.log(`[Orchestrator] Topic: ${topic}`);

  const state: OrchestratorState = {
    sessionId: id,
    topic,
    tasks: [],
    findings: [],
    status: "initialized",
    startedAt: new Date().toISOString(),
  };

  // Register agent heartbeat
  await agentHeartbeat("orchestrator", "busy", id);
  emitAgentStart(id, "orchestrator", `Research session: ${topic}`);
  emitPhase(id, "research", "pending", 0);

  // Initialize DB schema if needed
  try {
    await initSchema();
  } catch {}

  try {
    // ─── Step 0: Start session in Knowledge Hub ─────────────────────────────
    await startSession(id, topic, `Research: ${topic}`);

    // ─── Step 1: Query Knowledge Hub for similar past research ───────────────
    console.log(`[Orchestrator] Checking Knowledge Hub for similar research...`);
    const { findings: reusedFindings, reuseRatio } = await querySimilarResearch(topic, 5);
    console.log(`[Orchestrator] Found ${reusedFindings.length} similar past findings (reuse ratio: ${(reuseRatio * 100).toFixed(0)}%)`);

    // ─── Phase 2: Research — PARALLEL execution ───────────────────────────────
    console.log(`[Orchestrator] Phase 2: Research (parallel: researcher + analyst + graph)`);
    state.status = "researching";
    emitPhase(id, "research", "running", 0);

    const researchTask = createTask("Research", topic, "researcher", 1);
    state.tasks.push(researchTask);

    // ── Run Researcher, Analyst, and Graph Builder in PARALLEL ──
    const researchStartTime = Date.now();

    const researchPromise = (async () => {
      emitAgentStart(id, "researcher", `Research: ${topic}`);
      try {
        const result = await research(topic, keywords, 10);
        for (let i = 0; i < result.sources.length; i++) {
          const f = result.sources[i]!;
          emitFinding(id, f.title, f.sourceUrl ?? f.sourceType, f.confidence);
          await archiveFinding(f, id);
        }
        emitAgentComplete(id, "researcher", `Found ${result.sources.length} sources`);
        return result.sources;
      } catch (e) {
        emitAgentError(id, "researcher", (e as Error).message);
        throw e;
      }
    })();

    const analystPromise = (async () => {
      // Analyst will process findings as they come in
      emitAgentStart(id, "analyst", `Analyze findings for: ${topic}`);
      return null; // Analyst runs on sources once research completes
    })();

    const graphPromise = (async () => {
      emitAgentStart(id, "graph-builder", "Extract knowledge graph entities");
      return null; // Graph builder runs after sources are ready
    })();

    // Wait for research to complete (critical path)
    const sources = await researchPromise;
    // Merge reused findings from Knowledge Hub into the sources list
    const allFindings = [...reusedFindings, ...sources];
    state.findings = allFindings;

    // Analyst processes findings in parallel with graph extraction
    emitPhase(id, "research", "analyzing", 60);
    emitAgentStart(id, "analyst", `Analyze ${sources.length} findings`);

    // Now run analyst and graph builder in parallel (both depend only on sources)
    const [, graphResult] = await Promise.all([
      (async () => {
        try {
          const { analyzeFindings } = await import("./analyst.ts");
          const analysis = await analyzeFindings(sources);
          emitAgentComplete(id, "analyst", `Statistics: ${Object.keys(analysis.statistics).length} metrics`);
          await saveOutput("analyst", id, "result", JSON.stringify(analysis), analysis.quality);
          return analysis;
        } catch (e) {
          emitAgentError(id, "analyst", (e as Error).message);
          return null;
        }
      })(),
      (async () => {
        try {
          const graphRes = await buildGraphFromFindings(allFindings, id);
          for (const node of graphRes.nodes) {
            emitGraphNode(id, node.name, node.type);
          }
          for (const edge of graphRes.edges) {
            emitGraphEdge(id, edge.sourceId, edge.targetId, edge.type);
          }
          emitAgentComplete(id, "graph-builder", `${graphRes.nodes.length} nodes, ${graphRes.edges.length} edges`);
          return graphRes;
        } catch (e) {
          emitAgentError(id, "graph-builder", (e as Error).message);
          return null;
        }
      })(),
    ]);

    await saveOutput("researcher", id, "result", JSON.stringify(sources), 0.8);
    console.log(`[Orchestrator] Found ${sources.length} sources`);
    researchTask.status = "completed";
    researchTask.output = `Found ${sources.length} findings`;
    emitPhase(id, "research", "completed", 100);

    // ─── Phase 3: Reasoning — PARALLEL with Writer ───────────────────────────
    console.log(`[Orchestrator] Phase 3: Reasoning + Writing (parallel)`);
    state.status = "reasoning";
    emitPhase(id, "reasoning", "running", 0);

    const reasoningTask = createTask("Deep Insights", topic, "reasoner", 1);
    state.tasks.push(reasoningTask);

    // Run reasoner and writer in parallel (both depend on sources)
    const [insights] = await Promise.all([
      (async () => {
        try {
          emitAgentStart(id, "reasoner", `Deep reasoning on ${sources.length} findings`);
          emitThinking(id, "reasoner", "CROSS_PAPER_SYNTHESIS",
            "Analyzing cross-paper patterns and complementary insights...");

          const result = await generateDeepInsights(sources, id);

          // Emit each insight as it was generated
          for (const insight of result.insights) {
            emitInsight(id, insight.title, insight.confidence, insight.type);
          }

          // Archive insights
          for (const insight of result.insights) {
            await archiveInsight(insight, id);
          }

          emitAgentComplete(id, "reasoner", `${result.insights.length} insights + ${result.knowledgeGaps.length} gaps`);
          emitPhase(id, "reasoning", "completed", 100);
          return result;
        } catch (e) {
          emitAgentError(id, "reasoner", (e as Error).message);
          emitPhase(id, "reasoning", "failed", 0);
          throw e;
        }
      })(),
      (async () => {
        try {
          emitAgentStart(id, "writer", `Writing literature review for: ${topic}`);
          const { writeLiteratureReview } = await import("./writer.ts");
          const report = await writeLiteratureReview(topic, sources);
          emitAgentComplete(id, "writer", `${report.wordCount} words written`);
          await saveOutput("writer", id, "report", report.markdown, report.quality);
          return report;
        } catch (e) {
          emitAgentError(id, "writer", (e as Error).message);
          return null;
        }
      })(),
    ]);

    state.insights = insights;

    await saveOutput("reasoner", id, "insight", JSON.stringify(insights), insights.insights.length > 0 ? 0.85 : 0.5);
    console.log(`[Orchestrator] Generated ${insights.insights.length} insights`);
    reasoningTask.status = "completed";
    reasoningTask.output = `${insights.insights.length} deep insights + ${insights.knowledgeGaps.length} gaps`;

    // ─── Phase 4: Review ────────────────────────────────────────────────────
    console.log(`[Orchestrator] Phase 4: Reviewer Agent verifying insights quality...`);
    state.status = "reviewing";
    emitAgentStart(id, "reviewer", "Verify insights quality");

    const reviewResult = await reviewInsights(insights, allFindings);
    console.log(`[Orchestrator] Review: score=${reviewResult.score}/100, approved=${reviewResult.approved}, issues=${reviewResult.issues.length}`);

    const verifiedInsights = reviewResult.approved
      ? insights.insights
      : insights.insights.map((insight) => ({ ...insight, verified: false }));

    // Attach review feedback to session
    await saveOutput("reviewer", id, "feedback", JSON.stringify(reviewResult), reviewResult.score / 100);

    state.insights = { ...insights, insights: verifiedInsights };
    emitAgentComplete(id, "reviewer", `Review: ${reviewResult.score}/100 | ${reviewResult.issues.length} issues found`);

    state.status = "completed";
    emitPhase(id, "completed", "all phases done", 100);

    // ─── Cleanup ───────────────────────────────────────────────────────────────
    await finishSession(id, topic);
    await agentHeartbeat("orchestrator", "idle");
    await agentHeartbeat("researcher", "idle");
    await agentHeartbeat("reasoner", "idle");
    emitAgentComplete(id, "orchestrator", "Research pipeline complete");

    const duration = Date.now() - startedAt;
    console.log(`[Orchestrator] ✅ Completed in ${(duration / 1000).toFixed(1)}s`);

    // Compute graph stats from graphResult (may be null if graph building failed)
    const gr = graphResult as { nodes: unknown[]; edges: unknown[]; stats: Record<string, number> } | null;
    return {
      sessionId: id,
      findings: allFindings,
      insights: state.insights,
      tasks: state.tasks,
      duration,
      reusedFromKnowledgeHub: reusedFindings,
      graphStats: {
        nodes: gr?.nodes?.length ?? 0,
        edges: gr?.edges?.length ?? 0,
        concepts: gr?.stats?.concepts ?? 0,
        methods: gr?.stats?.methods ?? 0,
        datasets: gr?.stats?.datasets ?? 0,
      },
    };
  } catch (e) {
    state.status = "failed";
    console.error(`[Orchestrator] ❌ Failed:`, e);
    await agentHeartbeat("orchestrator", "error");
    await agentHeartbeat("researcher", "idle");
    await agentHeartbeat("reasoner", "idle");
    throw e;
  }
}

// ─── Task Decomposition ───────────────────────────────────────────────────────

export async function decomposeTask(topic: string): Promise<Task[]> {
  const response = await claudeChat(
    [{
      role: "user",
      content: `Decompose this research topic into 3-5 specific subtasks that should be executed sequentially.

Topic: ${topic}

For each subtask, specify:
1. title: short name
2. description: what to research specifically
3. type: "research" | "analysis" | "implementation" | "writing"
4. priority: 1 (high) to 3 (low)

Return JSON array of subtasks.`,
    }],
    "You are a project manager. Break down research topics into clear, actionable subtasks.",
    config.models.orchestrator,
    1024,
  );

  try {
    const match = response.content.match(/\[[\s\S]*\]/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed)) {
        return parsed.map((t: any, i: number) => createTask(
          t.title ?? `Subtask ${i + 1}`,
          t.description ?? "",
          determineAgentType(t.type ?? "research"),
          t.priority ?? 2,
        ));
      }
    }
  } catch {}

  return [createTask("Research", topic, "researcher", 1)];
}

function determineAgentType(taskType: string): AgentName {
  const map: Record<string, AgentName> = {
    research: "researcher",
    analysis: "analyst",
    implementation: "coder",
    writing: "writer",
    review: "reviewer",
  };
  return map[taskType.toLowerCase()] ?? "researcher";
}

// ─── Self-Review ─────────────────────────────────────────────────────────────

async function selfReview(
  findings: Finding[],
  insights: InsightSession,
): Promise<Insight[]> {
  const verified = insights.insights.filter((insight) => {
    if (insight.evidenceRefs.length < 2 && insight.confidence < 0.8) {
      return false;
    }
    const genericTerms = ["important", "significant", "useful", "beneficial"];
    const isGeneric = genericTerms.every(
      (term) => !insight.title.toLowerCase().includes(term),
    );
    return isGeneric;
  });

  await saveOutput("reviewer", insights.id, "feedback", JSON.stringify({
    total: insights.insights.length,
    verified: verified.length,
    filtered: insights.insights.length - verified.length,
  }), verified.length / Math.max(insights.insights.length, 1));

  return verified.map((i) => ({ ...i, verified: true }));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createTask(
  title: string,
  description: string,
  agentType: AgentName,
  priority: Priority,
): Task {
  return {
    id: uuidv4(),
    title,
    description,
    type: agentType,
    priority,
    status: "pending",
    assignedTo: agentType,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    retryCount: 0,
  };
}

// ─── Agent Status ─────────────────────────────────────────────────────────────

export function getSystemStatus(): {
  agents: { name: AgentName; status: string }[];
  activeSessions: number;
  uptime: string;
} {
  return {
    agents: [
      { name: "orchestrator", status: "idle" },
      { name: "researcher", status: "idle" },
      { name: "reasoner", status: "idle" },
      { name: "coder", status: "idle" },
      { name: "analyst", status: "idle" },
      { name: "writer", status: "idle" },
      { name: "reviewer", status: "idle" },
    ],
    activeSessions: 0,
    uptime: process.uptime().toFixed(0) + "s",
  };
}
