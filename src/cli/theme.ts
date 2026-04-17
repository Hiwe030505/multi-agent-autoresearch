/**
 * CLI Theme — Terminal styling with chalk
 */
import chalk from "chalk";

export const theme = {
  // Branding
  brand: chalk.blue("[AutoResearch]"),
  brandBold: chalk.blue.bold,

  // Status
  success: chalk.green,
  warning: chalk.yellow,
  error: chalk.red,
  info: chalk.cyan,
  muted: chalk.gray,

  // Phases
  phase: {
    research: chalk.cyan,
    reasoning: chalk.magenta,
    writing: chalk.blue,
    reviewing: chalk.yellow,
    completed: chalk.green,
  },

  // Agents
  agent: {
    orchestrator: chalk.blue.bold,
    researcher: chalk.cyan,
    reasoner: chalk.magenta,
    analyst: chalk.green,
    writer: chalk.yellow,
    reviewer: chalk.red,
    coder: chalk.gray,
    "graph-builder": chalk.cyanBright,
  },

  // Insight types
  insight: {
    synthesis: chalk.green("[SYN]"),
    contradiction: chalk.red("[CON]"),
    gap: chalk.yellow("[GAP]"),
    transfer: chalk.cyan("[TRN]"),
    failure: chalk.red("[FLR]"),
    temporal: chalk.blue("[TMP]"),
  },

  // Confidence
  confidence(pct: number): string {
    if (pct >= 0.85) return chalk.green(`${(pct * 100).toFixed(0)}%`);
    if (pct >= 0.7) return chalk.yellow(`${(pct * 100).toFixed(0)}%`);
    return chalk.red(`${(pct * 100).toFixed(0)}%`);
  },

  // Section divider
  divider(char = "─", length = 60): string {
    return chalk.gray(char.repeat(length));
  },

  // Box
  box(text: string, color = chalk.blue): string {
    const lines = text.split("\n");
    const maxLen = Math.max(...lines.map((l) => l.length));
    const border = "─".repeat(maxLen + 2);
    return [
      color(`┌${border}┐`),
      ...lines.map((l) => color(`│ ${l.padEnd(maxLen)} │`)),
      color(`└${border}┘`),
    ].join("\n");
  },
};
