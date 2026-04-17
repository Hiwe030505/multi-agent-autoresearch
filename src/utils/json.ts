/**
 * Robust JSON parsing utilities for LLM responses.
 *
 * LLMs frequently return:
 * - Markdown code fences: ```json ... ```
 * - Partial JSON with trailing text
 * - JSON with different field names (snake_case vs camelCase)
 * - Text before/after the JSON block
 *
 * This module provides fallbacks that extract the best possible data.
 */

export interface ParseResult<T> {
  data: T | null;
  method: "exact" | "code-fence" | "block" | "line" | "fallback";
  raw: string;
}

/**
 * Parse a JSON object from any LLM response.
 * Tries multiple strategies in order of reliability.
 */
export function parseJson<T>(content: string, defaults?: Partial<T>): ParseResult<T> {
  // Strategy 1: Exact JSON parse
  try {
    const exact = JSON.parse(content) as T;
    const merged = defaults ? ({ ...defaults, ...exact } as T) : exact;
    return { data: merged, method: "exact", raw: content };
  } catch {}

  // Strategy 2: Markdown code fences
  const fenceMatches = content.match(/```(?:json)?\s*([\s\S]*?)```/g);
  if (fenceMatches && fenceMatches.length > 0) {
    for (const fence of fenceMatches) {
      const inner = fence.replace(/```(?:json)?\s*/, "").replace(/\s*```$/, "");
      try {
        const parsed = JSON.parse(inner) as T;
        const merged = defaults ? ({ ...defaults, ...parsed } as T) : parsed;
        return { data: merged, method: "code-fence", raw: fence };
      } catch {}
    }
  }

  // Strategy 3: Find first { ... } block
  const blockMatch = content.match(/\{[\s\S]*\}/);
  if (blockMatch) {
    try {
      const parsed = JSON.parse(blockMatch[0]!) as T;
      const merged = defaults ? ({ ...defaults, ...parsed } as T) : parsed;
      return { data: merged, method: "block", raw: blockMatch[0]! };
    } catch {
      // Block matched but invalid — try to extract field by field
      const partial = extractPartialJson(blockMatch[0]!);
      if (partial) {
        const merged = defaults ? ({ ...defaults, ...partial } as T) : (partial as T);
        return { data: merged, method: "block", raw: blockMatch[0]! };
      }
    }
  }

  return { data: null, method: "fallback", raw: content };
}

/**
 * Parse a JSON array from LLM response.
 * Used for arrays of insights, findings, etc.
 */
export function parseJsonArray<T>(
  content: string,
  normalizer?: (raw: Record<string, unknown>, index: number) => T,
): ParseResult<T[]> {
  // Strategy 1: Exact parse
  try {
    const exact = JSON.parse(content) as T[];
    return { data: exact, method: "exact", raw: content };
  } catch {}

  // Strategy 2: Code fences
  const fenceMatches = content.match(/```(?:json)?\s*(\[[\s\S]*?\])```/g);
  if (fenceMatches && fenceMatches.length > 0) {
    for (const fence of fenceMatches) {
      const inner = fence.replace(/```(?:json)?\s*/, "").replace(/\s*```$/, "");
      try {
        const parsed = JSON.parse(inner) as T[];
        const data = normalizer ? parsed.map((p, i) => normalizer(p as Record<string, unknown>, i)) : parsed;
        return { data, method: "code-fence", raw: inner };
      } catch {}
    }
  }

  // Strategy 3: Find any [...] in text
  const arrayMatch = content.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try {
      const parsed = JSON.parse(arrayMatch[0]!) as T[];
      const data = normalizer ? parsed.map((p, i) => normalizer(p as Record<string, unknown>, i)) : parsed;
      return { data, method: "block", raw: arrayMatch[0]! };
    } catch {}
  }

  // Strategy 4: Parse line-by-line JSON objects
  const items: T[] = [];
  for (const line of content.split("\n")) {
    const match = line.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]!) as T;
        const normalized = normalizer ? normalizer(parsed as Record<string, unknown>, items.length) : parsed;
        items.push(normalized);
      } catch {}
    }
  }

  if (items.length > 0) {
    return { data: items, method: "line", raw: content };
  }

  return { data: [], method: "fallback", raw: content };
}

