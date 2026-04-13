/**
 * Knowledge Hub — Embedding generation via OpenAI
 *
 * Uses OpenAI text-embedding-3-small (or similar) to generate
 * vector embeddings for research findings, enabling similarity search.
 */

import OpenAI from "openai";
import { config } from "../config.ts";

const openai = new OpenAI({
  apiKey: config.anthropicApiKey || process.env.OPENAI_API_KEY || "",
  baseURL: process.env.OPENAI_BASE_URL ?? undefined, // optional proxy
});

// ─── Embedding Generation ───────────────────────────────────────────────────

export async function embedText(text: string): Promise<number[]> {
  if (!text || text.trim().length === 0) {
    throw new Error("Cannot embed empty text");
  }

  const response = await openai.embeddings.create({
    model: config.reasoning.embeddingModel,
    input: text.slice(0, 8000), // safety cap
  });

  return response.data[0]?.embedding ?? [];
}

// Batch embed multiple texts (more efficient)
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  if (texts.length === 1) {
    const e = await embedText(texts[0]!);
    return [e];
  }

  const valid = texts.map((t) => t.slice(0, 8000));
  const response = await openai.embeddings.create({
    model: config.reasoning.embeddingModel,
    input: valid,
    encoding_format: "float",
  });

  // Sort by input order (API may reorder)
  const byIndex = new Map(response.data.map((d) => [d.index, d.embedding]));
  return texts.map((_, i) => byIndex.get(i) ?? []);
}

// ─── Text Normalization ───────────────────────────────────────────────────────

export function textForEmbedding(finding: {
  title: string;
  summary?: string;
  content: string;
  keyFindings?: Array<{ finding: string }>;
}): string {
  const parts: string[] = [
    finding.title,
    finding.summary ?? "",
    finding.content,
  ];
  if (finding.keyFindings) {
    for (const kf of finding.keyFindings) {
      parts.push(kf.finding);
    }
  }
  return parts.join("\n---\n").slice(0, 8000);
}

// ─── Similarity Helpers ─────────────────────────────────────────────────────

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export function batchSimilarity(
  query: number[],
  candidates: number[][],
): Array<{ index: number; similarity: number }> {
  return candidates
    .map((c, i) => ({ index: i, similarity: cosineSimilarity(query, c) }))
    .sort((a, b) => b.similarity - a.similarity);
}
