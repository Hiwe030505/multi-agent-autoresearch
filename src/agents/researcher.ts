import { v4 as uuidv4 } from "uuid";
import { claudeChat } from "./lib/claude.ts";
import { config } from "../config.ts";
import { webSearch } from "../hub/search.ts";
import { parseJson } from "../utils/json.ts";
import type { Finding, KeyFinding, SourceType } from "../types.ts";

const PAPER_SUMMARY_PROMPT = `You are summarizing research sources for a research team.

Title: {title}
Source URL: {url}
Content/snippets: {content}

Extract and summarize in JSON format:
{{
  "title": "cleaned title",
  "key_findings": [
    {{ "finding": "specific finding", "evidence": "specific evidence from source", "confidence": 0.0-1.0 }}
  ],
  "summary": "2-3 sentence summary of the main contribution",
  "questions_raised": ["question raised by this source"],
  "source_type": "paper|web"
}}

Focus on specific, verifiable claims. Do not invent details not present in the content.`;

export interface ResearchResult {
  sources: Finding[];
  queries: string[];  // search queries used
}

/**
 * Main research function — searches the web for real papers and sources,
 * then summarizes each source into structured findings.
 */
export async function research(
  topic: string,
  keywords: string[] = [],
  maxSources = 10,
): Promise<ResearchResult> {
  const kw = keywords.length ? keywords.join(", ") : topic;

  // ─── Step 1: Real web search ──────────────────────────────────────────────
  console.log(`[Researcher] Searching the web for: "${topic}"...`);

  const searchQueries = buildSearchQueries(topic, keywords);
  const searchResults = await Promise.all(
    searchQueries.map((q) => webSearch(q, { maxResults: 5 })),
  );

  const allSearchResults = searchResults
    .flatMap((r) => r.results)
    .filter((r) => r.url && r.title);

  console.log(`[Researcher] Found ${allSearchResults.length} sources (provider: ${searchResults[0]?.provider ?? "unknown"})`);

  if (allSearchResults.length === 0) {
    console.warn("[Researcher] No real sources found — falling back to LLM analysis");
    return fallbackResearch(topic, kw);
  }

  // ─── Step 2: Summarize each source into structured findings ───────────────
  const findings: Finding[] = [];
  const seen = new Set<string>();

  for (const src of allSearchResults) {
    if (seen.has(src.url) || findings.length >= maxSources) continue;
    seen.add(src.url);

    try {
      const finding = await summarizeSource(src, topic, keywords);
      if (finding) {
        findings.push(finding);
      }
    } catch (e) {
      console.error(`[Researcher] Failed to summarize: ${src.title}`, e);
    }
  }

  return {
    sources: findings,
    queries: searchQueries,
  };
}

// ─── Summarize a single source into a Finding ─────────────────────────────────

async function summarizeSource(
  src: { title: string; url: string; snippet: string; source: string; authors?: string[]; year?: number },
  topic: string,
  keywords: string[],
): Promise<Finding | null> {
  const prompt = PAPER_SUMMARY_PROMPT
    .replace("{title}", src.title)
    .replace("{url}", src.url)
    .replace("{content}", src.snippet || "(no preview available)");

  const response = await claudeChat(
    [{ role: "user", content: prompt }],
    "You are a precise research analyst. Extract factual information only. Do not invent or hallucinate details.",
    config.models.research,
    2048,
  );

  const result = parseJson<{
    title?: string;
    key_findings?: Array<{ finding: string; evidence?: string; confidence?: number }>;
    summary?: string;
    questions_raised?: string[];
    source_type?: string;
  }>(response.content);

  const parsed = result.data ?? {};

  const rawFindings: Array<{ finding: string; evidence?: string; confidence?: number }> =
    Array.isArray(parsed.key_findings) ? parsed.key_findings : [];
  const keyFindings: KeyFinding[] = rawFindings
    .filter((k) => k.finding && k.evidence)
    .map((k) => ({
      finding: k.finding,
      evidence: k.evidence ?? "",
      confidence: typeof k.confidence === "number" ? k.confidence : 0.7,
    }));

  if (keyFindings.length === 0 && !src.snippet) {
    return null; // nothing useful to extract
  }

  return {
    id: uuidv4(),
    topic,
    sourceUrl: src.url || undefined,
    sourceType: (src.source === "arxiv" || src.source === "semantic_scholar") ? "paper" : "web",
    title: (parsed.title as string | undefined) ?? src.title,
    content: keyFindings.map((k) => `${k.finding} [${k.evidence}]`).join("\n") || src.snippet,
    summary: (parsed.summary as string | undefined) ?? src.snippet.slice(0, 300),
    confidence: 0.7,
    createdBy: "researcher",
    createdAt: new Date().toISOString(),
    verified: false,
    tags: keywords,
    keyFindings: keyFindings,
    questionsRaised: (parsed.questions_raised as string[] | undefined) ?? [],
    connections: [],
    metadata: {
      searchProvider: src.source,
      searchSnippet: src.snippet,
      authors: src.authors,
      year: src.year,
    },
  };
}