/**
 * Normalize common field name variations between snake_case and camelCase.
 * LLM responses often use snake_case, while our types use camelCase.
 */
export function normalizeFields<T extends Record<string, unknown>>(raw: T): T {
  const mappings: Record<string, string[]> = {
    // Insight fields
    title: ["title", "Title", "TITLE"],
    summary: ["summary", "Summary", "SUMMARY", "description"],
    description: ["description", "Description", "desc"],
    confidence: ["confidence", "Confidence", "CONF", "conf"],
    noveltyScore: ["novelty_score", "noveltyScore", "novelty"],
    novelty: ["novelty", "noveltyScore", "novelty_score"],
    actionable: ["actionable", "Actionable", "is_actionable"],
    evidenceRefs: ["evidence_refs", "evidenceRefs", "papers_cited", "sources_cited", "citations"],
    tags: ["tags", "Tags", "keywords", "labels"],
    type: ["type", "Type", "insight_type", "insightType"],
    sessionId: ["session_id", "sessionId", "sessionID"],
    createdAt: ["created_at", "createdAt", "timestamp"],
    verified: ["verified", "Verified", "is_verified"],
    verifiedBy: ["verified_by", "verifiedBy", "reviewer"],
    // Finding fields
    sourceUrl: ["source_url", "sourceUrl", "url", "link"],
    sourceType: ["source_type", "sourceType", "type"],
    keyFindings: ["key_findings", "keyFindings", "findings"],
    questionsRaised: ["questions_raised", "questionsRaised", "open_questions"],
    connections: ["connections", "Connections", "related_findings"],
    metadata: ["metadata", "Metadata", "meta"],
    createdBy: ["created_by", "createdBy"],
    // Generic
    id: ["id", "Id", "ID", "_id"],
    name: ["name", "Name", "NAME"],
  };

  const result: Record<string, unknown> = { ...raw };

  for (const [canonical, variants] of Object.entries(mappings)) {
    if (result[canonical] !== undefined) continue;

    for (const variant of variants) {
      if (variant in result) {
        result[canonical] = result[variant];
        break;
      }
    }
  }

  return result as T;
}

/**
 * Extract partial JSON when we matched { } but it's incomplete.
 * Tries to extract individual fields.
 */
function extractPartialJson(text: string): Record<string, unknown> | null {
  const result: Record<string, unknown> = {};

  const stringFields = text.match(/"(\w+)":\s*"((\\"|[^"])*)"/g);
  if (stringFields) {
    for (const match of stringFields) {
      const m = match.match(/"(\w+)":\s*"((\\"|[^"])*)"/);
      if (m) result[m[1]!] = m[2]!.replace(/\\"/g, '"');
    }
  }

  const numFields = text.match(/"(\w+)":\s*(-?\d+\.?\d*)/g);
  if (numFields) {
    for (const match of numFields) {
      const m = match.match(/"(\w+)":\s*(-?\d+\.?\d*)/);
      if (m) result[m[1]!] = parseFloat(m[2]!);
    }
  }

  const boolFields = text.match(/"(\w+)":\s*(true|false)/g);
  if (boolFields) {
    for (const match of boolFields) {
      const m = match.match(/"(\w+)":\s*(true|false)/);
      if (m) result[m[1]!] = m[2]! === "true";
    }
  }

  return Object.keys(result).length > 0 ? result : null;
}

/**
 * Check if a string looks like valid JSON.
 */
export function looksLikeJson(text: string): boolean {
  const trimmed = text.trim();
  return (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
         (trimmed.startsWith("[") && trimmed.endsWith("]"));
}

/**
 * Strip markdown formatting from text that might contain embedded JSON.
 */
export function stripMarkdown(text: string): string {
  return text
    .replace(/```(?:json)?\s*/g, "")
    .replace(/```/g, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^#+\s+/gm, "")
    .replace(/^-\s+/gm, "")
    .replace(/^(\d+)\.\s+/gm, "$1. ");
}
