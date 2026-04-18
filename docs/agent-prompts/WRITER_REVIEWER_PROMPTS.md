# Writer Agent — Prompt & Skills Reference

**File**: `src/agents/writer.ts`
**Score**: 8/10
**Status**: Good — 3 distinct output modes

---

## System Prompt

```typescript
const SYSTEM_PROMPT = `Bạn là Senior Technical Writer chuyên viết báo cáo nghiên cứu.
Viết rõ ràng, có cấu trúc, có citations.
Giải thích technical concepts sao cho người đọc không chuyên cũng hiểu được.
Luôn có: abstract, introduction, methodology, findings, discussion, conclusion.`;
```

---

## 3 Output Modes

### Mode 1: Literature Review

```typescript
async function writeLiteratureReview(
  topic: string,
  findings: Finding[],
): Promise<ReportResult>
```

**Structure** (8 sections):
1. Abstract (150-200 words)
2. Introduction (context + research question)
3. Methodology Overview (how sources were collected)
4. Key Findings (organized by theme, not by source)
5. Comparative Analysis
6. Discussion (what it means, implications)
7. Conclusion + Future Directions
8. References (list all sources)

**Prompt** (line 57-82):
```typescript
`Write a comprehensive literature review on the topic: "${topic}"

Use the following research findings as your sources:
${findingsText}

Write in academic style with proper structure. Include:
1. Abstract (150-200 words)
2. Introduction (context + research question)
3. Methodology Overview (how sources were collected)
4. Key Findings (organized by theme, not by source)
5. Comparative Analysis
6. Discussion (what it means, implications)
7. Conclusion + Future Directions
8. References (list all sources)`
```

---

### Mode 2: Deep Insights Report

```typescript
async function writeDeepInsightsReport(
  topic: string,
  insights: InsightSession,
): Promise<ReportResult>
```

**Structure**:
1. Executive Summary
2. Key Insights (each insight gets its own section)
3. Research Trends
4. Knowledge Gaps & Future Directions
5. Recommendations

**Prompt** (line 117-146):
```typescript
`Write a Deep Insights Report for research topic: "${topic}"

This report synthesizes ${insights.totalFindingsAnalyzed} research findings into actionable insights.

## Insights
${insightsText}

${gapsText}

${trendsText}

Write in engaging, accessible style.`
```

---

### Mode 3: Executive Brief

```typescript
async function writeExecutiveBrief(
  topic: string,
  findings: Finding[],
  insights: InsightSession,
): Promise<{ brief: string; actionableNextSteps: string[] }>
```

**Audience**: Decision makers (2-3 pages max)

**Structure**:
1. TL;DR (3 bullet points)
2. Key Findings (condensed)
3. Strategic Implications
4. Top 3 Actionable Recommendations
5. Risk Assessment

**Prompt** (line 163-184):
```typescript
`Write an executive brief (2-3 pages max) for decision-makers on: "${topic}"

Key Insights (top 5):
${topInsights}

Research Coverage: ${findings.length} sources analyzed

Include:
1. TL;DR (3 bullet points)
2. Key Findings (condensed)
3. Strategic Implications
4. Top 3 Actionable Recommendations
5. Risk Assessment`
```

---

## Missing Skills

### 1. Technical Blog Writing (Priority: MEDIUM)

**Status**: Not implemented

**Audience**: Developers, practitioners
**Tone**: Conversational but precise
**Format**: Hook → Problem → Solution → Examples → Conclusion

```typescript
async function writeTechnicalBlog(
  topic: string,
  findings: Finding[],
  insights: InsightSession,
): Promise<{
  title: string;
  subtitle: string;
  sections: Array<{
    heading: string;
    content: string;
    hasCodeSnippet: boolean;
  }>;
  estimatedReadTime: number;
}>
```

### 2. Presentation Outline (Priority: LOW)

**Status**: Mentioned in comment but not implemented

