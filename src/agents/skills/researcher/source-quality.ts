/**
 * Source Quality Scoring
 *
 * Scores each research source 0-10 based on:
 * - Citation count
 * - Venue reputation (journal > conference > arXiv > web)
 * - Recency (2024+ preferred)
 * - Methodology rigor
 */

import type { Finding } from "../../../types.ts";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SourceQualityScore {
  overall: number;           // 0-10
  citations: number;          // 0-3
  venue: number;             // 0-3
  recency: number;           // 0-2
  methodology: number;       // 0-2
  breakdown: {
    citations_detail: string;
    venue_detail: string;
    recency_detail: string;
    methodology_detail: string;
  };
  recommendation: "include" | "prefer" | "skip";
  tier: "A" | "B" | "C" | "D";
}

export interface ScoredSource {
  source: Finding;
  score: SourceQualityScore;
}

// ─── Venue Scoring ────────────────────────────────────────────────────────────

const VENUE_PATTERNS: Array<{ pattern: RegExp; score: number; label: string }> = [
  // Tier A — Top venues
  { pattern: /nature\.com|science\.org|jama\.com|nejm\.org|lancet\.com/i, score: 3, label: "Top tier journal (Nature, Science, JAMA, NEJM)" },
  // Tier B — Major field journals
  { pattern: /ieee\.org|acm\.org|arxiv\.org/i, score: 2, label: "Major venue (IEEE, ACM, arXiv)" },
  // Tier C — Conference proceedings, minor journals
  { pattern: /springer\.com|wiley\.com|elsevier\.com|mdpi\.com/i, score: 1, label: "Academic publisher (Springer, Wiley, Elsevier)" },
  // Tier D — General web
  { pattern: /github\.com|medium\.com|dev\.to|stackoverflow\.com/i, score: 0, label: "Community platform (GitHub, Medium, StackOverflow)" },
  // Fallback
  { pattern: /./, score: 0, label: "Unknown/General web" },
];

// ─── Methodology Indicators ──────────────────────────────────────────────────

const METHODOLOGY_PATTERNS: Array<{ pattern: RegExp; weight: number; label: string }> = [
  // High rigor indicators
  { pattern: /randomized|randomised|rct|controlled trial|ablation|benchmark|dataset/i, weight: 1, label: "Experimental/Ablation/Benchmark" },
  { pattern: /meta-analysis|systematic review|cochrane/i, weight: 1, label: "Meta-analysis/Systematic Review" },
  { pattern: /prospective|retrospective|cohort|case-control/i, weight: 1, label: "Clinical observational study" },
  // Medium rigor
  { pattern: /survey|questionnaire|interview|qualitative/i, weight: 0.5, label: "Survey/Qualitative" },
  { pattern: /theoretical|mathematical|framework|model/i, weight: 0.5, label: "Theoretical/Model" },
  // Low rigor
  { pattern: /opinion|commentary|perspective|editorial/i, weight: 0, label: "Opinion/Editorial" },
  { pattern: /case report|anecdote|case series/i, weight: 0, label: "Case report/Anecdote" },
];

// ─── Citation Benchmarks ──────────────────────────────────────────────────────

const CITATION_BENCHMARKS: Array<{ min: number; max: number; score: number; label: string }> = [
  { min: 500, max: Infinity, score: 3, label: "500+ citations (highly influential)" },
  { min: 100, max: 499, score: 2, label: "100-499 citations (well-cited)" },
  { min: 10, max: 99, score: 1, label: "10-99 citations (moderately cited)" },
  { min: 0, max: 9, score: 0, label: "<10 citations (recent or niche)" },
];

// ─── Scoring Functions ─────────────────────────────────────────────────────────

/**
 * Score a source by URL + metadata (pre-summarization)
 */
export function scoreSourceUrl(
  url: string | undefined,
  year: number | undefined,
  snippet: string = "",
): Omit<SourceQualityScore, "overall" | "recommendation" | "tier"> {
  // Citations: unknown for pre-summary, default to 0
  const citations = 0;
  const citations_detail = "Citation count unavailable (not yet summarized)";

  // Venue scoring
  let venue = 0;
  let venue_detail = "Unknown/General web";
  for (const vp of VENUE_PATTERNS) {
    if (vp.pattern.test(url ?? "")) {
      venue = vp.score;
      venue_detail = `${vp.label} (score: ${venue}/3)`;
      break;
    }
  }

  // Recency scoring
  const currentYear = new Date().getFullYear();
  const srcYear = year ?? currentYear;
  const recency_detail = `Year: ${srcYear}`;
  let recency = 0;
  if (srcYear >= currentYear - 1) recency = 2;
  else if (srcYear >= currentYear - 3) recency = 1;
  else recency = 0;

  // Methodology scoring
  let methodology = 0;
  const methodology_details: string[] = [];
  for (const mp of METHODOLOGY_PATTERNS) {
    if (mp.pattern.test(snippet)) {
      methodology += mp.weight;
      methodology_details.push(mp.label);
    }
  }
  methodology = Math.min(methodology, 2);
  const methodology_detail = methodology_details.length > 0
    ? methodology_details.join("; ")
    : "No methodology indicators detected";

  return {
    citations,
    venue,
    recency,
    methodology,
    breakdown: {
      citations_detail,
      venue_detail,
      recency_detail,
      methodology_detail,
    },
  };
}

