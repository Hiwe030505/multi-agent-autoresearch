/**
 * Proposal Processor — text extraction + LLM analysis + KG linking
 *
 * Takes a PDF/DOCX/TXT upload or pasted text, parses the proposal structure,
 * queries the existing knowledge graph for connections, identifies literature gaps.
 */

import { v4 as uuidv4 } from "uuid";
import { llm } from "../llm/client.ts";
import { config } from "../config.ts";
import { graphQuery } from "./graph.ts";

interface AnalysisResult {
  title: string;
  domain: string;
  researchType: string;
  questions: string[];
  methodology: string[];
  knowledgeGraphConnections: Array<{ type: string; name: string; strength: string; note?: string }>;
  literatureGaps: string[];
  noveltyScore: number;
  feasibilityScore: number;
  recommendations: string[];
}

export async function analyzeProposal(
  text: string,
  sessionId?: string,
): Promise<AnalysisResult> {
  const sid = sessionId ?? uuidv4();

  // ── Step 1: Query graph for context ─────────────────────────────────────────
  let graphContext = "";
  try {
    const stats = await graphQuery.stats();
    if (stats.totalNodes > 0) {
      const nodes = await graphQuery.search(text.slice(0, 200), undefined);
      const concepts = nodes.filter(n => n.type === "concept" || n.type === "method" || n.type === "dataset");
      if (concepts.length > 0) {
        graphContext = concepts.slice(0, 10).map(c =>
          `  - [${c.type}] ${c.name}: ${c.summary || ""}`
        ).join("\n");
      }
    }
  } catch {
    graphContext = "(No existing knowledge graph — this is a new research area)";
  }

  // ── Step 2: Build prompt with user's text ────────────────────────────────────
  const systemPrompt = `You are a senior research advisor. Analyze the research proposal text provided by the user and extract structured information. Output ONLY valid JSON — no explanation, no markdown, no prefix/suffix.`;

  const userPrompt = `RESEARCH PROPOSAL TEXT:
${text.trim()}

EXISTING KNOWLEDGE GRAPH CONTEXT:
${graphContext}

TASK: Parse the proposal above and extract all fields. For each concept/method in the proposal, evaluate its connection to the existing knowledge graph. Return ONLY this JSON structure (no text before or after):

{
  "title": "EXACT title from the proposal text",
  "domain": "primary research domain",
  "researchType": "survey|original research|review|application|theoretical",
  "questions": ["specific research question 1", "question 2", "..."],
  "methodology": ["method 1", "method 2", "..."],
  "knowledgeGraphConnections": [
    {"type": "concept|method|dataset", "name": "entity name from proposal", "strength": "strong|moderate|none", "note": "why this strength"}
  ],
  "literatureGaps": ["gap 1 based on the proposal", "gap 2", "..."],
  "noveltyScore": 0.0-1.0,
  "feasibilityScore": 0.0-1.0,
  "recommendations": ["actionable recommendation 1", "..."]
}`;

  // ── Step 3: Call LLM — try HuggingFace first, fallback to configured ────────
  let response: { content: string } | null = null;
  const hfToken = process.env.HF_TOKEN;

  if (hfToken) {
    try {
      response = await llm.chat(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        { provider: "huggingface", model: "Qwen/Qwen3.5-9B", maxTokens: 4096, temperature: 0.2 },
      );
      console.log("[Proposal] Used HuggingFace Qwen3.5-9B");
    } catch (e) {
      console.warn("[Proposal] HuggingFace failed, falling back:", (e as Error).message);
    }
  }

  if (!response) {
    // Fallback to configured model
    response = await llm.chat(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      { provider: "kyma", model: config.models.reasoning, maxTokens: 4096, temperature: 0.2 },
    );
    console.log("[Proposal] Used Kyma fallback");
  }

  // ── Step 4: Parse JSON from response ────────────────────────────────────────
  try {
    // Try to extract JSON block first
    const match = response.content.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      return {
        title: parsed.title ?? text.slice(0, 80),
        domain: parsed.domain ?? "General",
        researchType: parsed.researchType ?? "original research",
        questions: Array.isArray(parsed.questions) ? parsed.questions : [],
        methodology: Array.isArray(parsed.methodology) ? parsed.methodology : [],
        knowledgeGraphConnections: Array.isArray(parsed.knowledgeGraphConnections)
          ? parsed.knowledgeGraphConnections
          : [],
        literatureGaps: Array.isArray(parsed.literatureGaps) ? parsed.literatureGaps : [],
        noveltyScore: typeof parsed.noveltyScore === "number" ? parsed.noveltyScore : 0.5,
        feasibilityScore: typeof parsed.feasibilityScore === "number" ? parsed.feasibilityScore : 0.7,
        recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
      };
    }
  } catch (e) {
    console.warn("[Proposal] JSON parse failed:", e);
    console.warn("[Proposal] Raw response:", response.content.slice(0, 500));
  }

  // Fallback
  return {
    title: text.slice(0, 80),
    domain: "General",
    researchType: "original research",
    questions: [],
    methodology: [],
    knowledgeGraphConnections: [],
    literatureGaps: ["Analysis could not extract structured data — please provide more detailed proposal text."],
    noveltyScore: 0.5,
    feasibilityScore: 0.7,
    recommendations: ["Provide a more detailed proposal with clear research questions."],
  };
}