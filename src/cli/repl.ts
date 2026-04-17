/**
 * ORIN Interactive Chat REPL
 *
 * A Claude CLI-style interactive readline interface with:
 * - Streaming agent events rendered as tool cards
 * - Thinking dots / spinner for live agent activity
 * - Colored agent output with progress bars
 * - Session history within the REPL
 * - /-prefixed slash commands
 *
 * Entry: `orin chat` (aliased from `autoresearch chat`)
 */

import * as readline from "readline";
import chalk, { type ChalkInstance } from "chalk";
import { printMiniLogo } from "./logo.ts";
import type { AgentEvent } from "../hub/events.ts";

// ─── Env / base URL ───────────────────────────────────────────────────────────

const API_BASE = process.env.API_BASE ?? "http://localhost:3001";

// ─── Agent colors ─────────────────────────────────────────────────────────────

const AGENT_COLORS: Record<string, ChalkInstance> = {
  orchestrator: chalk.cyan,
  researcher:   chalk.blue,
  reasoner:     chalk.magenta,
  analyst:      chalk.green,
  writer:       chalk.yellow,
  reviewer:     chalk.red,
  coder:        chalk.hex("#a78bfa"),
};
const AGENT_ICONS: Record<string, string> = {
  orchestrator: "🎛",
  researcher:   "🔍",
  reasoner:     "🧠",
  analyst:      "📊",
  writer:       "✍",
  reviewer:     "✅",
  coder:        "💻",
};
const AGENT_LABELS: Record<string, string> = {
  orchestrator: "Orchestrator",
  researcher:   "Researcher",
  reasoner:     "Reasoner",
  analyst:      "Analyst",
  writer:       "Writer",
  reviewer:     "Reviewer",
  coder:        "Coder",
};

// ─── Spinner frames ───────────────────────────────────────────────────────────

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
let spinnerFrame = 0;

function spin(label: string): string {
  const frame = SPINNER_FRAMES[spinnerFrame % SPINNER_FRAMES.length];
  spinnerFrame++;
  return chalk.cyan(`${frame} ${label}`);
}

// ─── Thinking dots ────────────────────────────────────────────────────────────

const THINKING_CHARS = ["∙", "◐", "◑", "◒", "◓"];
let thinkingIdx = 0;

function thinking(label: string): string {
  const c = THINKING_CHARS[thinkingIdx % THINKING_CHARS.length];
  thinkingIdx++;
  return chalk.magenta(`${c} ${label}`);
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function progressBar(pct: number, width = 24): string {
  const filled = Math.round((pct / 100) * width);
  const empty = width - filled;
  const bar = "█".repeat(filled) + "░".repeat(empty);
  return chalk.gray(bar);
}

// ─── Terminal helpers ─────────────────────────────────────────────────────────

function clearLine() {
  process.stdout.write("\r" + "\u001b[K");
}

function eraseLines(n: number) {
  for (let i = 0; i < n; i++) {
    process.stdout.write("\r\u001b[2K\u001b[1B" as `${string}`);
  }
}

function ansiLines(s: string): number {
  return s.split("\n").length;
}

function moveCursorUp(n: number) {
  process.stdout.write(`\u001b[${n}A` as `${string}`);
}

function terminalWidth(): number {
  return process.stdout.columns || 80;
}

// ─── Slash commands ───────────────────────────────────────────────────────────

interface SlashCommand {
  name: string;
  description: string;
  aliases: string[];
  run: (args: string, repl: ChatREPL) => Promise<void>;
}

function buildSlashCommands(repl: ChatREPL): SlashCommand[] {
  return [
    {
      name: "research",
      description: "Start a deep research session",
      aliases: ["r", "search"],
      run: async (args) => {
        if (!args.trim()) {
          console.log(chalk.yellow("  Usage: /research <topic>"));
          return;
        }
        await repl.runResearch(args.trim());
      },
    },
    {
      name: "stats",
      description: "Show Knowledge Hub statistics",
      aliases: ["stat"],
      run: async () => {
        await repl.showStats();
      },
    },
    {
      name: "kb",
      description: "Search the knowledge base",
      aliases: ["search", "find"],
      run: async (args) => {
        if (!args.trim()) {
          console.log(chalk.yellow("  Usage: /kb <query>"));
          return;
        }
        await repl.searchKB(args.trim());
      },
    },
    {
      name: "sessions",
      description: "List recent research sessions",
      aliases: ["session", "ls"],
      run: async () => {
        await repl.listSessions();
      },
    },
    {
      name: "clear",
      description: "Clear the chat history",
      aliases: ["cls"],
      run: async () => {
        repl.clearHistory();
        console.log(chalk.gray("  Chat history cleared.\n"));
      },
    },
    {
      name: "help",
      description: "Show all commands",
      aliases: ["?"],
      run: async () => {
        repl.printHelp();
      },
    },
    {
      name: "exit",
      description: "Exit the chat REPL",
      aliases: ["quit", "q"],
      run: async () => {
        console.log(chalk.gray("\n  Goodbye! Run `autoresearch research <topic>` to continue.\n"));
        process.exit(0);
      },
    },
  ];
}

function matchCommand(input: string): { cmd: SlashCommand; args: string } | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) return null;
  const [name, ...rest] = trimmed.slice(1).split(/\s+/);
  const key = name?.toLowerCase() ?? "";
  // Lazy init — commands built on first match attempt
  return null;
}

