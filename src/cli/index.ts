/**
 * AutoResearch CLI — Main entry point
 *
 * Usage:
 *   autoresearch research "RAG optimization"
 *   autoresearch research "LLM fine-tuning" --full --format md
 *   autoresearch session list
 *   autoresearch session show <id>
 *   autoresearch kb search "chunking"
 *   autoresearch config show
 */

import { Command } from "commander";
import chalk, { type ChalkInstance } from "chalk";
import ora, { Ora } from "ora";
import { mkdirSync, writeFileSync, existsSync } from "fs";
import { resolve, join } from "path";
import { readFileSync } from "fs";

import { runResearchPipeline } from "../agents/orchestrator.ts";
import { initSchema } from "../hub/db.ts";
import { getHubStats } from "../hub/queries.ts";
import { webSearch } from "../hub/search.ts";
import { getPool } from "../hub/db.ts";
import { listSessions, getSessionDetail } from "./sessions.ts";
import { formatTerminal, formatMarkdown, formatHTML } from "./formatters.ts";
import { loadConfig } from "./config.ts";
import { printLogo, printMiniLogo } from "./logo.ts";
import { startChat } from "./repl.ts";
import type { InsightSession } from "../types.ts";

// ─── Load .env manually ───────────────────────────────────────────────────────

loadEnv();

function loadEnv() {
  const envPath = resolve(process.cwd(), ".env");
  try {
    const raw = readFileSync(envPath, "utf-8");
    for (const line of raw.split("\n")) {
      const [key, ...vals] = line.split("=");
      if (key && vals.length) {
        const k = key.trim();
        if (!process.env[k]) {
          process.env[k] = vals.join("=").trim();
        }
      }
    }
  } catch {
    // .env not found — rely on environment variables
  }
}

// ─── Spinner helper ────────────────────────────────────────────────────────────

function spinner(text: string): Ora {
  return ora({
    text,
    color: "cyan",
    spinner: "dots",
  }).start();
}

// ─── Commands ─────────────────────────────────────────────────────────────────

// Detect if running as "orin" (shorthand → starts chat immediately)
// vs "autoresearch" (full CLI with all commands)
const invokedAs = process.argv[1]?.split("/").pop() ?? "autoresearch";
const isOrinShort = invokedAs === "orin" && process.argv.length <= 2;

const program = new Command();

program
  .name(invokedAs === "orin" ? "orin" : "autoresearch")
  .description("🔬 ORIN — Multi-agent autonomous research engine")
  .version("1.1.0");

// ─── Default: run chat REPL ────────────────────────────────────────────────────
// `orin` (bare) or `index.ts` (direct) → start chat REPL immediately
// `autoresearch` → show help + all commands
if (isOrinShort || invokedAs === "index.ts") {
  program.action(async () => {
    await startChat();
  });
}

// ─── research command ─────────────────────────────────────────────────────────

program
  .command("research")
  .description("Run a research pipeline on a topic")
  .argument("<topic>", "Research topic (use quotes if multi-word)")
  .option("-k, --keywords <words>", "Comma-separated keywords")
  .option("-f, --full", "Run full pipeline (code + analysis + literature review)", false)
  .option("-o, --output <dir>", "Output directory", "./output")
  .option("--format <type>", "Output format: text, json, md, html", "text")
  .option("-v, --verbose", "Verbose output", false)
  .option("--no-sources", "Don't show source list")
  .option("--no-insights", "Show only top insights (first 5)")
  .option("-s, --stream", "Stream agent events in real-time as the research runs", false)
  .action(async (topic: string, opts) => {
    await runResearchCommand(topic, opts);
  });

// ─── session command ──────────────────────────────────────────────────────────

const sessionCmd = program
  .command("session")
  .description("Manage past research sessions");

sessionCmd
  .command("list")
  .description("List recent sessions")
  .option("-l, --limit <n>", "Number of sessions to show", "20")
  .action(async (opts) => {
    await listSessionsCommand(opts);
  });