```typescript
async function writePresentationOutline(
  topic: string,
  findings: Finding[],
  insights: InsightSession,
): Promise<{
  slides: Array<{
    title: string;
    bullets: string[];
    notes: string;
    visual: "chart" | "diagram" | "table" | "none";
  }>;
  totalSlides: number;
}>
```

---

## Citation Styles (from Knowledge Base)

| Style | Format | Use Case |
|-------|--------|---------|
| APA 7 | (Author, Year) | Psychology, Education |
| MLA 9 | (Author Page) | Literature, Languages |
| Chicago 17 | Footnote | History, Arts |
| IEEE | [Number] | Engineering, CS, Physics |
| Harvard | (Author, Year) | Business, Economics |

---

# Reviewer Agent — Prompt & Skills Reference

**File**: `src/agents/reviewer.ts`
**Score**: 9/10 🏆 BEST AGENT (tied)
**Status**: Excellent — comprehensive review framework

---

## System Prompt

```typescript
const SYSTEM_PROMPT = `Bạn là Senior Reviewer với 15 năm kinh nghiệm trong QA và technical review.
Phát hiện vấn đề một cách chính xác và đưa ra feedback xây dựng.
Không quá khắt khe nhưng cũng không bỏ qua lỗi thật.
Ưu tiên: factual accuracy > logical consistency > completeness > style.`;
```

**Priority**: factual accuracy > logical consistency > completeness > style

---

## 4 Review Functions

### Function 1: reviewInsights()

```typescript
async function reviewInsights(
  insights: InsightSession,
  findings: Finding[],
): Promise<ReviewResult>
```

**Reviews**: Full insight quality assessment

**5 Review Criteria** (line 82-88):
1. Is the claim supported by the cited evidence?
2. Is the confidence score reasonable given the evidence?
3. Are there any logical fallacies or overgeneralizations?
4. Is the insight novel or just a restatement of existing findings?
5. Are citations accurate (do the cited finding IDs exist)?

**Output**:
```typescript
{
  approved: boolean;
  score: number;                    // 0-100
  issues: Issue[];                   // severity × type matrix
  suggestions: Suggestion[];
  verifiedClaims: Claim[];
  overallFeedback: string;
}
```

**Issue Types**:
- `severity`: critical | major | minor
- `type`: factual | logical | citation | completeness | style

---

### Function 2: reviewFinding()

```typescript
async function reviewFinding(
  finding: Finding,
  claims?: string[],
): Promise<{
  validClaims: Claim[];
  issues: Issue[];
  overallConfidence: number;
}>
```

**Reviews**: Single finding accuracy + claim verification

---

### Function 3: reviewCodeQuality()

```typescript
async function reviewCodeQuality(
  code: string,
  language = "python",
): Promise<ReviewResult>
```

**Checks** (line 208-215):
1. Syntax and logic errors
2. Security vulnerabilities
3. Performance bottlenecks
4. Error handling
5. Code style and readability
6. Test coverage gaps
7. Documentation quality

---

### Function 4: verifyCitation()

```typescript
async function verifyCitation(
  claim: string,
  finding: Finding,
): Promise<{
  supported: boolean;
  confidence: number;
  explanation: string;
}>
```

**Verifies**: Single claim against single finding source

---

## ReviewResult Structure

```typescript
interface ReviewResult {
  approved: boolean;
  score: number;              // 0-100
  issues: Issue[];
  suggestions: Suggestion[];
  verifiedClaims: Claim[];
  overallFeedback: string;
}

interface Issue {
  severity: "critical" | "major" | "minor";
  type: "factual" | "logical" | "citation" | "completeness" | "style";
  description: string;
  location?: string;
  recommendation: string;
}

interface Suggestion {
  type: "improvement" | "clarification" | "extension";
  description: string;
  impact: "high" | "medium" | "low";
}

interface Claim {
  claim: string;
  verified: boolean;
  evidence?: string;
  confidence: number;
}
```

---

## Missing Skills

