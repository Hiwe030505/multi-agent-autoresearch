# Coder Agent — Prompt & Skills Reference

**File**: `src/agents/coder.ts`
**Score**: 6/10 ⚠️ CRITICAL BUG
**Status**: BROKEN — `CODE_GENERATION_TEMPLATE` ReferenceError

---

## 🔴 CRITICAL BUG

```typescript
// Line 30: Duplicate constant declaration (unused)
const CODE_GENERATION_PROMPT = `You are generating production-ready code...`;

// Line 57-84: generateCode() function
export async function generateCode(task, findings, language, requirements) {
  const response = await claudeChat([{
    role: "user",
    content: CODE_GENERATION_TEMPLATE  // ← LINE 71: REFERENCE ERROR!
      .replace("{research_context}", ...)
      .replace("{task}", task)
      ...
  }], ...);
}

// Line 86-112: ACTUAL constant definition (comes AFTER usage!)
const CODE_GENERATION_TEMPLATE = `You are generating production-ready code based on research findings.
Research context: {research_context}
...`
```

**Root Cause**: ES modules don't hoist `const`. When `generateCode()` executes, `CODE_GENERATION_TEMPLATE` is not yet defined.

**Fix**: Move `CODE_GENERATION_TEMPLATE` definition to line 12 (after imports), rename to `CODE_GENERATION_PROMPT`, update line 71.

---

## System Prompt

```typescript
const SYSTEM_PROMPT = `Bạn là Senior Software Engineer với 15 năm kinh nghiệm.
Bạn viết code sạch, hiệu quả, có documentation, và có unit tests.
Luôn tuân thủ best practices cho từng ngôn ngữ.
Code phải production-ready, không phải prototype.`;
```

---

## Functions

### 1. generateCode()

```typescript
async function generateCode(
  task: string,
  findings: Finding[] = [],
  language = "python",
  requirements = "None",
): Promise<CodeResult>
```

**Output**:
```typescript
{
  code: string;         // full code implementation
  language: string;     // python|typescript|go|rust
  explanation: string;  // how it works
  tests?: string;      // unit tests (in prompt, not separate)
  files: Array<{ name: string; content: string }>;
  quality: number;      // 0.0-1.0
}
```

---

### 2. reviewCode()

```typescript
async function reviewCode(
  code: string,
  language = "python",
): Promise<{ issues: string[]; suggestions: string[]; score: number }>
```

**Checks**: Correctness, style, security, performance
**Output**: JSON with issues[], suggestions[], score 0-100

---

### 3. debugAndFix()

```typescript
async function debugAndFix(
  code: string,
  error: string,
  language = "python",
): Promise<{ fixedCode: string; explanation: string }>
```

---

## Missing Skills

### 1. Test Generation (Priority: HIGH)

**Status**: Tests are mentioned in prompt but no dedicated function

**Should be**:
```typescript
async function generateTests(
  code: string,
  language: string,
  framework?: string,    // auto-detect
  coverage?: number,     // target %
): Promise<{
  tests: string;
  framework: string;
  testCases: string[];
  coverage: number;
  edgeCases: string[];
}>
```

### 2. API Design (Priority: MEDIUM)

**Status**: Not implemented

**Should generate OpenAPI specs from description**.

### 3. Security Scanning (Priority: HIGH)

**Status**: Not implemented

Should integrate `src/knowledge/coder/bug-patterns.ts` to auto-detect vulnerabilities.

---

## Improved Code Generation Prompt

```typescript
const CODE_GENERATION_PROMPT_V2 = `Bạn là Senior Software Engineer với 15 năm kinh nghiệm.
Nhiệm vụ: Viết production-ready code dựa trên research findings.

RESEARCH CONTEXT:
{research_context}

TASK: {task}
LANGUAGE: {language}
REQUIREMENTS: {requirements}

YÊU CẦU:
1. Code PHẢI production-ready — không phải prototype
2. Include tất cả imports và dependencies
3. Handle errors gracefully (try/catch)
4. Add inline comments cho complex logic
5. Unit tests PHẢI runnable, cover edge cases
6. Tuân thủ style guide của từng ngôn ngữ:
   - Python: PEP 8, type hints, docstrings
   - TypeScript: strict mode, interfaces
   - Go: error handling, idiomatic Go
   - Rust: ownership, lifetime annotations

OUTPUT JSON:
{{
  "code": "full implementation",
  "language": "python|typescript|go|rust",
  "explanation": "cách hoạt động + tại sao chọn approach này",
  "tests": "corresponding unit tests",
  "files": [
    {{"name": "filename.ext", "content": "file content"}}
  ],
  "quality": 0.0-1.0 confidence,
  "edge_cases_handled": ["list of edge cases"],
  "dependencies": ["list of packages to install"]
}}