// ─── Build search queries from topic + keywords ─────────────────────────────────

function buildSearchQueries(topic: string, keywords: string[]): string[] {
  const queries: string[] = [topic];

  if (keywords.length > 0) {
    queries.push(...keywords.slice(0, 3).map((k) => `${topic} ${k}`));
  }

  // Add academic variations
  queries.push(`${topic} research paper survey`);
  queries.push(`${topic} state of the art 2025 2026`);

  return [...new Set(queries)].slice(0, 5);
}

// ─── Fallback: LLM analyzes topic directly (no real sources) ──────────────────

async function fallbackResearch(topic: string, kw: string): Promise<ResearchResult> {
  console.warn("[Researcher] ⚠️ Using LLM fallback — no real web search available.");
  console.warn("[Researcher] To enable real search: set TAVILY_API_KEY in .env");

  const response = await claudeChat(
    [{
      role: "user",
      content: `Provide a structured analysis of the research topic: "${topic}"

For each point, clearly distinguish between:
- KNOWN FACTS: things well-established in the research community
- INFERRED PATTERNS: reasonable extrapolations based on your knowledge
- SPECULATIVE: hypotheses that need verification

Format as JSON:
{
  "key_findings": [
    { "finding": "...", "type": "known|inferred|speculative", "confidence": 0.0-1.0, "evidence": "..." }
  ],
  "summary": "2-3 sentence overview",
  "questions_raised": ["..."]
}`,
    }],
    "You are a research analyst. Be precise about what is factual vs speculative.",
    config.models.research,
    2048,
  );

  const result = parseJson<{
    key_findings?: Array<{ finding: string; type?: string; evidence?: string; confidence?: number }>;
    summary?: string;
    questions_raised?: string[];
  }>(response.content);

  const rawKF: Array<{ finding: string; type?: string; evidence?: string; confidence?: number }> =
    Array.isArray(result.data?.key_findings) ? result.data.key_findings : [];
  const keyFindings: KeyFinding[] = rawKF.map((k): KeyFinding => ({
    finding: k.finding,
    evidence: k.evidence ?? (k.type === "known" ? "Established knowledge" : "LLM inference — verify independently"),
    confidence: typeof k.confidence === "number" ? k.confidence : 0.6,
  }));

  return {
    sources: [{
      id: uuidv4(),
      topic,
      sourceUrl: undefined,
      sourceType: "internal",
      title: `Research Analysis: ${topic}`,
      content: keyFindings.map((k) => `${k.finding} [${k.evidence}]`).join("\n"),
      summary: result.data?.summary ?? response.content.slice(0, 400),
      confidence: 0.6,
      createdBy: "researcher",
      createdAt: new Date().toISOString(),
      verified: false,
      tags: [kw],
      keyFindings: keyFindings,
      questionsRaised: Array.isArray(result.data?.questions_raised) ? result.data.questions_raised : [],
      connections: [],
      metadata: {
        _fallback: true,
        note: "No real sources found. Verify all claims independently.",
      },
    }],
    queries: [topic],
  };
}

// ─── Summarize findings for Reasoning Agent ────────────────────────────────────

export async function summarizeForReasoning(findings: Finding[]): Promise<string> {
  const summaries = findings.map((f, i) =>
    `[${i + 1}] "${f.title}"${f.sourceUrl ? ` (${f.sourceUrl})` : ""}
  Summary: ${f.summary ?? f.content.slice(0, 200)}
  Key findings: ${(f.keyFindings ?? []).map((k) => `- ${k.finding} (${k.evidence})`).join("\n  ")}`
  ).join("\n\n");

  return `=== RESEARCH FINDINGS (${findings.length} sources) ===\n\n${summaries}\n\n=== END OF FINDINGS ===`;
}