// ─── Agent card renderer ──────────────────────────────────────────────────────

interface AgentCard {
  id: string;
  agent: string;
  task: string;
  status: "pending" | "running" | "completed" | "error";
  started?: Date;
  completedAt?: Date;
  progress?: number;
  output?: string;
  error?: string;
  lines?: number; // how many terminal lines to erase on update
}

class AgentCardRenderer {
  private cards = new Map<string, AgentCard>();
  private firstRender = true;
  private W: number;

  constructor() {
    this.W = terminalWidth();
  }

  update(event: AgentEvent) {
    const agent = String(event.data?.agent ?? event.agent ?? "");
    if (!agent) return;

    switch (event.type) {
      case "agent.start":
      case "orchestrator.start":
      case "reasoner.start":
      case "researcher.searching": {
        const task = String(
          event.data?.task ??
          event.data?.query ??
          event.description ??
          "Working...",
        );
        if (!this.cards.has(agent)) {
          this.cards.set(agent, {
            id: event.id,
            agent,
            task,
            status: "running",
            started: new Date(),
            progress: 0,
          });
          this.render();
        } else {
          const card = this.cards.get(agent)!;
          card.task = task;
          card.status = "running";
          this.render();
        }
        break;
      }

      case "reasoner.thinking": {
        const thought = String(event.data?.thought ?? "");
        const strategy = String(event.data?.strategy ?? "Thinking");
        if (!this.cards.has("reasoner")) {
          this.cards.set("reasoner", {
            id: event.id,
            agent: "reasoner",
            task: strategy,
            status: "running",
            started: new Date(),
            progress: 0,
            output: thought.slice(0, 200),
          });
        } else {
          const card = this.cards.get("reasoner")!;
          card.output = thought.slice(0, 200);
          card.task = strategy;
        }
        this.render();
        break;
      }

      case "orchestrator.phase":
      case "agent.heartbeat": {
        const pct = Number(event.progress ?? event.data?.progress ?? 0);
        const phase = String(event.data?.phase ?? event.title ?? "");
        const orchestrator = this.cards.get("orchestrator");
        if (orchestrator) {
          orchestrator.progress = pct;
          if (phase) orchestrator.task = phase;
          this.render();
        }
        break;
      }

      case "researcher.found": {
        const title = String(event.data?.title ?? event.title ?? "");
        if (!this.cards.has("researcher")) {
          this.cards.set("researcher", {
            id: event.id,
            agent: "researcher",
            task: "Searching web",
            status: "running",
            started: new Date(),
            progress: 0,
            output: `Found: ${title.slice(0, 60)}`,
          });
        } else {
          const card = this.cards.get("researcher")!;
          card.output = `Found: ${title.slice(0, 60)}`;
        }
        this.render();
        break;
      }

      case "reasoner.insight": {
        const insight = String(event.data?.insight ?? "");
        const conf = Number(event.data?.confidence ?? 0);
        if (this.cards.has("reasoner")) {
          const card = this.cards.get("reasoner")!;
          card.output = `💡 ${insight.slice(0, 80)} (${(conf * 100).toFixed(0)}% conf)`;
        } else {
          this.cards.set("reasoner", {
            id: event.id,
            agent: "reasoner",
            task: "Reasoning",
            status: "running",
            started: new Date(),
            output: `💡 ${insight.slice(0, 80)}`,
          });
        }
        this.render();
        break;
      }

      case "agent.complete":
      case "orchestrator.complete":
      case "reasoner.complete":
      case "researcher.complete": {
        const card = this.cards.get(agent);
        if (card) {
          card.status = "completed";
          card.completedAt = new Date();
          card.progress = 100;
          this.render();
        }
        break;
      }

      case "agent.error":
      case "orchestrator.error": {
        const err = String((event.data as Record<string, unknown>)?.error ?? "Unknown error");
        this.cards.set(agent, {
          id: event.id,
          agent,
          task: "Error",
          status: "error",
          error: err.slice(0, 80),
          started: new Date(),
          completedAt: new Date(),
        });
        this.render();
        break;
      }

      default: {
        // connected and other non-agent events — ignore
        break;
      }
    }
  }