sessionCmd
  .command("show")
  .description("Show details of a session")
  .argument("<id>", "Session ID")
  .option("--format <type>", "Output format: text, md, html, json", "text")
  .option("-o, --output <file>", "Write to file instead of stdout")
  .action(async (id: string, opts) => {
    await showSessionCommand(id, opts);
  });

sessionCmd
  .command("export")
  .description("Export a session to file")
  .argument("<id>", "Session ID")
  .argument("<format>", "Format: md, html, json")
  .argument("[output]", "Output file path")
  .action(async (id: string, format: string, output?: string) => {
    await exportSessionCommand(id, format, output);
  });

// ─── kb command (Knowledge Base) ──────────────────────────────────────────────

const kbCmd = program.command("kb").description("Query the Knowledge Base");

kbCmd
  .command("search")
  .description("Search the knowledge base")
  .argument("<query>", "Search query")
  .option("-l, --limit <n>", "Max results", "10")
  .action(async (query: string, opts) => {
    await kbSearchCommand(query, opts);
  });

kbCmd
  .command("stats")
  .description("Show Knowledge Base statistics")
  .action(async () => {
    await kbStatsCommand();
  });

kbCmd
  .command("graph")
  .description("Show the knowledge graph overview")
  .option("--limit <n>", "Max nodes", "20")
  .action(async (opts) => {
    await kbGraphCommand(opts);
  });

// ─── watch command (SSE streaming) ──────────────────────────────────────────────

program
  .command("watch")
  .description("Watch a research session stream in real-time")
  .argument("<sessionId>", "Session ID to watch")
  .option("-u, --url <url>", "API base URL", "http://localhost:3001")
  .action(async (sessionId: string, opts) => {
    await watchSessionCommand(sessionId, opts);
  });

// ─── config command ──────────────────────────────────────────────────────────

const configCmd = program.command("config").description("Manage CLI configuration");

configCmd
  .command("show")
  .description("Show current configuration")
  .action(() => {
    const cfg = loadConfig();
    console.log(chalk.blue.bold("\n🔧 AutoResearch CLI Config"));
    console.log(chalk.gray("─".repeat(50)));
    console.log(`  Provider:     ${cfg.provider}`);
    console.log(`  Model (orch): ${cfg.model.orchestrator}`);
    console.log(`  Model (reason): ${cfg.model.reasoning}`);
    console.log(`  Search Tavily: ${cfg.search.tavilyKey ? "✅ configured" : "❌ not set"}`);
    console.log(`  Max results:  ${cfg.search.maxResults}`);
    console.log(`  Output dir:   ${cfg.output.defaultDir}`);
    console.log(`  Default fmt:  ${cfg.output.defaultFormat}`);
    console.log("");
    console.log(chalk.gray("Config file: ~/.autoresearchrc or ./.autoresearchrc"));
    console.log("");
  });

configCmd
  .command("init")
  .description("Create a default config file at ~/.autoresearchrc")
  .action(() => {
    const defaultConfig = {
      provider: "groq",
      model: {
        orchestrator: "llama-3.3-70b-versatile",
        reasoning: "llama-3.3-70b-versatile",
        research: "llama-3.3-70b-versatile",
        writer: "llama-3.3-70b-versatile",
      },
      search: {
        tavilyKey: "",
        maxResults: 8,
      },
      output: {
        defaultFormat: "text",
        defaultDir: "./output",
      },
    };
    const path = resolve(process.env.HOME ?? ".", ".autoresearchrc");
    if (existsSync(path)) {
      console.log(chalk.yellow(`⚠️  Config already exists at ${path}`));
      console.log(chalk.gray("Delete it first or edit manually."));
    } else {
      writeFileSync(path, JSON.stringify(defaultConfig, null, 2));
      console.log(chalk.green(`✅ Created config at ${path}`));
      console.log(chalk.gray("Edit it to set your API keys and preferences."));
    }
  });

// ─── chat command ───────────────────────────────────────────────────────────────

