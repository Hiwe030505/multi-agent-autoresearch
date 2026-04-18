/**
 * ORIN CLI Logo — ASCII Block Letters
 *
 * chalk v5 requires .level=3 for hex() color support.
 * The chalk import fix is applied at usage site (index.ts).
 */

import chalkOrig from "chalk";

if (process.stdout.isTTY) chalkOrig.level = 3;
const chalk = chalkOrig;

const A  = chalk.hex("#d97757");
const AB = A.bold;
const D  = chalk.gray;

const INNER = 68;

// ─── Block letters (5 rows each) ──────────────────────────────────────────────
// O(12) + R(12) + I(5) + N(12) = 41 chars
// PAD(9) + O(12) + SP + R(12) + SP + I(5) + SP + N(12) + PAD(15) = 68 ✓

const O: [string, string, string, string, string] = [
  "████████████",   // 12
  "████    ████",   // 12
  "████    ████",   // 12
  "████    ████",   // 12
  "████████████",   // 12
];

const R: [string, string, string, string, string] = [
  "████████████",   // 12
  "████    ████",   // 12
  "████████████",   // 12
  "████  ████  ",   // 12
  "████    ████",   // 12
];

const I: [string, string, string, string, string] = [
  "█████",          // 5
  " ███ ",          // 5
  " ███ ",
  " ███ ",
  "█████",
];

const N: [string, string, string, string, string] = [
  "████████████",   // 12
  "█████   ████",   // 12
  "████    ████",   // 12
  "████   █████",   // 12
  "████████████",   // 12
];

// ─── Row builder ──────────────────────────────────────────────────────────────

function buildRow(o: string, r: string, i: string, n: string): string {
  return " ".repeat(9) + o + " " + r + " " + i + " " + n + " ".repeat(15);
}

// ─── Main logo ────────────────────────────────────────────────────────────────

export function printLogo() {
  const lTop  = `${A("  ┌")}`;
  const lBot  = `${A("  └")}`;
  const lMid  = `${A("  │")}`;
  const rTop  = `${A("┐")}`;
  const rBot  = `${A("┘")}`;
  const rMid  = `${A("│")}`;
  const hline = "─".repeat(INNER);

  console.log();
  console.log(`${lTop}${hline}${rTop}`);

  for (let row = 0; row < 5; row++) {
    const row_ = buildRow(O[row]!, R[row]!, I[row]!, N[row]!);
    console.log(`${lMid}${row_}${rMid}`);
  }

  console.log(`${lMid}${" ".repeat(INNER)}${rMid}`);

  const TAG = "M U L T I - A G E N T   R E S E A R C H   E N G I N E";
  const pad = INNER - TAG.length;
  const tagRow = " ".repeat(Math.floor(pad / 2)) + TAG + " ".repeat(Math.ceil(pad / 2));
  console.log(`${lMid}${tagRow}${rMid}`);

  console.log(`${lBot}${hline}${rBot}`);
  console.log();
  console.log(`  ${D("Multi-Agent Research Engine")}  ${A("·")}  ${D("7 Specialized AI Agents  ·  Powered by AI")}`);
  console.log();
}

// ─── Mini logo ────────────────────────────────────────────────────────────────

export function printMiniLogo() {
  const W = 46;
  const inner = W - 2;

  console.log();
  console.log(`${A("  ┌" + "─".repeat(inner) + "┐")}`);
  console.log(
    `${A("  │")}${" ".repeat(9)}${AB("ORIN")}${" ".repeat(10)}${D("Multi-Agent Research Engine")}${" ".repeat(9)}${A("│")}`,
  );
  console.log(`${A("  └" + "─".repeat(inner) + "┘")}`);
  console.log();
}