  private render() {
    if (this.cards.size === 0) return;

    // Erase previous cards
    if (!this.firstRender) {
      const totalLines = this.computeTotalLines();
      moveCursorUp(totalLines);
      eraseLines(totalLines);
    }
    this.firstRender = false;

    const activeCards = Array.from(this.cards.values()).filter(
      (c) => c.status === "running" || c.status === "pending",
    );
    if (activeCards.length === 0) {
      this.cards.clear();
      return;
    }

    let out = chalk.gray("┌" + "─".repeat(Math.min(this.W - 4, 60)) + "┐\n");
    for (const card of activeCards) {
      const icon = AGENT_ICONS[card.agent] ?? "⚙";
      const color = AGENT_COLORS[card.agent] ?? chalk.white;
      const label = AGENT_LABELS[card.agent] ?? card.agent;

      const taskText = card.task.length > 42 ? card.task.slice(0, 42) + "…" : card.task;
      const statusSym = card.status === "running" ? spin("") : thinking("");
      out += chalk.gray("│") + color(` ${icon} ${label.padEnd(12)}`) + chalk.gray(` ${statusSym}\n`);
      out += chalk.gray("│") + `   ${taskText}\n`;
      if (card.progress !== undefined && card.progress > 0) {
        out += chalk.gray("│") + `   ${progressBar(card.progress)} ${chalk.gray(card.progress + "%")}\n`;
      }
      if (card.output) {
        const outText = card.output.length > 50 ? card.output.slice(0, 50) + "…" : card.output;
        out += chalk.gray("│") + chalk.gray(`   ${outText}`) + "\n";
      }
      out += chalk.gray("├" + "─".repeat(Math.min(this.W - 4, 60)) + "┤\n");
    }
    out = out.slice(0, -1); // remove trailing newline from last border
    process.stdout.write(out + "\n");
  }

  private computeTotalLines(): number {
    let n = 0;
    for (const card of this.cards.values()) {
      if (card.status !== "running" && card.status !== "pending") continue;
      n += 1; // top border
      n += 1; // icon + label + status
      n += 1; // task
      if (card.progress !== undefined && card.progress > 0) n += 1; // progress bar
      if (card.output) n += 1;
      n += 1; // separator
    }
    return Math.max(0, n - 1);
  }

  clear() {
    const totalLines = this.computeTotalLines();
    if (totalLines > 0) {
      moveCursorUp(totalLines);
      eraseLines(totalLines);
    }
    this.cards.clear();
    this.firstRender = true;
  }

  isActive(): boolean {
    return Array.from(this.cards.values()).some(
      (c) => c.status === "running" || c.status === "pending",
    );
  }
}

// ─── Streaming response renderer ──────────────────────────────────────────────

class StreamingRenderer {
  private buffer = "";
  private lines = 0;
  private startY = 0;

  start() {
    this.buffer = "";
    this.lines = 0;
  }

  push(chunk: string) {
    this.buffer += chunk;
    process.stdout.write(chunk);
    const newLines = ansiLines(chunk);
    this.lines += newLines;
  }

  done() {
    // Ensure newline at end
    if (this.buffer.length > 0 && !this.buffer.endsWith("\n")) {
      process.stdout.write("\n");
      this.lines++;
    }
  }

  erase() {
    if (this.lines > 0) {
      moveCursorUp(this.lines);
      eraseLines(this.lines);
    }
    this.buffer = "";
    this.lines = 0;
  }
}

// ─── Main Chat REPL ────────────────────────────────────────────────────────────

export class ChatREPL {
  private rl!: readline.Interface;
  private running = false;
  private currentSessionId: string | null = null;
  private abortController: AbortController | null = null;
  private slashCommands: SlashCommand[];
  private cardRenderer = new AgentCardRenderer();
  private streamingRenderer = new StreamingRenderer();
  private history: Array<{ role: string; content: string }> = [];
  private historyIndex = -1;
  private prompt = " ";
  private inputBuffer = "";