program
  .command("chat")
  .alias("i")
  .description("Start the ORIN interactive chat REPL")
  .action(async () => {
    await startChat();
  });

// ─── Command Implementations ───────────────────────────────────────────────────

async function runResearchCommand(
  topic: string,
  opts: {
    keywords?: string;
    full?: boolean;
    output?: string;
    format?: string;
    verbose?: boolean;
    sources?: boolean;
    insights?: boolean;
    stream?: boolean;
  },
) {
  const keywords = opts.keywords
    ? opts.keywords.split(",").map((k: string) => k.trim())
    : [];

  try {
    // Init DB schema
    await initSchema().catch(() => {});

    if (opts.stream) {
      // Streaming mode: start via HTTP + stream SSE events
      await runResearchWithStreaming(topic, keywords, opts);
    } else {
      // Normal mode: spinner + direct pipeline call
      const sp = spinner(chalk.cyan(`Starting research: "${topic}"`));
      sp.text = chalk.cyan("🔬 Researching...");
      const startTime = Date.now();
      const result = await runResearchPipeline(topic, keywords);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      sp.succeed(chalk.green(`✅ Research complete in ${elapsed}s`));
      console.log(formatTerminal(topic, result.findings, result.insights, {
        verbose: opts.verbose,
        showSources: opts.sources,
        showFindings: opts.verbose,
      }));
      const outDir = opts.output ?? "./output";
      if (opts.format && opts.format !== "text") {
        await saveOutput(result.sessionId, topic, result.findings, result.insights, opts.format, outDir);
      }
      console.log(chalk.gray(`\nSession ID: ${result.sessionId}`));
      console.log(chalk.gray(`Findings: ${result.findings.length} | Insights: ${result.insights.insights.length} | KB reuse: ${result.reusedFromKnowledgeHub.length}`));
      console.log(chalk.gray(`Graph: ${result.graphStats.nodes} nodes, ${result.graphStats.edges} edges`));
      if (opts.format && opts.format !== "text") {
        console.log(chalk.green(`\n📄 Output saved to ${outDir}/${result.sessionId}.${opts.format}`));
      }
    }
  } catch (e) {
    console.log(chalk.red(`\n✗ Research failed: ${(e as Error).message}`));
    process.exit(1);
  }
}

