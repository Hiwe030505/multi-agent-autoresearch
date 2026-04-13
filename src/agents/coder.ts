/**
 * Coder Agent — Senior Software Engineer
 *
 * Capabilities:
 * - Code generation (Python, TypeScript, Go, Rust, etc.)
 * - Unit test writing
 * - Code review
 * - Debug and fix
 * - API design
 */

import { claudeChat } from "./lib/claude.ts";
import { config } from "../config.ts";
import type { Finding } from "../types.ts";

export interface CodeResult {
  code: string;
  language: string;
  explanation: string;
  tests?: string;
  files: Array<{ name: string; content: string }>;
  quality: number;
}

const SYSTEM_PROMPT = `Bạn là Senior Software Engineer với 15 năm kinh nghiệm.
Bạn viết code sạch, hiệu quả, có documentation, và có unit tests.
Luôn tuân thủ best practices cho từng ngôn ngữ.
Code phải production-ready, không phải prototype.`;

const CODE_GENERATION_PROMPT = `You are generating production-ready code based on research findings.

Research context:
{research_context}

Task: {task}
Language preference: {language}
Additional requirements: {requirements}

Output a JSON object:
{{
  "code": "full code implementation",
  "language": "python|typescript|go|rust",
  "explanation": "how the code works and why this approach was chosen",
  "tests": "corresponding unit tests (if applicable)",
  "files": [
    {{"name": "filename.ext", "content": "file content"}}
  ],
  "quality": 0.0-1.0 confidence in correctness
}}

IMPORTANT:
- Include imports and dependencies
- Add inline comments for complex logic
- Handle errors gracefully
- Write actual runnable code, not pseudocode`;

export async function generateCode(
  task: string,
  findings: Finding[] = [],
  language = "python",
  requirements = "None",
): Promise<CodeResult> {
  const researchCtx = findings
    .slice(0, 5)
    .map((f) => `• ${f.title}: ${f.summary ?? f.content.slice(0, 200)}`)
    .join("\n");

  const response = await claudeChat(
    [{
      role: "user",
      content: CODE_GENERATION_TEMPLATE
        .replace("{research_context}", researchCtx || "No specific research context")
        .replace("{task}", task)
        .replace("{language}", language)
        .replace("{requirements}", requirements),
    }],
    SYSTEM_PROMPT,
    config.models.coder,
    4096,
  );

  const parsed = parseCodeResponse(response.content);
  return parsed;
}

const CODE_GENERATION_TEMPLATE = `You are generating production-ready code based on research findings.

Research context:
{research_context}

Task: {task}
Language preference: {language}
Additional requirements: {requirements}

Output a JSON object with the following structure:
{
  "code": "full code implementation",
  "language": "python|typescript|go|rust",
  "explanation": "how the code works and why this approach was chosen",
  "tests": "corresponding unit tests (if applicable)",
  "files": [
    {"name": "filename.ext", "content": "file content"}
  ],
  "quality": 0.0-1.0 confidence in correctness
}

IMPORTANT:
- Include all imports and dependencies
- Add inline comments for complex logic
- Handle errors gracefully
- Write actual runnable code, not pseudocode
- Code must be production-ready`;

export async function reviewCode(
  code: string,
  language = "python",
): Promise<{ issues: string[]; suggestions: string[]; score: number }> {
  const response = await claudeChat(
    [{
      role: "user",
      content: `Review this ${language} code for correctness, style, security, and performance issues.

Code:
\`\`\`${language}
${code}
\`\`\`

Return a JSON object:
{
  "issues": ["list of specific issues found"],
  "suggestions": ["list of specific improvement suggestions"],
  "score": 0-100 overall quality score
}`,
    }],
    "You are a senior code reviewer. Be thorough, specific, and constructive.",
    config.models.coder,
    2048,
  );

  try {
    const match = response.content.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      return {
        issues: Array.isArray(parsed.issues) ? parsed.issues : [],
        suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
        score: typeof parsed.score === "number" ? parsed.score : 70,
      };
    }
  } catch {}

  return { issues: [], suggestions: [], score: 70 };
}

export async function debugAndFix(
  code: string,
  error: string,
  language = "python",
): Promise<{ fixedCode: string; explanation: string }> {
  const response = await claudeChat(
    [{
      role: "user",
      content: `Debug and fix this ${language} code that has an error.

Error message:
${error}

Code:
\`\`\`${language}
${code}
\`\`\`

Return a JSON object:
{
  "fixedCode": "corrected code",
  "explanation": "root cause of the error and what was fixed"
}`,
    }],
    "You are a senior software engineer debugging code.",
    config.models.coder,
    2048,
  );

  try {
    const match = response.content.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      return {
        fixedCode: parsed.fixedCode ?? code,
        explanation: parsed.explanation ?? "Fixed",
      };
    }
  } catch {}

  return { fixedCode: code, explanation: "No fixes applied" };
}

function parseCodeResponse(content: string): CodeResult {
  try {
    const match = content.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      return {
        code: parsed.code ?? "",
        language: parsed.language ?? "python",
        explanation: parsed.explanation ?? "",
        tests: parsed.tests,
        files: Array.isArray(parsed.files) ? parsed.files : [],
        quality: typeof parsed.quality === "number" ? parsed.quality : 0.7,
      };
    }
  } catch {}

  return {
    code: content,
    language: "python",
    explanation: "Parse failed, returning raw content",
    files: [],
    quality: 0.5,
  };
}