  constructor() {
    this.slashCommands = buildSlashCommands(this);
    this.setupSignals();
  }

  // ── Public API used by slash commands ──────────────────────────────────────

  async runResearch(topic: string, keywords?: string[]): Promise<void> {
    clearLine();
    console.log();
    console.log(chalk.cyan.bold("  🔬 Starting research: ") + chalk.white(`"${topic}"`));
    console.log(chalk.gray("  ─".repeat(40)));

    // Start research via HTTP
    let sessionId: string;
    try {
      const res = await fetch(`${API_BASE}/api/research`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, keywords: keywords ?? [] }),
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`${res.status} ${err}`);
      }
      const data = await res.json() as { sessionId: string };
      sessionId = data.sessionId;
    } catch (e) {
      console.log(chalk.red(`\n  ✗ Failed to start research: ${(e as Error).message}`));
      console.log(chalk.gray(`  Is the API server running at ${API_BASE}?\n`));
      return;
    }

    this.currentSessionId = sessionId;
    console.log(chalk.gray(`  Session: ${sessionId}\n`));

    // Stream events
    await this.streamSession(sessionId);

    // Fetch final summary
    await this.printResearchSummary(sessionId);
    this.currentSessionId = null;
  }

  async showStats(): Promise<void> {
    clearLine();
    console.log();
    console.log(spin("  Fetching Knowledge Hub stats..."));
    try {
      const res = await fetch(`${API_BASE}/api/hub/stats`);
      if (!res.ok) throw new Error(`${res.status}`);
      const stats = await res.json() as {
        totalFindings: number;
        totalInsights: number;
        totalNodes: number;
        totalEdges: number;
        avgConfidence: number;
        totalSessions: number;
      };

      const W = Math.min(terminalWidth(), 60);
      const border = chalk.gray("─".repeat(W));
      console.log(chalk.cyan.bold("\n  📊 Knowledge Hub Stats"));
      console.log(border);
      const rows = [
        ["Findings", stats.totalFindings.toLocaleString()],
        ["Insights", stats.totalInsights.toLocaleString()],
        ["Sessions", stats.totalSessions.toLocaleString()],
        ["Graph nodes", stats.totalNodes.toLocaleString()],
        ["Graph edges", stats.totalEdges.toLocaleString()],
        ["Avg confidence", (stats.avgConfidence * 100).toFixed(1) + "%"],
      ];
      for (const [label, value] of rows) {
        console.log(`  ${chalk.white(label.padEnd(18))} ${chalk.green(value)}`);
      }
      console.log(border + "\n");
    } catch {
      console.log(chalk.red("\n  ✗ Failed to load stats. Is the API server running?\n"));
    }
  }

  async searchKB(query: string): Promise<void> {
    clearLine();
    console.log();
    console.log(spin(`  Searching: "${query}"...`));
    try {
      const res = await fetch(
        `${API_BASE}/api/hub/search?q=${encodeURIComponent(query)}&limit=5`,
      );
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json() as { nodes: unknown[]; total: number };
      if (data.nodes.length === 0) {
        console.log(chalk.yellow(`\n  No results for "${query}".\n`));
        return;
      }
      console.log(chalk.cyan.bold(`\n  🔍 Results for "${query}" (${data.total} total)`));
      for (const node of data.nodes as Array<{ title?: string; type?: string; summary?: string }>) {
        console.log(`  • ${chalk.white(node.title ?? "Untitled")} ${chalk.gray(`[${node.type ?? "node"}]`)}`);
        if (node.summary) console.log(chalk.gray(`    ${(node.summary as string).slice(0, 80)}…`));
      }
      console.log();
    } catch {
      console.log(chalk.red("\n  ✗ Search failed.\n"));
    }
  }

  async listSessions(): Promise<void> {
    clearLine();
    console.log();
    console.log(spin("  Loading sessions..."));
    try {
      const res = await fetch(`${API_BASE}/api/sessions?limit=10`);
      if (!res.ok) throw new Error(`${res.status}`);
      const sessions = await res.json() as Array<{
        id: string;
        topic: string;
        status: string;
        createdAt: string;
      }>;
      if (sessions.length === 0) {
        console.log(chalk.yellow("\n  No sessions yet.\n"));
        return;
      }
      console.log(chalk.cyan.bold("\n  📋 Recent Sessions"));
      console.log(chalk.gray("  ─".repeat(50)));
      for (const s of sessions) {
        const statusColor = s.status === "completed" ? chalk.green
          : s.status === "running" ? chalk.cyan
          : chalk.gray;
        const date = new Date(s.createdAt).toLocaleDateString();
        console.log(
          `  ${chalk.white(s.id.slice(0, 8))} ${statusColor(s.status.padEnd(12))}` +
          ` ${date}  ${chalk.gray(s.topic.slice(0, 40))}`,
        );
      }
      console.log();
    } catch {
      console.log(chalk.red("\n  ✗ Failed to load sessions.\n"));
    }
  }

  clearHistory() {
    this.history = [];
    this.historyIndex = -1;
  }

  printHelp() {
    clearLine();
    console.log();
    console.log(chalk.cyan.bold("  ORIN Chat — Commands"));
    console.log(chalk.gray("  ─".repeat(50)));
    const W = Math.min(terminalWidth(), 60);
    const pad = (s: string, n: number) => s.padEnd(n);
    console.log(`  ${chalk.white("/research <topic>")}   Start a deep research session`);
    console.log(`  ${chalk.white("/stats")}               Knowledge Hub statistics`);
    console.log(`  ${chalk.white("/kb <query>")}           Search the knowledge base`);
    console.log(`  ${chalk.white("/sessions")}             List recent sessions`);
    console.log(`  ${chalk.white("/clear")}               Clear chat history`);
    console.log(`  ${chalk.white("/help")}                Show this help`);
    console.log(`  ${chalk.white("/exit")}                Exit ORIN`);
    console.log();
    console.log(chalk.gray("  Or just type a question — I'll route it automatically.\n"));
  }

  // ── Stream session events ────────────────────────────────────────────────────

  private async streamSession(sessionId: string): Promise<void> {
    this.abortController = new AbortController();

    const streamEvents = async () => {
      try {
        const esRes = await fetch(`${API_BASE}/api/events/${sessionId}/stream`, {
          signal: this.abortController?.signal ?? new AbortController().signal,
        });
        if (!esRes.ok || !esRes.body) {
          throw new Error(`SSE failed: ${esRes.status}`);
        }

        const reader = esRes.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";

          for (const part of parts) {
            const lines = part.split("\n");
            let dataStr = "";
            for (const line of lines) {
              if (line.startsWith("data:")) {
                dataStr = line.slice(5).trim();
              }
            }
            if (!dataStr) continue;

            try {
              const event = JSON.parse(dataStr) as Partial<AgentEvent> & { type: string; error?: string };
              this.cardRenderer.update(event as AgentEvent);
            } catch {
              // skip malformed
            }
          }
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          // silently ignore abort
        }
      }
    };

    // Also poll for completion
    const poll = async (): Promise<boolean> => {
      try {
        const res = await fetch(`${API_BASE}/api/research/${sessionId}`);
        if (!res.ok) return false;
        const data = await res.json() as { status: string };
        return data.status === "completed" || data.status === "failed";
      } catch {
        return false;
      }
    };

    // Run stream + poll concurrently
    const pollInterval = setInterval(async () => {
      if (await poll()) {
        clearInterval(pollInterval);
        this.abortController?.abort();
        this.cardRenderer.clear();
      }
    }, 3000);

    await streamEvents();
    clearInterval(pollInterval);
    this.cardRenderer.clear();
  }

  private async printResearchSummary(sessionId: string): Promise<void> {
    try {
      const res = await fetch(`${API_BASE}/api/research/${sessionId}`);
      if (!res.ok) return;
      const data = await res.json() as {
        status: string;
        findings?: unknown[];
        insights?: unknown;
        error?: string;
      };

      if (data.status === "failed") {
        console.log(chalk.red(`\n  ✗ Research failed: ${data.error ?? "Unknown error"}\n`));
        return;
      }

      const findings = data.findings ?? [];
      const insightCount = (data.insights as { insights?: unknown[] })?.insights?.length ?? 0;

      console.log();
      console.log(chalk.green.bold("  ✅ Research complete!"));
      console.log(chalk.gray("  ─".repeat(40)));
      console.log(`  ${chalk.white("Findings:")}  ${chalk.green(findings.length)}`);
      console.log(`  ${chalk.white("Insights:")} ${chalk.green(insightCount)}`);
      console.log(`  ${chalk.white("Session:")}  ${chalk.gray(sessionId)}`);
      console.log();
    } catch {
      // ignore
    }
  }

  // ── REPL setup ──────────────────────────────────────────────────────────────

  private setupSignals() {
    // Handle Ctrl+C gracefully
    process.on("SIGINT", () => {
      if (this.abortController) {
        this.abortController.abort();
        clearLine();
        console.log(chalk.yellow("\n  ⚠  Cancelled. Type /exit to quit.\n"));
        this.promptUser();
      } else {
        clearLine();
        console.log(chalk.gray("\n  Use /exit to quit ORIN.\n"));
        this.promptUser();
      }
    });

    // Make readline handle raw mode ourselves
    readline.emitKeypressEvents(process.stdin);

    if (process.stdin.isTTY) {
      (process.stdin as any).setRawMode?.(true);
    }
  }

  async start() {
    // Greeting
    printMiniLogo();

    const W = Math.min(terminalWidth(), 60);
    console.log(chalk.gray("─".repeat(W)));
    console.log();
    console.log(`  ${chalk.cyan.bold("ORIN")} ${chalk.gray("·")} Multi-Agent Research Engine`);
    console.log(`  ${chalk.gray("Type /help for commands, or just ask a question.")}`);
    console.log();
    console.log(chalk.gray("─".repeat(W)));
    console.log();

    this.running = true;

    // Tab-complete for slash commands
    const completions = [
      "/research",
      "/stats",
      "/kb",
      "/sessions",
      "/clear",
      "/help",
      "/exit",
    ];

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: chalk.cyan("  orin > "),
      completer: (line: string) => {
        const hits = completions.filter((c) => c.startsWith(line.toLowerCase()));
        return [hits.length ? hits : completions, line];
      },
      historySize: 100,
    });

    this.rl.on("line", (line) => this.handleLine(line));
    this.rl.on("close", () => {
      console.log(chalk.gray("\n  Goodbye!\n"));
      process.exit(0);
    });

    this.promptUser();
  }

  private promptUser() {
    if (!this.running) return;
    this.rl?.prompt();
  }

  private async handleLine(rawLine: string) {
    const line = rawLine.trim();

    // History navigation
    if (line) {
      this.history.unshift({ role: "user", content: line });
      if (this.history.length > 100) this.history.pop();
    }
    this.historyIndex = -1;

    if (!line) {
      this.promptUser();
      return;
    }

    // Echo user message
    console.log(chalk.white(`  you  │ ${line}`));
    console.log();

    // Handle slash commands
    if (line.startsWith("/")) {
      const [cmdName, ...argParts] = line.slice(1).split(/\s+/);
      const args = argParts.join(" ");
      const matched = this.slashCommands.find(
        (c) => c.name === cmdName.toLowerCase() || c.aliases.includes(cmdName.toLowerCase()),
      );
      if (matched) {
        await matched.run(args, this);
      } else {
        console.log(
          chalk.yellow(`  Unknown command: /${cmdName}. Type /help for available commands.\n`),
        );
      }
      this.promptUser();
      return;
    }

    // Plain text → smart routing
    await this.handlePlainInput(line);
    this.promptUser();
  }

  private async handlePlainInput(input: string) {
    const lower = input.toLowerCase();
    const researchTriggers = [
      "research", "find", "analyze", "investigate", "study",
      "explore", "look up", "search for", "what is", "how does",
      "explain", "compare", "difference between", "rag", "llm",
      "ai ", "agent", "model",
    ];

    if (researchTriggers.some((t) => lower.includes(t))) {
      console.log(
        chalk.cyan("  I&apos;ll start a research session on that. Use ") +
        chalk.white("/research ") +
        chalk.cyan("to refine the topic.\n"),
      );
      await this.runResearch(input);
    } else {
      this.printWelcome();
    }
  }

  private printWelcome() {
    const W = Math.min(terminalWidth(), 60);
    console.log(chalk.gray("─".repeat(W)));
    console.log(`  I'm a research assistant. Try:`);
    console.log(`  ${chalk.cyan("/research <topic>")}  Start deep research`);
    console.log(`  ${chalk.cyan("/stats")}              Check Knowledge Hub`);
    console.log(`  ${chalk.cyan("/kb <query>")}          Search stored findings`);
    console.log(`  ${chalk.cyan("/help")}               All commands`);
    console.log(chalk.gray("─".repeat(W)) + "\n");
  }
}

// ─── Start ────────────────────────────────────────────────────────────────────

export async function startChat(): Promise<void> {
  const repl = new ChatREPL();
  await repl.start();
}