async function runResearchWithStreaming(
  topic: string,
  keywords: string[],
  opts: {
    output?: string;
    format?: string;
    verbose?: boolean;
    sources?: boolean;
  },
) {
  const base = process.env.API_BASE ?? "http://localhost:3001";
  console.log(chalk.blue(`\n🔬 ${chalk.bold("AutoResearch")} — Streaming Mode`));
  console.log(chalk.gray(`   Topic: ${topic}`));
  console.log(chalk.gray(`   API:   ${base}`));
  console.log(chalk.gray("─".repeat(60)));
  console.log(chalk.magenta("   Starting research pipeline...\n"));

  // Start research via HTTP API
  let sessionId: string;
  try {
    const res = await fetch(`${base}/api/research`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic, keywords }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`${res.status} ${res.statusText}: ${err}`);
    }
    const data = await res.json() as { sessionId: string; status: string };
    sessionId = data.sessionId;
    console.log(chalk.gray(`   Session: ${sessionId}\n`));
  } catch (e) {
    console.log(chalk.red(`\n✗ Failed to start research: ${(e as Error).message}`));
    console.log(chalk.gray(`  Is the API server running at ${base}?`));
    process.exit(1);
  }

  // Subscribe to SSE stream
  const AGENT_COLORS: Record<string, ChalkInstance> = {
    orchestrator: chalk.cyan,
    researcher:   chalk.blue,
    reasoner:     chalk.magenta,
    analyst:      chalk.green,
    writer:       chalk.yellow,
    reviewer:     chalk.red,
    coder:        chalk.hex("#a78bfa"),
  };

  const agents = new Map<string, { status: string; task?: string; started?: Date }>();

  try {
    const esRes = await fetch(`${base}/api/events/${sessionId}/stream`);
    if (!esRes.ok || !esRes.body) {
      throw new Error(`SSE failed: ${esRes.status}`);
    }

    const reader = esRes.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let completed = false;

    while (!completed) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";

      for (const part of parts) {
        const lines = part.split("\n");
        let data = "";
        for (const line of lines) {
          if (line.startsWith("data:")) data = line.slice(5).trim();
        }
        if (!data) continue;

        try {
          const event = JSON.parse(data) as Record<string, unknown>;

          if (event.type === "connected") {
            continue;
          }

          if (event.type === "agent.start") {
            const agent = String(event.agent ?? "");
            const task = String(event.task ?? "");
            const color = AGENT_COLORS[agent] ?? chalk.white;
            agents.set(agent, { status: "running", task, started: new Date() });
            process.stdout.write(`  ${color("⚡ " + agent)}  ${task}\n`);
          }

          if (event.type === "agent.complete") {
            const agent = String(event.agent ?? "");
            const elapsed = agents.get(agent)?.started
              ? ((Date.now() - agents.get(agent)!.started!.getTime()) / 1000).toFixed(1) + "s"
              : "?s";
            agents.set(agent, { status: "completed" });
            process.stdout.write(`  ${chalk.green("✓ " + agent)}  done (${elapsed})\n`);
          }

          if (event.type === "agent.error") {
            const agent = String(event.agent ?? "");
            const error = String(event.error ?? "");
            agents.set(agent, { status: "error" });
            process.stdout.write(`  ${chalk.red("✗ " + agent)}  ${error.slice(0, 80)}\n`);
          }

          if (event.type === "orchestrator.phase") {
            const phase = String(event.phase ?? "");
            const progress = Number(event.progress ?? 0);
            process.stdout.write(
              `  ${chalk.blue("⚙  " + phase)}  ${chalk.gray(progress + "%")}\n`,
            );
          }

          if (event.type === "reasoner.insight") {
            const insight = String(event.insight ?? "");
            process.stdout.write(`  ${chalk.yellow("💡 Insight:")} ${insight.slice(0, 80)}\n`);
          }

          if (event.type === "researcher.found") {
            const title = String(event.title ?? "");
            process.stdout.write(`  ${chalk.cyan("🔍 Source:")} ${title.slice(0, 70)}\n`);
          }

          // Check for completion via the poll endpoint
          if (
            event.type === "agent.complete" &&
            agents.get("orchestrator")?.status === "completed"
          ) {
            completed = true;
          }
        } catch {
          // Skip malformed
        }
      }

      // Poll for completion status if still running
      if (!completed) {
        try {
          const statusRes = await fetch(`${base}/api/research/${sessionId}`);
          if (statusRes.ok) {
            const statusData = await statusRes.json() as { status: string };
            if (statusData.status === "completed" || statusData.status === "failed") {
              completed = true;
            }
          }
        } catch {
          // Ignore poll errors
        }
      }
    }

    // Fetch final results
    const finalRes = await fetch(`${base}/api/research/${sessionId}`);
    if (finalRes.ok) {
      const finalData = await finalRes.json() as {
        status: string;
        findings?: unknown[];
        insights?: unknown;
        error?: string;
      };
      if (finalData.status === "completed") {
        console.log(chalk.green("\n✅ Research completed!\n"));
        if (finalData.findings?.length) {
          console.log(chalk.blue(`   ${finalData.findings.length} findings, ${((finalData.insights as { insights?: unknown[] })?.insights?.length ?? 0)} insights`));
        }
      } else if (finalData.status === "failed") {
        console.log(chalk.red(`\n✗ Research failed: ${finalData.error}`));
      }
    }
  } catch (e) {
    console.log(chalk.red(`\n✗ Stream error: ${(e as Error).message}`));
  }
}

