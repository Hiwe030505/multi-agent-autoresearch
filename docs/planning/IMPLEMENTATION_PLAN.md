# ORIN — Implementation Plan: Skills & Knowledge Bases

> **Version**: 1.0.0 | **Date**: 2026-04-18 | **Phase**: Planning

---

## Mục lục

1. [Phase 0: Critical Bugs](#phase-0-critical-bugs)
2. [Phase 1: Skills Enhancement](#phase-1-skills-enhancement)
3. [Phase 2: Knowledge Bases](#phase-2-knowledge-bases)
4. [Phase 3: Pipeline Optimization](#phase-3-pipeline-optimization)
5. [Phase 4: Advanced Features](#phase-4-advanced-features)
6. [Per-File Change Log](#per-file-change-log)

---

## Phase 0: Critical Bugs

### 0.1 Fix `coder.ts` — CODE_GENERATION_TEMPLATE ReferenceError

**File**: `src/agents/coder.ts`

**Problem**: `CODE_GENERATION_TEMPLATE` defined at line 86, used at line 71. ES module `const` is not hoisted → `ReferenceError` at runtime.

**Fix**: Move constant definition BEFORE `generateCode()` function, rename to `CODE_GENERATION_PROMPT` (to match line 30 declaration).

```typescript
// BEFORE (broken):
// line 30: const CODE_GENERATION_PROMPT = `...`  // ← unused
// line 71: content: CODE_GENERATION_TEMPLATE      // ← ReferenceError!
// line 86: const CODE_GENERATION_TEMPLATE = `...` // ← defined here

// AFTER (fixed):
// Move CODE_GENERATION_TEMPLATE definition to BEFORE generateCode()
// Rename to CODE_GENERATION_PROMPT (remove duplicate at line 30)
```

**Steps**:
1. Remove duplicate `const CODE_GENERATION_PROMPT` at line 30
2. Move `CODE_GENERATION_TEMPLATE` (rename to `CODE_GENERATION_PROMPT`) to line 12 (after imports, before functions)
3. Update line 71 to use `CODE_GENERATION_PROMPT`

---

### 0.2 Integrate or Delete `selfReview()` in `orchestrator.ts`

**File**: `src/agents/orchestrator.ts`

**Problem**: `selfReview()` (line 371-393) is defined but never called. Dead code.

**Decision**: Integrate — `selfReview()` has good logic (filter generic + low-confidence insights).

**Fix**: Call `selfReview()` after `reviewInsights()` in pipeline:

```typescript
// Around line 264-275 (after reviewInsights):
const reviewResult = await reviewInsights(insights, allFindings);

// Add: run self-review to filter weak insights
const selfReviewedInsights = await selfReview(allFindings, insights);
const verifiedInsights = reviewResult.approved
  ? selfReviewedInsights
  : insights.insights.map((i) => ({ ...i, verified: false }));
```

---

### 0.3 Standardize Prompt Language

**Files**: `src/agents/researcher.ts`, `src/agents/orchestrator.ts`

**Decision**: Standardize to **Vietnamese** for all system prompts (consistent with 5/7 agents).

**Changes**:
1. `researcher.ts` line 100: Change `PAPER_SUMMARY_PROMPT` from English to Vietnamese
2. `orchestrator.ts` line 335: Change `decomposeTask` prompt to Vietnamese

---

## Phase 1: Skills Enhancement

### 1.1 Researcher — Source Quality Scoring

**New file**: `src/agents/skills/researcher/source-quality.ts`

```typescript
/**
 * Source Quality Scoring
 *
 * Input: Raw search result or Finding
 * Output: Quality score 0-10 + breakdown
 */

export interface SourceQualityScore {
  overall: number;           // 0-10
  citations: number;         // 0-3
  venue: number;             // 0-3
  recency: number;           // 0-2
  methodology: number;       // 0-2
  breakdown: Record<string, string>;
}

export async function scoreSource(source: {
  title?: string;
  url?: string;
  year?: number;
  authors?: string[];
  citations?: number;
  sourceType?: string;
}): Promise<SourceQualityScore> {
  // Scoring logic:
  // - Citations: 0=<10, 1=10-50, 2=50-200, 3=>200
  // - Venue: 0=unknown, 1=web, 2=conference, 3=journal
  // - Recency: 0=<2010, 1=2010-2020, 2=>2020
  // - Methodology: based on source type indicators
}
```

**Integration**: Call in `researcher.ts` `summarizeSource()` — reject sources < 5/10.

---

### 1.2 Researcher — Author/Citation Network

**New file**: `src/agents/skills/researcher/citation-network.ts`

```typescript
/**
 * Citation Network Analysis
 *
 * Capabilities:
 * - Extract author names from paper metadata
 * - Identify citation relationships
 * - Rank authors by h-index (if available)
 * - Find co-authorship patterns
 */

export interface Author {
  name: string;
  paperCount: number;
  estimatedHIndex: number;
}

export async function analyzeCitationNetwork(
  findings: Finding[]
): Promise<{
  authors: Author[];
  topPapers: string[];      // finding IDs
  researchCommunities: string[][];  // groups of related authors
}> {
  // Extract authors from finding metadata
  // Group by co-authorship
  // Rank by frequency
  // Return communities
}
```

---

### 1.3 Coder — Test Generation (dedicated function)

**New file**: `src/agents/skills/coder/test-generation.ts`

```typescript
/**
 * Test Generation
 *
 * Capabilities:
 * - Generate unit tests for given code
 * - Support multiple frameworks (Jest, PyTest, Go test, etc.)
 * - Include edge case coverage
 * - Generate coverage report
 */

export interface TestGenerationResult {
  tests: string;            // test file content
  framework: string;
  testCases: string[];       // list of test names
  coverage: number;          // estimated coverage %
  edgeCases: string[];       // edge cases covered
  missingCoverage: string[]; // suggested additional tests
}

export async function generateTests(
  code: string,
  language: string,
  framework?: string,         // auto-detect if not provided
  coverage?: number           // target coverage %
): Promise<TestGenerationResult> {
  // Detect framework from language
  // Build test generation prompt
  // Return structured result
}

// Framework mapping:
const FRAMEWORK_MAP = {
  python: "pytest",
  typescript: "jest",
  javascript: "jest",
  go: "testing",
  rust: "cargo test",
  java: "junit",
};
```

---

### 1.4 Analyst — Temporal/Time-Series Analysis

**New file**: `src/agents/skills/analyst/temporal-analysis.ts`

```typescript
/**
 * Temporal Analysis
 *
 * Capabilities:
 * - Analyze research evolution over time
 * - Detect paradigm shifts
 * - Identify emerging vs declining methods
 * - Generate timeline visualizations
 */

export interface TemporalAnalysis {
  timeline: Array<{
    year: number;
    milestone: string;
    significance: number;
  }>;
  paradigmShifts: Array<{
    from: string;
    to: string;
    year: number;
    trigger: string;
  }>;
  trendDirection: "rising" | "stable" | "declining";
  momentumScore: number;      // 0-1
}
```

---

### 1.5 Analyst — Anomaly/Outlier Detection

**New file**: `src/agents/skills/analyst/anomaly-detection.ts`

```typescript
/**
 * Anomaly Detection
 *
 * Capabilities:
 * - Detect outlier claims in findings
 * - Identify statistical anomalies
 * - Flag contradictory evidence
 * - Score confidence anomalies
 */

export interface Anomaly {
  type: "outlier" | "contradiction" | "outlier_statistical" | "claim_anomaly";
  severity: "high" | "medium" | "low";
  description: string;
  relatedFindings: string[];   // finding IDs
  explanation: string;
}
```

---

### 1.6 Writer — Technical Blog Mode

**New file**: `src/agents/skills/writer/technical-blog.ts`

```typescript
/**
 * Technical Blog Writing
 *
 * Different from literature review:
 * - More accessible language
 * - Practical examples
 * - "Lessons learned" format
 * - Code snippets included
 * - Audience: developers, practitioners
 */

export interface TechnicalBlogResult {
  title: string;
  subtitle: string;
  sections: Array<{
    heading: string;
    content: string;
    hasCodeSnippet: boolean;
  }>;
  markdown: string;
  estimatedReadTime: number;  // minutes
}

export async function writeTechnicalBlog(
  topic: string,
  findings: Finding[],
  insights: InsightSession
): Promise<TechnicalBlogResult> {
  // Tone: conversational but precise
  // Structure: Hook → Problem → Solution → Examples → Conclusion
  // Include code snippets from findings
  // Target: 1500-2500 words
}
```

---

## Phase 2: Knowledge Bases

### 2.1 Directory Structure

```
src/knowledge/
├── researcher/
│   ├── index.ts
│   ├── source-quality-rules.ts
│   ├── search-templates.ts
│   └── citation-patterns.ts
├── reasoner/
│   ├── index.ts
│   ├── evidence-hierarchy.ts
│   ├── methodology-taxonomy.ts
│   └── cross-domain-mappings.ts
├── coder/
│   ├── index.ts
│   ├── language-best-practices.ts
│   ├── bug-patterns.ts
│   └── test-frameworks.ts
├── analyst/
│   ├── index.ts
│   ├── stat-pitfalls.ts
│   └── visualization-types.ts
├── writer/
│   ├── index.ts
│   ├── citation-styles.ts
│   ├── document-templates.ts
│   └── style-guide.ts
└── reviewer/
    ├── index.ts
    ├── logical-fallacies.ts
    ├── stat-red-flags.ts
    └── reproducibility-checklist.ts
```

---

### 2.2 Evidence Hierarchy (Reasoner)

**File**: `src/knowledge/reasoner/evidence-hierarchy.ts`

```typescript
export const EVIDENCE_HIERARCHY = [
  { level: 1, name: "Systematic Review + Meta-analysis", weight: 1.0, symbol: "★" },
  { level: 2, name: "Randomized Controlled Trial (RCT)", weight: 0.95, symbol: "★★" },
  { level: 3, name: "Prospective Cohort Study", weight: 0.85, symbol: "★★" },
  { level: 4, name: "Case-Control Study", weight: 0.75, symbol: "★" },
  { level: 5, name: "Cross-sectional Study", weight: 0.65, symbol: "☆" },
  { level: 6, name: "Case Report / Series", weight: 0.50, symbol: "☆" },
  { level: 7, name: "Expert Opinion", weight: 0.30, symbol: "–" },
  { level: 8, name: "Anecdotal / Preprint", weight: 0.15, symbol: "–" },
];

// Usage in Reasoner:
// confidence = base_confidence * evidence_weight
```

---

### 2.3 Methodology Taxonomy (Reasoner)

**File**: `src/knowledge/reasoner/methodology-taxonomy.ts`

```typescript
export const METHODOLOGY_TAXONOMY = {
  experimental: {
    name: "Experimental Methods",
    methods: [
      "A/B Testing",
      "Randomized Controlled Trial",
      "Factorial Design",
      "Within-subjects Design",
      "Between-subjects Design",
      "Cross-over Design",
    ],
    reliability: 0.9,
  },
  observational: {
    name: "Observational Methods",
    methods: [
      "Cohort Study",
      "Case-Control Study",
      "Cross-sectional Study",
      "Longitudinal Study",
      "Ecological Study",
    ],
    reliability: 0.7,
  },
  computational: {
    name: "Computational Methods",
    methods: [
      "Simulation",
      "Agent-based Modeling",
      "Molecular Dynamics",
      "Finite Element Analysis",
      "Monte Carlo",
    ],
    reliability: 0.8,
  },
  qualitative: {
    name: "Qualitative Methods",
    methods: [
      "Interview",
      "Focus Group",
      "Ethnography",
      "Grounded Theory",
      "Phenomenology",
    ],
    reliability: 0.6,
  },
  review: {
    name: "Review Methods",
    methods: [
      "Systematic Review",
      "Meta-analysis",
      "Narrative Review",
      "Scoping Review",
      "Rapid Review",
    ],
    reliability: 0.85,
  },
};

// Usage: When synthesizing, weight by methodology reliability
```

---

### 2.4 Logical Fallacies (Reviewer)

**File**: `src/knowledge/reviewer/logical-fallacies.ts`

```typescript
export const LOGICAL_FALLACIES: Record<string, {
  name: string;
  description: string;
  detectionPatterns: string[];
  severity: "critical" | "major" | "minor";
  example: string;
}> = {
  confirmation_bias: {
    name: "Confirmation Bias",
    description: "Favoring information that confirms prior beliefs",
    detectionPatterns: [
      "only evidence supporting",
      "ignore.*contrary",
      "selective.*data",
      "cherry.*pick",
    ],
    severity: "major",
    example: "Citing only studies that support the hypothesis while ignoring contradictory evidence",
  },
  survivorship_bias: {
    name: "Survivorship Bias",
    description: "Focusing on successful cases while ignoring failures",
    detectionPatterns: [
      "successful.*cases",
      "survivors.*ignored",
      "failed.*ignored",
      "companies.*succeeded",
    ],
    severity: "major",
    example: "Studying only companies that succeeded without examining failures",
  },
  p_hacking: {
    name: "P-Hacking / Data Dredging",
    description: "Manipulating data analysis to find significant p-values",
    detectionPatterns: [
      "p.*value.*hacking",
      "data.*dredging",
      "post.*hoc",
      "significant.*result",
    ],
    severity: "critical",
    example: "Running multiple statistical tests until finding p < 0.05",
  },
  harking: {
    name: "HARKing",
    description: "Hypothesizing after results are known",
    detectionPatterns: [
      "as.*predicted",
      "we.*hypothesized",
      "retrospectively",
      "post.*hoc.*hypothesis",
    ],
    severity: "major",
    example: "Presenting post-hoc explanations as if they were pre-planned hypotheses",
  },
  correlation_causation: {
    name: "Correlation ≠ Causation",
    description: "Assuming causation from correlation",
    detectionPatterns: [
      "therefore.*causes",
      "leads.*to.*result",
      "because.*correlation",
      "as.*a.*result.*of",
    ],
    severity: "major",
    example: "Claiming X causes Y based solely on correlation",
  },
  base_rate_fallacy: {
    name: "Base Rate Fallacy",
    description: "Ignoring base rates in probability estimates",
    detectionPatterns: [
      "unlikely.*to.*happen",
      "high.*probability.*of",
      "rare.*event",
      "common.*among",
    ],
    severity: "minor",
    example: "Claiming an event is likely without considering its base rate",
  },
};
```

---

### 2.5 Bug Patterns (Coder)

**File**: `src/knowledge/coder/bug-patterns.ts`

```typescript
export const BUG_PATTERNS: Record<string, Array<{
  pattern: string;
  regex: RegExp;
  severity: "critical" | "major" | "minor";
  issue: string;
  fix: string;
}>> = {
  security: [
    {
      pattern: "eval(",
      regex: /eval\s*\(/,
      severity: "critical",
      issue: "Code injection via eval()",
      fix: "Use JSON.parse() for JSON, or refactor to avoid dynamic code execution",
    },
    {
      pattern: "SQL injection",
      regex: /['"]SELECT.*\+.*['"]|['"]INSERT.*\+.*['"]|['"]UPDATE.*\+.*['"]/i,
      severity: "critical",
      issue: "SQL injection vulnerability — concatenating user input into SQL",
      fix: "Use parameterized queries / prepared statements",
    },
    {
      pattern: "innerHTML",
      regex: /\.innerHTML\s*=/,
      severity: "major",
      issue: "Cross-Site Scripting (XSS) vulnerability",
      fix: "Use .textContent or sanitize with DOMPurify before setting innerHTML",
    },
    {
      pattern: "hardcoded password",
      regex: /(password|passwd|pwd)\s*=\s*['"][^'"]+['"]/i,
      severity: "major",
      issue: "Hardcoded credentials — never commit secrets",
      fix: "Use environment variables or a secrets manager",
    },
    {
      pattern: "MD5/SHA1 for password",
      regex: /md5\s*\(|sha1\s*\(|MD5|SHA1.*hash/,
      severity: "major",
      issue: "Weak cryptographic hash for passwords",
      fix: "Use bcrypt, scrypt, or Argon2 for password hashing",
    },
  ],
  performance: [
    {
      pattern: "nested loop over large data",
      regex: /for\s*\([^)]*\)\s*\{[^}]*for\s*\(/,
      severity: "minor",
      issue: "Nested loop — potential O(n²) complexity",
      fix: "Consider hash map or more efficient algorithm",
    },
    {
      pattern: "sequential awaits in loop",
      regex: /for\s*\([^)]*\)\s*\{[^}]*await[^}]*await/,
      severity: "major",
      issue: "Sequential awaits in loop — should use Promise.all()",
      fix: "Use Promise.all() or Promise.allSettled() for parallel execution",
    },
  ],
  reliability: [
    {
      pattern: "empty catch",
      regex: /catch\s*\([^)]*\)\s*\{\s*\}/,
      severity: "critical",
      issue: "Empty catch block — errors silently swallowed",
      fix: "Log error or re-throw with context",
    },
    {
      pattern: "setTimeout without clear",
      regex: /setTimeout\([^)]*\)[^}]*clearTimeout/,
      severity: "major",
      issue: "Memory leak — timer not cleared",
      fix: "Store timer ID and call clearTimeout() in cleanup",
    },
  ],
};
```

---

### 2.6 Statistical Pitfalls (Analyst)

**File**: `src/knowledge/analyst/stat-pitfalls.ts`

```typescript
export const STAT_PITFALLS: Array<{
  name: string;
  description: string;
  detectionPatterns: string[];
  severity: "critical" | "major" | "minor";
  suggestion: string;
}> = [
  {
    name: "Small Sample Size",
    description: "Conclusions drawn from too few data points",
    detectionPatterns: ["n=1", "n=2", "sample.*small", "few.*subjects"],
    severity: "major",
    suggestion: "Increase sample size or add confidence intervals",
  },
  {
    name: "Missing Statistical Significance",
    description: "Claiming significance without p-value or confidence interval",
    detectionPatterns: ["significant.*but", "improved.*but", "no.*p.*value"],
    severity: "critical",
    suggestion: "Report p-values and confidence intervals",
  },
  {
    name: "Multiple Comparisons Problem",
    description: "Running many tests without correction increases false positives",
    detectionPatterns: ["tested.*multiple", "many.*comparisons", "bonferroni"],
    severity: "major",
    suggestion: "Apply Bonferroni or FDR correction for multiple comparisons",
  },
  {
    name: "Selection Bias",
    description: "Non-random sample selection",
    detectionPatterns: ["convenience.*sample", "self.*select", "volunteer"],
    severity: "major",
    suggestion: "Use random sampling or acknowledge limitation",
  },
  {
    name: "Effect Size Not Reported",
    description: "Statistical significance without practical significance",
    detectionPatterns: ["p.*value.*significant", "statistically.*significant.*but"],
    severity: "minor",
    suggestion: "Report effect size (Cohen's d, odds ratio, etc.)",
  },
];
```

---

### 2.7 Citation Styles (Writer)

**File**: `src/knowledge/writer/citation-styles.ts`

```typescript
export const CITATION_STYLES: Record<string, {
  name: string;
  inTextFormat: string;       // e.g., "(Author, Year)"
  referenceFormat: string;   // e.g., "Author, A. (Year). Title. Journal."
  useCase: string;
}> = {
  apa: {
    name: "APA 7th Edition",
    inTextFormat: "(Author, Year) or Author (Year)",
    referenceFormat: "Author, A. A., & Author, B. B. (Year). Title of article. Journal Name, Volume(Issue), pages.",
    useCase: "Psychology, Education, Social Sciences",
  },
  mla: {
    name: "MLA 9th Edition",
    inTextFormat: "(Author Page)",
    referenceFormat: "Author Last, First. \"Title.\" Journal, vol. X, no. Y, Year, pp. XX-YY.",
    useCase: "Literature, Languages, Cultural Studies",
  },
  chicago: {
    name: "Chicago 17th (Notes-Bibliography)",
    inTextFormat: "Footnote number or (Author Year)",
    referenceFormat: "Author Last, First. Title. Place: Publisher, Year.",
    useCase: "History, Arts, Humanities",
  },
  ieee: {
    name: "IEEE",
    inTextFormat: "[Number]",
    referenceFormat: "[1] A. Author, \"Title,\" Journal, vol. X, no. Y, pp. XX-YY, Month Year.",
    useCase: "Engineering, Computer Science, Physics",
  },
  harvard: {
    name: "Harvard",
    inTextFormat: "(Author, Year)",
    referenceFormat: "Author (Year) Title. Journal, Volume (Issue), pages.",
    useCase: "Business, Economics, Politics",
  },
};
```

---

## Phase 3: Pipeline Optimization

### 3.1 Orchestrator — Domain-Specific Decomposition

**File**: `src/agents/skills/orchestrator/decomposition.ts`

```typescript
/**
 * Domain-Specific Task Decomposition
 *
 * Detects domain from topic keywords and applies
 * domain-specific decomposition rules.
 */

export type ResearchDomain =
  | "ai_ml"
  | "biotech"
  | "finance"
  | "climate"
  | "energy"
  | "materials"
  | "robotics"
  | "general";

const DOMAIN_KEYWORDS: Record<ResearchDomain, string[]> = {
  ai_ml: ["machine learning", "neural network", "deep learning", "llm", "transformer", "ai", "gpt", "bert", "diffusion"],
  biotech: ["protein", "gene", "crispr", "drug", "vaccine", "mrna", "cell therapy", "genome"],
  finance: ["stock", "trading", "risk", "portfolio", "blockchain", "crypto", "defi", "fintech"],
  climate: ["climate", "carbon", "emissions", "sustainability", "renewable", "energy"],
  energy: ["solar", "battery", "storage", "nuclear", "fusion", "grid"],
  materials: ["battery", "semiconductor", "polymer", "nanomaterial", "catalyst"],
  robotics: ["robot", "autonomous", "drone", "manipulator", "locomotion"],
  general: [],
};

export function detectDomain(topic: string): ResearchDomain {
  const lower = topic.toLowerCase();
  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      return domain as ResearchDomain;
    }
  }
  return "general";
}

export const DOMAIN_DECOMPOSITION_RULES: Record<ResearchDomain, {
  defaultSubtasks: string[];
  specialConsiderations: string[];
  recommendedAgents: string[];
}> = {
  ai_ml: {
    defaultSubtasks: [
      "Literature survey: transformer architectures and training methods",
      "Benchmark analysis: performance metrics and datasets",
      "Training dynamics: data efficiency, compute scaling, emergent capabilities",
      "Safety and alignment: RLHF, constitutional AI, interpretability",
      "Applications and ablation studies",
    ],
    specialConsiderations: [
      "Check arXiv for latest preprints (ML moves fast)",
      "Distinguish claimed vs actual improvements",
      "Check compute requirements for reproducibility",
    ],
    recommendedAgents: ["researcher", "reasoner", "analyst", "coder"],
  },
  // ... other domains
  general: {
    defaultSubtasks: [
      "Define research question and scope",
      "Survey existing literature",
      "Identify key debates and gaps",
      "Synthesize findings and draw conclusions",
    ],
    specialConsiderations: [
      "Scope creep — keep focused on original question",
    ],
    recommendedAgents: ["researcher", "reasoner", "writer"],
  },
};
```

---

### 3.2 Reasoner — LLM-Based Trend Analysis

**File**: `src/agents/skills/reasoner/trend-analysis.ts`

Replace keyword-based `identifyResearchTrends()` in `reasoner.ts` with LLM-based analysis:

```typescript
/**
 * LLM-Based Research Trend Analysis
 *
 * Uses LLM to analyze research evolution instead of
 * simple keyword matching.
 */

export async function analyzeResearchTrends(
  findings: Finding[],
  insights: Insight[]
): Promise<{
  rising: Array<{ topic: string; reasoning: string }>;
  declining: Array<{ topic: string; reasoning: string }>;
  stable: Array<{ topic: string; reasoning: string }>;
  paradigmShifts: Array<{ from: string; to: string; evidence: string }>;
}> {
  // LLM prompt with all findings + insights
  // Ask for structured trend analysis with reasoning chains
  // Return structured output
}
```

---

## Phase 4: Advanced Features

### 4.1 Cross-Session Insight Comparison

Prevents generating duplicate insights across sessions.

**New file**: `src/agents/skills/reasoner/cross-session.ts`

```typescript
export async function compareWithPastInsights(
  newInsights: Insight[],
  sessionId: string
): Promise<{
  duplicates: Array<{ new: Insight; existing: Insight; similarity: number }>;
  novelInsights: Insight[];
  complementary: Array<{ new: Insight; extends: Insight }>;
}> {
  // Query Knowledge Hub for similar past insights
  // Compare using similarity score
  // Categorize: duplicate, novel, or complementary
}
```

### 4.2 Agent Self-Reflection Loop

Add post-task self-reflection for each agent:

```typescript
async function agentSelfReflect(
  agentName: string,
  task: string,
  output: unknown
): Promise<{ quality: number; issues: string[]; improvements: string[] }> {
  // LLM reviews own output
  // Checks: completeness, correctness, potential improvements
  // Returns structured self-assessment
}
```

---

## Per-File Change Log

### Files to CREATE (Phase 1)

| File | Purpose | Priority |
|------|---------|----------|
| `src/agents/skills/researcher/source-quality.ts` | Source quality scoring | HIGH |
| `src/agents/skills/researcher/citation-network.ts` | Citation network analysis | MEDIUM |
| `src/agents/skills/coder/test-generation.ts` | Dedicated test generation | HIGH |
| `src/agents/skills/analyst/temporal-analysis.ts` | Time-series analysis | MEDIUM |
| `src/agents/skills/analyst/anomaly-detection.ts` | Outlier/anomaly detection | MEDIUM |
| `src/agents/skills/writer/technical-blog.ts` | Technical blog writing | MEDIUM |
| `src/agents/skills/orchestrator/decomposition.ts` | Domain-specific decomposition | HIGH |
| `src/agents/skills/reasoner/trend-analysis.ts` | LLM-based trend analysis | HIGH |

### Files to MODIFY (Phase 0 + 1)

| File | Change | Priority |
|------|--------|----------|
| `src/agents/coder.ts` | Fix ReferenceError bug | CRITICAL |
| `src/agents/orchestrator.ts` | Integrate selfReview() | HIGH |
| `src/agents/researcher.ts` | Add source quality filter | HIGH |
| `src/agents/researcher.ts` | Fix prompt language | MEDIUM |
| `src/agents/reasoner.ts` | Replace keyword trends w/ LLM | HIGH |
| `src/agents/reasoner.ts` | Add evidence hierarchy weighting | MEDIUM |
| `src/agents/analyst.ts` | Add temporal + anomaly skills | MEDIUM |
| `src/agents/writer.ts` | Add technical blog mode | MEDIUM |

### Files to CREATE (Phase 2 — Knowledge Bases)

| File | Purpose |
|------|---------|
| `src/knowledge/researcher/source-quality-rules.ts` | Source scoring heuristics |
| `src/knowledge/researcher/search-templates.ts` | Domain query templates |
| `src/knowledge/researcher/citation-patterns.ts` | Citation patterns |
| `src/knowledge/reasoner/evidence-hierarchy.ts` | Evidence quality levels |
| `src/knowledge/reasoner/methodology-taxonomy.ts` | Methodology classification |
| `src/knowledge/reasoner/cross-domain-mappings.ts` | Cross-field transfers |
| `src/knowledge/coder/language-best-practices.ts` | Per-language idioms |
| `src/knowledge/coder/bug-patterns.ts` | Common bug patterns |
| `src/knowledge/coder/test-frameworks.ts` | Testing frameworks |
| `src/knowledge/analyst/stat-pitfalls.ts` | Statistical traps |
| `src/knowledge/analyst/visualization-types.ts` | Chart selection guide |
| `src/knowledge/writer/citation-styles.ts` | Citation format guides |
| `src/knowledge/writer/document-templates.ts` | Document structures |
| `src/knowledge/writer/style-guide.ts` | Writing style rules |
| `src/knowledge/reviewer/logical-fallacies.ts` | Fallacy taxonomy |
| `src/knowledge/reviewer/stat-red-flags.ts` | Statistical red flags |
| `src/knowledge/reviewer/reproducibility-checklist.ts` | Reproducibility criteria |

---

## Execution Order

```
Week 0:
  ├── Fix coder.ts bug (CRITICAL)
  ├── Integrate selfReview()
  └── Standardize prompts to Vietnamese

Week 1:
  ├── Create knowledge base structure
  ├── Implement evidence-hierarchy.ts
  ├── Implement bug-patterns.ts
  ├── Implement logical-fallacies.ts
  └── Implement source-quality scoring

Week 2:
  ├── Implement test-generation.ts
  ├── Implement domain-decomposition.ts
  ├── Integrate source quality into researcher.ts
  └── Add technical-blog writing mode

Week 3:
  ├── LLM-based trend analysis
  ├── Temporal + anomaly detection
  ├── Cross-domain mappings
  └── Integrate knowledge bases into agents

Week 4:
  ├── Cross-session insight comparison
  ├── Agent self-reflection loop
  └── Advanced features polish
```
