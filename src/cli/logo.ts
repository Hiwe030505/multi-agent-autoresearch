/**
 * AutoResearch CLI Logo
 * Rendered in ASCII art when CLI starts.
 * Accent color: terracotta/clay (#d97757)
 */

import chalk from "chalk";

export function printLogo() {
  // Using chalk with hex color support
  const accent = chalk.hex("#d97757");
  const dim = chalk.gray;

  const logo = `
${accent("       ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓")}
${accent("       ┃")}  ${accent.bold("██╗   ██╗ ██████╗ ██████╗ ███████╗███████╗██╗     ")}  ${accent("┃")}
${accent("       ┃")}  ${accent.bold("██║   ██║██╔═══██╗██╔══██╗██╔════╝██╔════╝██║     ")}  ${accent("┃")}
${accent("       ┃")}  ${accent.bold("██║   ██║██║   ██║██║  ██║█████╗  ███████╗██║     ")}  ${accent("┃")}
${accent("       ┃")}  ${accent.bold("╚██╗ ██╔╝██║   ██║██║  ██║██╔══╝  ╚════██║██║     ")}  ${accent("┃")}
${accent("       ┃")}  ${accent.bold(" ╚████╔╝ ╚██████╔╝██████╔╝███████╗███████║███████╗")}  ${accent("┃")}
${accent("       ┃")}  ${accent.bold("  ╚═══╝   ╚═════╝ ╚═════╝ ╚══════╝╚══════╝╚══════╝")}  ${accent("┃")}
${accent("       ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛")}

  ${dim("Multi-Agent Research Engine")}  ${accent("·")}  ${dim("Powered by AI agents")}

  ${chalk.hex("#38bdf8")("🔍")} Researcher   ${chalk.hex("#c084fc")("🧠")} Reasoner   ${chalk.hex("#34d399")("📊")} Analyst
  ${chalk.hex("#fbbf24")("✍")} Writer      ${chalk.hex("#f87171")("🔎")} Reviewer   ${chalk.hex("#a78bfa")("💻")} Coder
`;

  console.log(logo);
}

export function printMiniLogo() {
  const accent = chalk.hex("#d97757");
  console.log(`${accent("█▀▀ ▄▀▄ █▀▀ █ █ █▀█ █▀▀ █▀█ ▄▀▄")}   ${chalk.gray("Multi-Agent Research Engine")}`);
}