QUAN TRỌNG:
- Viết CODE THỰC SỰ, không pseudocode
- Tests phải cover happy path + edge cases
- Include error handling`;
```

---

# Analyst Agent — Prompt & Skills Reference

**File**: `src/agents/analyst.ts`
**Score**: 7/10
**Status**: Functional, có room for improvement

---

## System Prompt

```typescript
const SYSTEM_PROMPT = `Bạn là Senior Data Scientist với 15 năm kinh nghiệm.
Phân tích dữ liệu cẩn thận, đưa ra insights có data-driven.
Trực quan hóa bằng các chart/table rõ ràng.
Luôn chỉ ra confidence level và limitations.`;
```

---

## Functions

### 1. analyzeFindings()

```typescript
async function analyzeFindings(
  findings: Finding[],
  focus?: string,
): Promise<AnalysisResult>
```

**Output**:
```typescript
{
  summary: string;                    // 2-3 sentence overview
  statistics: Record<string, number>;  // avg_confidence, papers_count, etc.
  visualizations: VisualizationSpec[]; // chart specs
  comparisons: Comparison[];          // approach comparisons
  conclusions: string[];               // key takeaways
  quality: number;                    // 0.0-1.0
}
```

**Visualization Types**: bar, line, pie, scatter, table, heatmap

---

### 2. compareApproaches()

```typescript
async function compareApproaches(
  approaches: Array<{
    name: string;
    metrics: Record<string, number>;
    description: string;
  }>
): Promise<{
  ranking: Array<{ name: string; score: number; reasoning: string }>;
  radarData: Record<string, number[]>;
}>
```

---

### 3. generateBenchmarkReport()

```typescript
async function generateBenchmarkReport(
  benchmarks: Array<{
    name: string;
    dataset: string;
    metric: string;
    value: number;
    unit: string;
  }>
): Promise<string>  // markdown report
```

---

## Missing Skills

### 1. Temporal/Time-Series Analysis (Priority: MEDIUM)

Not implemented. Should analyze research evolution over time.

### 2. Anomaly/Outlier Detection (Priority: MEDIUM)

Not implemented. Should flag outlier claims or data points.

### 3. Longitudinal Data Analysis (Priority: LOW)

Not implemented. Should analyze data across multiple time points.

---

## Improved Analyze Findings Prompt

```typescript
const ANALYZE_FINDINGS_PROMPT_V2 = `Bạn là Senior Data Scientist — phân tích research findings một cách chính xác.

Nhiệm vụ: Phân tích {n} research findings để tìm patterns, so sánh approaches, và đưa ra conclusions.

FINDINGS:
{findingsText}

FOCUS: {focus || "general analysis"}

PHÂN TÍCH YÊU CẦU:

1. STATISTICAL SUMMARY:
   - avg_confidence, confidence_distribution
   - papers_count, web_sources_count
   - methodological_diversity (experimental vs observational vs review)

2. PATTERN DETECTION:
   - Techniques/methods used across findings
   - Common benchmarks/datasets
   - Consistent vs contradictory claims

3. COMPARISONS:
   So sánh approaches theo:
   - Performance metrics (accuracy, speed, cost)
   - Scalability
   - Reproducibility
   - Limitations

4. VISUALIZATIONS:
   Tạo specs cho visualizations có thể render:
   - bar: so sánh approaches
   - pie: methodology distribution
   - table: benchmark comparison
   - heatmap: method × metric matrix

5. LIMITATIONS:
   - Sample size issues
   - Missing context
   - Potential biases

OUTPUT JSON:
{{
  "summary": "2-3 sentence overview",
  "statistics": {{
    "total_findings": number,
    "avg_confidence": number,
    "papers_count": number,
    "web_sources_count": number,
    "methodology_distribution": {{"experimental": n, "observational": n, "review": n}}
  }},
  "patterns": [
    {{"pattern": "description", "occurrences": n, "confidence": 0.0-1.0}}
  ],
  "visualizations": [...],
  "comparisons": [...],
  "conclusions": ["key takeaway 1", "key takeaway 2"],
  "limitations": ["limitation 1", "limitation 2"],
  "quality": 0.0-1.0
}}`;
```

---

## Statistical Pitfalls to Check (from Knowledge Base)

| Pitfall | Detection | Severity |
|---------|-----------|----------|
| Small Sample Size | `n=1`, `few subjects` | major |
| Missing p-value | `significant but` without p-value | critical |
| Multiple Comparisons | `tested multiple`, `bonferroni` | major |
| Effect Size Not Reported | `statistically significant` without effect size | minor |
| Selection Bias | `convenience sample`, `self-selected` | major |