async function listSessionsCommand(opts: { limit?: string }) {
  const limit = parseInt(opts.limit ?? "20", 10);
  const sp = spinner("Loading sessions...");
  const sessions = await listSessions(limit);
  sp.succeed();

  if (sessions.length === 0) {
    console.log(chalk.yellow("No sessions found. Run `autoresearch research \"<topic>\"` first."));
    return;
  }

  console.log(chalk.blue.bold("\n📋 Recent Sessions"));
  console.log(chalk.gray("─".repeat(70)));
  for (const s of sessions) {
    const statusColor = s.status === "completed" ? chalk.green : s.status === "active" ? chalk.cyan : chalk.gray;
    const date = new Date(s.createdAt).toLocaleDateString();
    console.log(`  ${chalk.white(s.id.slice(0, 8))} ${statusColor(s.status.padEnd(12))} ${date}  ${s.title}`);
  }
  console.log("");
}

async function showSessionCommand(
  id: string,
  opts: { format?: string; output?: string },
) {
  const sp = spinner(`Loading session ${id}...`);
  const session = await getSessionDetail(id);

  if (!session) {
    sp.fail(chalk.red(`Session not found: ${id}`));
    process.exit(1);
  }
  sp.succeed();

  const insights: InsightSession = {
    id: session.id,
    totalFindingsAnalyzed: session.findings.length,
    insights: session.insights,
    knowledgeGaps: [],
    researchTrends: { rising: [], declining: [], stable: [] },
    generatedAt: session.completedAt ?? session.createdAt,
  };

  let output: string;
  switch (opts.format) {
    case "md":
      output = formatMarkdown(session.title, session.findings, insights);
      break;
    case "html":
      output = formatHTML(session.title, session.findings, insights);
      break;
    case "json":
      output = JSON.stringify({ session, insights }, null, 2);
      break;
    default:
      output = formatTerminal(session.title, session.findings, insights, { verbose: true });
  }

  if (opts.output) {
    const dir = resolve(opts.output);
    writeFileSync(dir, output);
    console.log(chalk.green(`✅ Saved to ${dir}`));
  } else {
    console.log(output);
  }
}

async function exportSessionCommand(
  id: string,
  format: string,
  outputPath?: string,
) {
  const session = await getSessionDetail(id);
  if (!session) {
    console.log(chalk.red(`Session not found: ${id}`));
    process.exit(1);
  }

  const insights: InsightSession = {
    id: session.id,
    totalFindingsAnalyzed: session.findings.length,
    insights: session.insights,
    knowledgeGaps: [],
    researchTrends: { rising: [], declining: [], stable: [] },
    generatedAt: session.completedAt ?? session.createdAt,
  };

  const outputFile = outputPath ?? `${session.id}.${format}`;
  let content: string;

  switch (format) {
    case "md":
      content = formatMarkdown(session.title, session.findings, insights);
      break;
    case "html":
      content = formatHTML(session.title, session.findings, insights);
      break;
    case "json":
      content = JSON.stringify({ session, insights }, null, 2);
      break;
    default:
      console.log(chalk.red(`Unknown format: ${format}. Use md, html, or json.`));
      process.exit(1);
  }

  writeFileSync(outputFile, content, "utf-8");
  console.log(chalk.green(`✅ Exported to ${resolve(outputFile)}`));
}

async function kbSearchCommand(query: string, opts: { limit?: string }) {
  const sp = spinner(`Searching: "${query}"...`);
  try {
    const { searchFindingsByText } = await import("../hub/db.ts");
    await initSchema().catch(() => {});
    const results = await searchFindingsByText(query, parseInt(opts.limit ?? "10", 10));
    sp.succeed();

    if (results.length === 0) {
      console.log(chalk.yellow(`No results for "${query}"`));
      return;
    }

    console.log(chalk.blue.bold(`\n🔍 KB Search: "${query}"`));
    console.log(chalk.gray(`Found ${results.length} results`));
    console.log(chalk.gray("─".repeat(60)));
    for (const r of results) {
      console.log(chalk.white(`\n  ${r.title}`));
      if (r.sourceUrl) console.log(chalk.blue.underline(`  ${r.sourceUrl}`));
      console.log(chalk.gray(`  type: ${r.sourceType} | confidence: ${(r.confidence * 100).toFixed(0)}%`));
      if (r.summary) console.log(`  ${r.summary.slice(0, 150)}...`);
    }
    console.log("");
  } catch (e) {
    sp.fail(chalk.red((e as Error).message));
  }
}

