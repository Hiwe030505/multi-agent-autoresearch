import { v4 as uuidv4 } from "uuid";
import { claudeChat } from "./lib/claude.ts";
import { config } from "../config.ts";
import type { Finding, KeyFinding, SourceType } from "../types.ts";

const WEB_SEARCH_PROMPT = `You are a Senior Research Agent. Given a research topic and keywords, find the most relevant papers, articles, and resources.

Research Topic: {topic}
Keywords: {keywords}

Search strategies to use:
1. arXiv (arxiv.org) for academic papers
2. Google Scholar for citations
3. Semantic Scholar for related work
4. Papers With Code for implementations
5. Hugging Face Papers for recent ML research

For each source found, extract:
1. Title and authors
2. Key findings (bullet points)
3. Methodology (if applicable)
4. Limitations
5. Questions it raises

Format output as JSON:
{{
  "sources": [
    {{
      "title": "...",
      "url": "...",
      "source_type": "paper|web",
      "key_findings": [
        {{ "finding": "...", "evidence": "...", "confidence": 0.9 }}
      ],
      "summary": "2-3 sentences",
      "questions_raised": ["..."],
      "confidence": 0.8
    }}
  ]
}}

IMPORTANT:
- Find at least 5 high-quality sources
- Prioritize recent papers (2022-2026)
- Include at least 2 arXiv papers if available
- Each finding must have specific evidence
`;

const PAPER_SUMMARY_PROMPT = `You are summarizing a research paper for a research team.

Title: {title}
Content: {content}

Extract and summarize:
1. Research Question: What problem does this paper solve?
2. Methodology: How did they approach it?
3. Key Findings: 3-5 specific results
4. Limitations: What are the weaknesses?
5. Questions Raised: What does this leave unanswered?

Also identify:
- Connections to other research areas
- Potential applications
- Interesting contradictions with common beliefs

Format as structured JSON with all fields.
`;

export interface ResearchResult {
  sources: Finding[];
  queries: string[];  // search queries used
}

export async function research(
  topic: string,
  keywords: string[] = [],
  maxSources = 10,
): Promise<ResearchResult> {
  const kw = keywords.length ? keywords.join(", ") : topic;

  // Step 1: Web search via LLM (simulate web search since we don't have live access)
  const searchResponse = await claudeChat(
    [{ role: "user", content: WEB_SEARCH_PROMPT.replace("{topic}", topic).replace("{keywords}", kw) }],
    undefined,
    config.models.research,
    2048,
  );

  // Parse search results
  let parsed: { sources: any[] } = { sources: [] };
  try {
    const jsonMatch = searchResponse.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const potential = JSON.parse(jsonMatch[0]);
      // Handle both { sources: [...] } and [ { ... }, { ... } ]
      if (Array.isArray(potential)) parsed = { sources: potential };
      else if (Array.isArray(potential.sources)) parsed = potential;
      else if (Array.isArray(potential.findings)) parsed = { sources: potential.findings };
      else if (Array.isArray(potential.papers)) parsed = { sources: potential.papers };
    }
  } catch {
    // Fallback below
  }

  // Fallback: if no sources found, treat raw response as one finding
  if (parsed.sources.length === 0) {
    parsed.sources = [{
      title: `Research on: ${topic}`,
      url: "",
      source_type: "web",
      key_findings: [{ finding: searchResponse.content.slice(0, 800), evidence: "LLM comprehensive analysis", confidence: 0.75 }],
      summary: searchResponse.content.slice(0, 400),
      questions_raised: [],
      confidence: 0.75,
    }];
  }

  // Step 2: Generate detailed summaries for each source
  const findings: Finding[] = [];
  for (const src of parsed.sources.slice(0, maxSources)) {
    try {
      const summaryResponse = await claudeChat(
        [
          {
            role: "user",
            content: PAPER_SUMMARY_PROMPT
              .replace("{title}", src.title ?? "")
              .replace("{content}", src.key_findings?.map((k: any) => `${k.finding} (${k.evidence})`).join("\n") ?? src.summary ?? ""),
          },
        ],
        undefined,
        config.models.research,
        2048,
      );

      let summaryData: any = { key_findings: src.key_findings ?? [], questions_raised: src.questions_raised ?? [] };
      try {
        const sm = summaryResponse.content.match(/\{[\s\S]*\}/);
        if (sm) summaryData = { ...summaryData, ...JSON.parse(sm[0]) };
      } catch {}

      const finding: Finding = {
        id: uuidv4(),
        topic,
        sourceUrl: src.url ?? null,
        sourceType: (src.source_type ?? "web") as SourceType,
        title: src.title ?? topic,
        content: src.key_findings?.map((k: any) => `${k.finding} [${k.evidence}]`).join("\n") ?? searchResponse.content,
        summary: summaryData.summary ?? src.summary ?? summaryResponse.content.slice(0, 300),
        confidence: src.confidence ?? 0.7,
        createdBy: "researcher",
        createdAt: new Date().toISOString(),
        verified: false,
        tags: keywords,
        keyFindings: summaryData.key_findings ?? src.key_findings ?? [],
        questionsRaised: summaryData.questions_raised ?? src.questions_raised ?? [],
        connections: [],
        metadata: {
          searchQuery: topic,
          keyFindingsCount: (summaryData.key_findings ?? src.key_findings ?? []).length,
        },
      };

      findings.push(finding);
    } catch (e) {
      console.error(`Failed to summarize source: ${src.title}`, e);
    }
  }

  return {
    sources: findings,
    queries: [topic, ...keywords],
  };
}

// ─── Summarize findings for Reasoning Agent ────────────────────────────────────

export async function summarizeForReasoning(findings: Finding[]): Promise<string> {
  const summaries = findings.map((f, i) =>
    `[${i + 1}] "${f.title}"\n  Summary: ${f.summary ?? f.content.slice(0, 200)}\n  Key findings: ${(f.keyFindings ?? []).map((k) => `- ${k.finding} (${k.evidence})`).join("\n  ")}`
  ).join("\n\n");

  return `=== RESEARCH FINDINGS (${findings.length} sources) ===\n\n${summaries}\n\n=== END OF FINDINGS ===`;
}