/**
 * Score a full Finding (post-summarization)
 */
export function scoreFinding(finding: Finding): SourceQualityScore {
  // Citation count from metadata
  const citationCount = (finding.metadata?.citations as number | undefined) ?? 0;
  let citations = 0;
  let citations_detail = `${citationCount} citations`;

  for (const cb of CITATION_BENCHMARKS) {
    if (citationCount >= cb.min && citationCount <= cb.max) {
      citations = cb.score;
      citations_detail = `${citationCount} citations — ${cb.label} (score: ${citations}/3)`;
      break;
    }
  }

  // Venue scoring from URL
  const url = finding.sourceUrl;
  let venue = 0;
  let venue_detail = "Unknown/General web";
  for (const vp of VENUE_PATTERNS) {
    if (vp.pattern.test(url ?? "")) {
      venue = vp.score;
      venue_detail = `${vp.label} (score: ${venue}/3)`;
      break;
    }
  }

  // Recency from year in metadata
  const year = (finding.metadata?.year as number | undefined) ?? new Date().getFullYear();
  const currentYear = new Date().getFullYear();
  let recency = 0;
  if (year >= currentYear - 1) recency = 2;
  else if (year >= currentYear - 3) recency = 1;
  else recency = 0;

  const recency_detail = `Published: ${year} (${currentYear - year} year${currentYear - year !== 1 ? "s" : ""} ago) — score: ${recency}/2`;

  // Methodology from content
  const content = `${finding.title} ${finding.summary ?? ""} ${finding.content}`.slice(0, 2000);
  let methodology = 0;
  const methodology_details: string[] = [];
  for (const mp of METHODOLOGY_PATTERNS) {
    if (mp.pattern.test(content)) {
      methodology += mp.weight;
      methodology_details.push(mp.label);
    }
  }
  methodology = Math.min(methodology, 2);
  const methodology_detail = methodology_details.length > 0
    ? methodology_details.join("; ")
    : "No methodology indicators detected";

  // Calculate overall
  const raw = citations + venue + recency + methodology;
  const overall = Math.round((raw / 10) * 10); // Scale 0-10, round to nearest int

  // Recommendation thresholds
  let recommendation: SourceQualityScore["recommendation"];
  if (overall >= 7) recommendation = "include";
  else if (overall >= 4) recommendation = "prefer";
  else recommendation = "skip";

  // Tier
  let tier: SourceQualityScore["tier"];
  if (overall >= 8) tier = "A";
  else if (overall >= 6) tier = "B";
  else if (overall >= 4) tier = "C";
  else tier = "D";

  return {
    overall,
    citations,
    venue,
    recency,
    methodology,
    breakdown: { citations_detail, venue_detail, recency_detail, methodology_detail },
    recommendation,
    tier,
  };
}

/**
 * Score and filter sources by minimum quality threshold
 */
export function scoreAndFilterSources(
  findings: Finding[],
  minQuality = 4,
): { filtered: Finding[]; scores: ScoredSource[]; stats: {
    total: number;
    included: number;
    preferred: number;
    skipped: number;
    avgScore: number;
  } } {
  const scored: ScoredSource[] = findings.map((f) => ({ source: f, score: scoreFinding(f) }));

  const included = scored.filter((s) => s.score.recommendation === "include");
  const preferred = scored.filter((s) => s.score.recommendation === "prefer");
  const skipped = scored.filter((s) => s.score.recommendation === "skip");

  // Only filter out "skip" tier
  const filtered = scored
    .filter((s) => s.score.recommendation !== "skip")
    .map((s) => s.source);

  const avgScore = scored.length > 0
    ? Math.round(scored.reduce((sum, s) => sum + s.score.overall, 0) / scored.length)
    : 0;

  return {
    filtered,
    scores: scored,
    stats: {
      total: findings.length,
      included: included.length,
      preferred: preferred.length,
      skipped: skipped.length,
      avgScore,
    },
  };
}

/**
 * Get human-readable quality report for a source
 */
export function qualityReport(score: SourceQualityScore): string {
  const tierLabels = { A: "🟢 Tier A", B: "🟡 Tier B", C: "🟠 Tier C", D: "🔴 Tier D" };
  const tier = tierLabels[score.tier];

  return [
    `${tier} | Overall: ${score.overall}/10 | ${score.recommendation.toUpperCase()}`,
    `├── Citations:  ${score.citations}/3  — ${score.breakdown.citations_detail}`,
    `├── Venue:     ${score.venue}/3  — ${score.breakdown.venue_detail}`,
    `├── Recency:   ${score.recency}/2  — ${score.breakdown.recency_detail}`,
    `└── Method:    ${score.methodology}/2  — ${score.breakdown.methodology_detail}`,
  ].join("\n");
}