async function kbStatsCommand() {
  const sp = spinner("Loading Knowledge Base stats...");
  try {
    await initSchema().catch(() => {});
    const { getGraphStats } = await import("../hub/db.ts");
    const stats = await getGraphStats();
    sp.succeed();

    console.log(chalk.blue.bold("\n📊 Knowledge Base Statistics"));
    console.log(chalk.gray("─".repeat(50)));
    console.log(`  Total nodes:   ${stats.totalNodes}`);
    console.log(`  Total edges:   ${stats.totalEdges}`);
    console.log(`  Node types:`);
    for (const [type, count] of Object.entries(stats.nodeTypes)) {
      console.log(`    • ${type}: ${count}`);
    }
    console.log("");
  } catch (e) {
    sp.fail(chalk.red((e as Error).message));
  }
}

async function watchSessionCommand(sessionId: string, opts: { url?: string }) {
  const base = opts.url ?? "http://localhost:3001";
  const url = `${base}/api/events/${sessionId}/stream`;

  console.log(chalk.blue(`\n🔴 Watching session: ${chalk.white(sessionId)}`));
  console.log(chalk.gray(`   Stream: ${url}`));
  console.log(chalk.gray("─".repeat(60)));
  console.log(chalk.magenta("  Press Ctrl+C to stop watching\n"));

  const AGENT_COLORS: Record<string, ChalkInstance> = {
    orchestrator: chalk.cyan,
    researcher:   chalk.blue,
    reasoner:     chalk.magenta,
    analyst:      chalk.green,
    writer:       chalk.yellow,
    reviewer:     chalk.red,
    coder:        chalk.hex("#a78bfa"),
  };

  const activeAgents = new Map<string, { status: string; task?: string; started?: Date }>();

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.log(chalk.red(`\n✗ Failed to connect: ${res.status} ${res.statusText}`));
      console.log(chalk.gray(`  Is the API server running at ${base}?`));
      process.exit(1);
    }

    if (!res.body) {
      console.log(chalk.red("\n✗ Response body is not streamed (no SSE support)"));
      process.exit(1);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete SSE messages (lines ending in \n\n)
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? ""; // keep incomplete part in buffer

      for (const part of parts) {
        const lines = part.split("\n");
        let type = "";
        let data = "";

        for (const line of lines) {
          if (line.startsWith("event:")) type = line.slice(6).trim();
          if (line.startsWith("data:")) data = line.slice(5).trim();
        }

        if (!data) continue;

        try {
          const event = JSON.parse(data);

          if (event.type === "connected") {
            console.log(chalk.green(`  ✓ Connected to session`));
            continue;
          }

          if (event.type === "agent.start" || type === "agent.start") {
            const agent = event.agent as string;
            const task = event.task as string;
            const color = AGENT_COLORS[agent] ?? chalk.white;
            activeAgents.set(agent, { status: "running", task, started: new Date() });
            process.stdout.write(
              `\r${color(`  ⚡ ${agent}`)} ${chalk.gray("running")} — ${task.slice(0, 50)}${" ".repeat(30)}\n`,
            );
          }

          if (event.type === "agent.complete" || type === "agent.complete") {
            const agent = event.agent as string;
            const color = AGENT_COLORS[agent] ?? chalk.white;
            const elapsed = activeAgents.get(agent)?.started
              ? ((Date.now() - activeAgents.get(agent)!.started!.getTime()) / 1000).toFixed(1)
              : "?";
            activeAgents.set(agent, { status: "completed" });
            process.stdout.write(
              `\r${chalk.green(`  ✓ ${agent}`)} ${chalk.gray("done")} (${elapsed}s)${" ".repeat(40)}\n`,
            );
          }

          if (event.type === "agent.error" || type === "agent.error") {
            const agent = event.agent as string;
            const error = event.error as string;
            activeAgents.set(agent, { status: "error" });
            process.stdout.write(
              `\r${chalk.red(`  ✗ ${agent}`)} ${chalk.red("error")} — ${error.slice(0, 60)}${" ".repeat(20)}\n`,
            );
          }

          if (event.type === "orchestrator.phase" || type === "orchestrator.phase") {
            const phase = event.phase as string;
            const progress = event.progress as number;
            process.stdout.write(
              `\r  ${chalk.blue("⚙")} Phase: ${chalk.white(phase)} ${chalk.gray(`${progress}%`)}${" ".repeat(30)}\n`,
            );
          }

          if (event.type === "reasoner.insight" || type === "reasoner.insight") {
            const insight = event.insight as string;
            process.stdout.write(`\r${chalk.yellow("  💡 Insight:")} ${insight.slice(0, 80)}  \n`);
          }

          if (event.type === "researcher.found" || type === "researcher.found") {
            const title = event.title as string;
            process.stdout.write(`\r${chalk.cyan("  🔍 Found:")} ${title.slice(0, 70)}  \n`);
          }

          // Raw event for unknown types
          if (
            !["connected", "agent.start", "agent.complete", "agent.error",
              "orchestrator.phase", "reasoner.insight", "researcher.found"].includes(event.type as string)
          ) {
            process.stdout.write(
              `\r${chalk.gray("  ?")} ${JSON.stringify(event).slice(0, 80)}  \n`,
            );
          }
        } catch {
          // Skip malformed JSON
        }
      }
    }
  } catch (e) {
    if ((e as Error).name === "AbortError") {
      console.log(chalk.gray("\n\n  Stream ended."));
    } else {
      console.log(chalk.red(`\n\n✗ Stream error: ${(e as Error).message}`));
    }
  }

  console.log(chalk.gray("\n─".repeat(60)));
  console.log(chalk.green("  Watch ended."));
}