### 1. Reproducibility Scoring (Priority: MEDIUM)

**Status**: Not implemented

Should assess whether findings can be reproduced:
- Is methodology described in sufficient detail?
- Are code/datasets available?
- Are assumptions stated?

```typescript
async function assessReproducibility(
  finding: Finding,
): Promise<{
  score: number;              // 0-10
  criteria: {
    methodologyClear: boolean;
    codeAvailable: boolean;
    dataAvailable: boolean;
    assumptionsStated: boolean;
  };
  recommendations: string[];
}>
```

### 2. Statistical Significance Validation (Priority: HIGH)

**Status**: Not implemented

Should validate:
- p-values reported
- Confidence intervals provided
- Effect sizes stated
- Sample sizes adequate

### 3. Peer-Review Style Feedback (Priority: MEDIUM)

**Status**: Not implemented

Should generate feedback in peer-review paper style.

---

## Logical Fallacies to Detect (from Knowledge Base)

| Fallacy | Severity | Detection Patterns |
|---------|----------|--------------------|
| Confirmation Bias | major | "only evidence supporting", "ignore contrary" |
| Survivorship Bias | major | "successful cases", "survivors ignored" |
| P-Hacking | critical | "p-value hacking", "data dredging" |
| HARKing | major | "as predicted", "retrospectively" |
| Correlation = Causation | major | "therefore causes", "leads to result" |
| Base Rate Fallacy | minor | "unlikely to happen", "high probability" |

---

## Recommended Review Prompts (Improved)

### Improved reviewInsights() Prompt

```typescript
const REVIEW_INSIGHTS_PROMPT_V2 = `Bạn là Senior Peer Reviewer — đánh giá research insights với sự chính xác cao.

Nhiệm vụ: Review ${insights.insights.length} insights từ ${findings.length} source findings.

INSIGHTS TO REVIEW:
${insightsText}

SOURCE FINDINGS:
${findingsText}

REVIEW CRITERIA (theo thứ tự ưu tiên):

1. FACTUAL ACCURACY (độ chính xác sự kiện):
   - Claim có được hỗ trợ bởi cited evidence?
   - Evidence có đủ mạnh để support claim?
   - Có bịa đặt hoặc overstate không?

2. LOGICAL CONSISTENCY (tính logic):
   - Có logical fallacies không?
     • Confirmation bias: chỉ cite evidence ủng hộ
     • Survivorship bias: chỉ nhìn successful cases
     • Correlation = causation: assume causation từ correlation
     • HARKing: hypothesize after results known
   - Conclusions có logically follow từ evidence?

3. EVIDENCE QUALITY:
   - Confidence score có phù hợp với evidence strength?
   - Có cite ít nhất 2 independent sources?
   - Evidence có từ peer-reviewed hay preprint?

4. NOVELTY:
   - Insight có novel contribution hay chỉ restate known findings?
   - Có add genuine value beyond summary?

5. CITATION ACCURACY:
   - Cited finding IDs có tồn tại?
   - Claims match với cited sources?

OUTPUT JSON:
{{
  "approved": boolean,           // true if score >= 70 AND no critical issues
  "score": 0-100,
  "issues": [
    {{
      "severity": "critical|major|minor",
      "type": "factual|logical|citation|completeness|style",
      "description": "what's wrong",
      "location": "which insight",
      "recommendation": "how to fix"
    }}
  ],
  "suggestions": [
    {{
      "type": "improvement|clarification|extension",
      "description": "suggestion",
      "impact": "high|medium|low"
    }}
  ],
  "verifiedClaims": [
    {{
      "claim": "exact claim text",
      "verified": true|false,
      "evidence": "supporting or contradicting evidence",
      "confidence": 0.0-1.0
    }}
  ],
  "fallacyCheck": [
    {{
      "fallacy": "fallacy name or null",
      "insight": "which insight",
      "explanation": "where detected"
    }}
  ],
  "overallFeedback": "summary paragraph"
}}`;
```
