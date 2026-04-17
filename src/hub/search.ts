/**
 * Web Search Service — Real search integration
 *
 * Supports multiple backends:
 * - Tavily API (recommended: https://tavily.com)
 * - arXiv API (free, no auth needed)
 * - DuckDuckGo (free, no auth)
 *
 * Falls back gracefully if no API keys are configured.
 */

import { config } from "../config.ts";

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source: "arxiv" | "web" | "semantic_scholar";
  authors?: string[];
  year?: number;
  score?: number;
}

export interface SearchResponse {
  results: SearchResult[];
  query: string;
  totalResults: number;
  provider: string;
}

// ─── arXiv API (free, no auth) ─────────────────────────────────────────────────

async function searchArxiv(query: string, maxResults = 5): Promise<SearchResult[]> {
  try {
    const params = new URLSearchParams({
      search_query: `all:${query.replace(/"/g, "")}`,
      max_results: String(maxResults),
      sortBy: "relevance",
      sortOrder: "descending",
    });

    const res = await fetch(`https://export.arxiv.org/api/query?${params}`, {
      headers: { "User-Agent": "AutoResearch/1.0" },
    });

    if (!res.ok) return [];

    const xml = await res.text();
    const results: SearchResult[] = [];

    // Simple XML parsing without external deps
    const entries = xml.split("<entry>");
    for (const entry of entries.slice(1)) {
      const getTag = (tag: string) => {
        const match = entry.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
        return match ? match[1].replace(/<[^>]+>/g, "").trim() : "";
      };

      const title = getTag("title").replace(/\s+/g, " ");
      const summary = getTag("summary").replace(/\s+/g, " ").slice(0, 300);
      const authors = entry.match(/<author>[\s\S]*?<name>([^<]+)<\/name>/g)
        ?.map((a) => a.replace(/<[^>]+>/g, "")).slice(0, 5) ?? [];

      const published = getTag("published");
      const year = published ? parseInt(published.slice(0, 4), 10) : undefined;

      const links = entry.match(/<id>([^<]+)<\/id>/);
      const url = links ? links[1] : "";

      if (title) {
        results.push({
          title,
          url,
          snippet: summary,
          source: "arxiv",
          authors,
          year,
          score: 1.0,
        });
      }
    }

    return results;
  } catch {
    return [];
  }
}

// ─── Tavily API ───────────────────────────────────────────────────────────────

async function searchTavily(query: string, apiKey: string, maxResults = 8): Promise<SearchResult[]> {
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query,
        search_depth: "advanced",
        max_results: maxResults,
        include_answer: false,
        include_raw_content: false,
      }),
    });

    if (!res.ok) return [];

    const data = await res.json() as { results?: Array<{ title: string; url: string; content: string; score?: number }> };
    if (!data.results) return [];

    return data.results.map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.content?.slice(0, 300) ?? "",
      source: "web" as const,
      score: r.score,
    }));
  } catch {
    return [];
  }
}

// ─── DuckDuckGo (free, no auth) via unofficial API ─────────────────────────────

async function searchDuckDuckGo(query: string, maxResults = 8): Promise<SearchResult[]> {
  try {
    // Using ddg-api or a simple web search approach
    const res = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`,
      { headers: { "User-Agent": "AutoResearch/1.0" } },
    );

    if (!res.ok) return [];

    const data = await res.json() as {
      RelatedTopics?: Array<{ Text?: string; FirstURL?: string; Icon?: { URL?: string } }>;
      AbstractText?: string;
      AbstractURL?: string;
      Heading?: string;
    };

    const results: SearchResult[] = [];

    if (data.AbstractText && data.AbstractURL) {
      results.push({
        title: data.Heading ?? query,
        url: data.AbstractURL,
        snippet: data.AbstractText.slice(0, 300),
        source: "web",
        score: 1.0,
      });
    }

    for (const topic of (data.RelatedTopics ?? []).slice(0, maxResults)) {
      if (topic.FirstURL && topic.Text) {
        results.push({
          title: topic.Text.slice(0, 100),
          url: topic.FirstURL,
          snippet: topic.Text.slice(0, 200),
          source: "web",
          score: 0.5,
        });
      }
    }

    return results;
  } catch {
    return [];
  }
}

// ─── Semantic Scholar API (free tier) ─────────────────────────────────────────

async function searchSemanticScholar(query: string, maxResults = 5): Promise<SearchResult[]> {
  try {
    const res = await fetch(
      `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=${maxResults}&fields=title,url,authors,year,abstract`,
      { headers: { "User-Agent": "AutoResearch/1.0 (research assistant)" } },
    );

    if (!res.ok) return [];

    const data = await res.json() as {
      data?: Array<{
        paperId: string; title: string; url: string;
        authors?: Array<{ name: string }>;
        year?: number; abstract?: string;
      }>;
    };

    if (!data.data) return [];

    return data.data.map((p) => ({
      title: p.title,
      url: p.url,
      snippet: p.abstract?.slice(0, 300) ?? "",
      source: "semantic_scholar" as const,
      authors: p.authors?.slice(0, 5).map((a) => a.name),
      year: p.year,
      score: 0.9,
    }));
  } catch {
    return [];
  }
}

// ─── Main Search Function ──────────────────────────────────────────────────────

export async function webSearch(
  query: string,
  options?: { maxResults?: number; domains?: string[] },
): Promise<SearchResponse> {
  const maxResults = options?.maxResults ?? 8;
  const allResults: SearchResult[] = [];

  // Always try arXiv for academic queries (free)
  const isAcademic = /paper|arxiv|research|survey|study|algorithm|learning|neural|language model/i.test(query);
  if (isAcademic) {
    const arxivResults = await searchArxiv(query, Math.ceil(maxResults * 0.4));
    allResults.push(...arxivResults);
  }

  // Try Tavily if API key is set (best quality for web search)
  const tavilyKey = process.env.TAVILY_API_KEY ?? "";
  if (tavilyKey) {
    const tavilyResults = await searchTavily(query, tavilyKey, maxResults);
    allResults.push(...tavilyResults);
  }

  // Try Semantic Scholar (free, good for academic)
  if (isAcademic && allResults.length < maxResults) {
    const ssResults = await searchSemanticScholar(query, Math.ceil(maxResults * 0.5));
    allResults.push(...ssResults);
  }

  // Fallback: DuckDuckGo (no auth required, always available)
  if (allResults.length < 3) {
    const ddgResults = await searchDuckDuckGo(query, maxResults);
    allResults.push(...ddgResults);
  }

  // Deduplicate by URL
  const seen = new Set<string>();
  const deduped = allResults.filter((r) => {
    if (seen.has(r.url)) return false;
    seen.add(r.url);
    return true;
  });

  return {
    results: deduped.slice(0, maxResults),
    query,
    totalResults: deduped.length,
    provider: tavilyKey ? "tavily" : isAcademic ? "arxiv+semantic_scholar" : "duckduckgo",
  };
}

// ─── Check search availability ─────────────────────────────────────────────────

export function isSearchConfigured(): boolean {
  return !!(process.env.TAVILY_API_KEY ?? config.kymaApiKey);
}