async function kbGraphCommand(opts: { limit?: string }) {
  const sp = spinner("Loading knowledge graph...");
  try {
    await initSchema().catch(() => {});
    const { getFullGraph } = await import("../hub/db.ts");
    const graph = await getFullGraph(parseInt(opts.limit ?? "20", 10));
    sp.succeed();

    console.log(chalk.blue.bold("\n🕸️  Knowledge Graph"));
    console.log(chalk.gray(`Nodes: ${graph.nodes.length} | Edges: ${graph.edges.length}`));
    console.log(chalk.gray("─".repeat(50)));
    for (const node of graph.nodes) {
      const meta = (node as any).metadata ?? {};
      console.log(`  ${chalk.cyan((node as any).type.padEnd(12))} ${chalk.white((node as any).name)}`);
    }
    console.log("");
  } catch (e) {
    sp.fail(chalk.red((e as Error).message));
  }
}

async function saveOutput(
  sessionId: string,
  topic: string,
  findings: any[],
  insights: InsightSession,
  format: string,
  outDir: string,
) {
  try {
    mkdirSync(outDir, { recursive: true });
  } catch {
    // ignore
  }

  const filePath = resolve(outDir, `${sessionId}.${format}`);
  let content: string;

  switch (format) {
    case "md":
      content = formatMarkdown(topic, findings, insights);
      break;
    case "html":
      content = formatHTML(topic, findings, insights);
      break;
    case "json":
      content = JSON.stringify({ sessionId, topic, findings, insights }, null, 2);
      break;
    default:
      return;
  }

  writeFileSync(filePath, content, "utf-8");
}

// ─── Run ──────────────────────────────────────────────────────────────────────

const showLogo = !process.argv.includes("--no-logo");
if (showLogo) printLogo();

program.parseAsync(process.argv).catch((e) => {
  console.error(chalk.red(`Error: ${e}`));
  process.exit(1);
});
