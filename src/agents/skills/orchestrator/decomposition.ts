/**
 * Domain-Specific Task Decomposition
 *
 * Detects research domain from topic keywords and applies
 * domain-specific decomposition rules for better task breakdown.
 */

import type { Task, AgentName, Priority } from "../../types.ts";
import { v4 as uuidv4 } from "uuid";

// ─── Domain Keywords ──────────────────────────────────────────────────────────

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
  ai_ml: [
    "machine learning", "neural network", "deep learning", "llm", "transformer",
    "ai", "gpt", "bert", "diffusion", "vlm", "reinforcement learning",
    "rag", "fine-tuning", "multimodal", "embedding", "tokenizer", "attention",
    "vision language model", "speech", "nlp", "cv", "computer vision",
  ],
  biotech: [
    "protein", "gene", "crispr", "drug", "vaccine", "mrna", "cell therapy",
    "genome", "antibody", "bioinformatics", "omics", "metabolomics",
    "pharmacology", "clinical trial", "biosimilar", "rna",
  ],
  finance: [
    "stock", "trading", "risk", "portfolio", "blockchain", "crypto", "defi",
    "fintech", "credit", "fraud", "insurance", "asset pricing", "hedge fund",
    "quantitative", "derivatives", "bond", "equity",
  ],
  climate: [
    "climate", "carbon", "emissions", "sustainability", "renewable", "energy",
    "green hydrogen", "ccs", "net zero", "deforestation", "biodiversity",
    "climate model", "global warming", "sea level",
  ],
  energy: [
    "solar", "battery", "storage", "nuclear", "fusion", "grid", "ev",
    "wind turbine", "hydropower", "geothermal", "power electronics",
    "smart grid", "microgrid", "lithium",
  ],
  materials: [
    "battery", "semiconductor", "polymer", "nanomaterial", "catalyst",
    "superconductor", "graphene", "2d material", "thin film", "alloy",
    "ceramic", "composite", "glass", "metal-organic",
  ],
  robotics: [
    "robot", "autonomous", "drone", "manipulator", "locomotion",
    "humanoid", "grasping", "motion planning", "slam", "terrain",
    "swarm", "soft robot", "medical robot",
  ],
  general: [],
};

// ─── Domain Decomposition Rules ───────────────────────────────────────────────

interface SubtaskTemplate {
  title: string;
  description: string;
  type: "research" | "analysis" | "implementation" | "writing";
  priority: Priority;
  why: string;
}

const DOMAIN_DECOMPOSITION_RULES: Record<ResearchDomain, {
  defaultSubtasks: SubtaskTemplate[];
  specialConsiderations: string[];
  recommendedAgents: AgentName[];
}> = {
  ai_ml: {
    defaultSubtasks: [
      {
        title: "Literature survey: architectures and training methods",
        description: "Tìm hiểu các architectures và training methods hiện tại. So sánh approaches khác nhau.",
        type: "research",
        priority: 1,
        why: "Cần hiểu baseline trước khi đề xuất cải tiến",
      },
      {
        title: "Benchmark analysis: performance metrics",
        description: "Phân tích benchmarks và performance metrics. Kiểm tra claimed improvements có thực sự cải thiện không.",
        type: "analysis",
        priority: 1,
        why: "ML claims thường exaggerated — cần verify",
      },
      {
        title: "Training dynamics analysis",
        description: "Phân tích data efficiency, compute scaling, emergent capabilities. Tìm scaling laws.",
        type: "analysis",
        priority: 2,
        why: "Hiểu scalability để predict real-world performance",
      },
      {
        title: "Safety and alignment review",
        description: "Đánh giá RLHF, constitutional AI, interpretability, và potential risks.",
        type: "research",
        priority: 2,
        why: "Safety increasingly important trong ML research",
      },
      {
        title: "Code prototype + evaluation",
        description: "Generate code prototype dựa trên findings. Evaluate trên benchmarks.",
        type: "implementation",
        priority: 3,
        why: "Validate findings bằng practical implementation",
      },
    ],
    specialConsiderations: [
      "Check arXiv for latest preprints (ML moves fast — 6 tháng = outdated)",
      "Distinguish claimed vs actual improvements (thường inflated 5-20%)",
      "Check compute requirements cho reproducibility",
      "Verify dataset versions và evaluation protocols",
    ],
    recommendedAgents: ["researcher", "reasoner", "analyst", "coder"],
  },

  biotech: {
    defaultSubtasks: [
      {
        title: "Target identification and validation",
        description: "Research về biological targets (proteins, genes). Kiểm tra validation status.",
        type: "research",
        priority: 1,
        why: "Target validation là bottleneck đầu tiên",
      },
      {
        title: "Clinical trial data analysis",
        description: "Phân tích clinical trial results, phase progression, success rates.",
        type: "analysis",
        priority: 1,
        why: "Clinical data quyết định viability",
      },
      {
        title: "Mechanism of action review",
        description: "Phân tích MOA, off-target effects, safety profile.",
        type: "research",
        priority: 2,
        why: "MOA understanding quan trọng cho drug design",
      },
      {
        title: "Competitive landscape",
        description: "Phân tích competitors, pipeline drugs, market opportunity.",
        type: "analysis",
        priority: 2,
        why: "Market context quyết định commercial potential",
      },
      {
        title: "Literature review và synthesis",
        description: "Tổng hợp tất cả findings thành structured literature review.",
        type: "writing",
        priority: 3,
        why: "Document findings cho downstream use",
      },
    ],
    specialConsiderations: [
      "Phân biệt preclinical vs clinical evidence",
      "Kiểm tra trial phases và success probabilities",
      "Safety signals quan trọng hơn efficacy trong early stage",
      "Regulatory pathway context cần thiết",
    ],
    recommendedAgents: ["researcher", "analyst", "writer", "reasoner"],
  },

  finance: {
    defaultSubtasks: [
      {
        title: "Market structure analysis",
        description: "Phân tích market microstructure, liquidity, volatility patterns.",
        type: "research",
        priority: 1,
        why: "Market structure quyết định strategy viability",
      },
      {
        title: "Risk factor identification",
        description: "Xác định và quantify risk factors: market, credit, liquidity, operational.",
        type: "analysis",
        priority: 1,
        why: "Risk understanding là core của finance",
      },
      {
        title: "Quantitative model review",
        description: "Đánh giá quantitative models, assumptions, limitations.",
        type: "analysis",
        priority: 1,
        why: "Model flaws là source lớn của losses",
      },
      {
        title: "Regulatory landscape",
        description: "Research regulatory requirements và compliance considerations.",
        type: "research",
        priority: 2,
        why: "Regulation shapes what's possible",
      },
      {
        title: "Backtesting và performance analysis",
        description: "Backtest strategies với proper methodology. Evaluate Sharpe, drawdown, etc.",
        type: "analysis",
        priority: 2,
        why: "Backtest overfitting là common pitfall",
      },
    ],
    specialConsiderations: [
      "Quantify confidence — finance claims need statistical rigor",
      "Backtest overfitting: require out-of-sample validation",
      "Transaction costs và market impact often decisive",
      "Black swan events cần scenario analysis",
    ],
    recommendedAgents: ["analyst", "researcher", "writer", "coder"],
  },

  climate: {
    defaultSubtasks: [
      {
        title: "Emissions inventory analysis",
        description: "Phân tích emissions sources, scopes, và measurement methodologies.",
        type: "research",
        priority: 1,
        why: "Accurate emissions data là foundation",
      },
      {
        title: "Technology readiness assessment",
        description: "Đánh giá technology readiness levels (TRLs) của solutions.",
        type: "analysis",
        priority: 1,
        why: "Gap giữa lab và deployment thường huge",
      },
      {
        title: "Policy and economic analysis",
        description: "Phân tích policy mechanisms, carbon pricing, economic incentives.",
        type: "research",
        priority: 2,
        why: "Policy determines adoption rate",
      },
      {
        title: "Lifecycle assessment",
        description: "Full lifecycle emissions analysis cho technologies.",
        type: "analysis",
        priority: 2,
        why: "Scope 3 emissions thường dominate",
      },
      {
        title: "Scenario modeling review",
        description: "Đánh giá climate scenarios và model assumptions.",
        type: "analysis",
        priority: 2,
        why: "Model choice affects conclusions significantly",
      },
    ],
    specialConsiderations: [
      "Distinguish between emissions reduction vs removal",
      "Lifecycle thinking: full scope 3 assessment",
      "Policy uncertainty high — scenario analysis needed",
      "Technology cost curves cần recent data",
    ],
    recommendedAgents: ["researcher", "analyst", "writer", "reasoner"],
  },

  energy: {
    defaultSubtasks: [
      {
        title: "Technology cost analysis",
        description: "Phân tích LCOE, cost trajectories, và learning curves.",
        type: "analysis",
        priority: 1,
        why: "Cost is primary driver of energy transition",
      },
      {
        title: "Grid integration challenges",
        description: "Research grid stability, storage needs, và infrastructure requirements.",
        type: "research",
        priority: 1,
        why: "Grid integration là key bottleneck",
      },
      {
        title: "Performance and reliability data",
        description: "Phân tích real-world performance data, degradation rates.",
        type: "analysis",
        priority: 2,
        why: "Lab performance ≠ field performance",
      },
      {
        title: "Supply chain analysis",
        description: "Research critical materials, supply chain risks, và bottlenecks.",
        type: "research",
        priority: 2,
        why: "Supply chain can derail deployment",
      },
      {
        title: "Policy incentive landscape",
        description: "Research subsidies, tax credits, và regulatory support.",
        type: "research",
        priority: 3,
        why: "Policy economics often decisive",
      },
    ],
    specialConsiderations: [
      "LCOE vs LACE comparison important",
      "Capacity factor vs energy density context",
      "Storage duration requirements by use case",
      "Grid services value context-dependent",
    ],
    recommendedAgents: ["analyst", "researcher", "writer", "reasoner"],
  },

  materials: {
    defaultSubtasks: [
      {
        title: "Property-performance relationship",
        description: "Analyze relationships between material properties and application performance.",
        type: "analysis",
        priority: 1,
        why: "Core materials science question",
      },
      {
        title: "Synthesis and scalability",
        description: "Research synthesis methods, scalability challenges, và reproducibility.",
        type: "research",
        priority: 1,
        why: "Lab synthesis ≠ industrial production",
      },
      {
        title: "Characterization methods review",
        description: "Đánh giá characterization techniques và their limitations.",
        type: "research",
        priority: 2,
        why: "Measurement quality affects conclusions",
      },
      {
        title: "Comparative materials analysis",
        description: "So sánh materials theo multiple performance metrics.",
        type: "analysis",
        priority: 2,
        why: "Trade-offs between properties common",
      },
    ],
    specialConsiderations: [
      "Lab properties vs real-world durability",
      "Synthesis reproducibility is a major issue",
      "Characterization artifact avoidance",
      "Interface and defect effects often dominant",
    ],
    recommendedAgents: ["researcher", "analyst", "writer", "reasoner"],
  },

  robotics: {
    defaultSubtasks: [
      {
        title: "Task requirements analysis",
        description: "Analyze task complexity, environment constraints, và success metrics.",
        type: "analysis",
        priority: 1,
        why: "Task definition drives system design",
      },
      {
        title: "Hardware-software co-design",
        description: "Research hardware requirements và software-stack trade-offs.",
        type: "research",
        priority: 1,
        why: "Robot design is co-design problem",
      },
      {
        title: "Benchmark and evaluation review",
        description: "Review existing benchmarks, simulators, và evaluation protocols.",
        type: "research",
        priority: 2,
        why: "Sim-to-real gap là major challenge",
      },
      {
        title: "Failure mode analysis",
        description: "Identify failure modes, edge cases, và safety considerations.",
        type: "analysis",
        priority: 2,
        why: "Safety-critical applications require thorough failure analysis",
      },
    ],
    specialConsiderations: [
      "Sim-to-real gap: simulators ≠ reality",
      "Hardware iteration is slow and expensive",
      "Generalization: lab vs field performance gap",
      "Human-robot interaction safety requirements",
    ],
    recommendedAgents: ["researcher", "analyst", "coder", "reasoner"],
  },

  general: {
    defaultSubtasks: [
      {
        title: "Research question definition",
        description: "Define rõ research question và scope. Identify key variables.",
        type: "research",
        priority: 1,
        why: "Well-defined question prevents scope creep",
      },
      {
        title: "Literature survey",
        description: "Comprehensive literature survey về topic. Identify key papers và debates.",
        type: "research",
        priority: 1,
        why: "Know what exists before claiming novelty",
      },
      {
        title: "Evidence synthesis",
        description: "Tổng hợp evidence từ multiple sources. Identify consensus vs controversies.",
        type: "analysis",
        priority: 2,
        why: "Synthesis reveals true state of knowledge",
      },
      {
        title: "Gap identification",
        description: "Identify knowledge gaps, unanswered questions, và future directions.",
        type: "analysis",
        priority: 2,
        why: "Gap identification is key contribution",
      },
      {
        title: "Report writing",
        description: "Write structured report với findings, implications, và recommendations.",
        type: "writing",
        priority: 3,
        why: "Clear communication is essential",
      },
    ],
    specialConsiderations: [
      "Scope creep là common pitfall — stay focused",
      "Distinguish between empirical vs theoretical contributions",
      "Cite diverse sources, not just recent papers",
      "Acknowledge limitations upfront",
    ],
    recommendedAgents: ["researcher", "reasoner", "writer", "analyst"],
  },
};

// ─── Core Functions ───────────────────────────────────────────────────────────

/**
 * Detect research domain from topic keywords
 */
export function detectDomain(topic: string): ResearchDomain {
  const lower = topic.toLowerCase();
  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      return domain as ResearchDomain;
    }
  }
  return "general";
}

/**
 * Get domain metadata
 */
export function getDomainInfo(domain: ResearchDomain): {
  name: string;
  icon: string;
  color: string;
  specialConsiderations: string[];
  recommendedAgents: AgentName[];
} {
  const infos: Record<ResearchDomain, { name: string; icon: string; color: string }> = {
    ai_ml: { name: "AI / Machine Learning", icon: "🤖", color: "#8b5cf6" },
    biotech: { name: "Biotechnology", icon: "🧬", color: "#10b981" },
    finance: { name: "Finance", icon: "📈", color: "#f59e0b" },
    climate: { name: "Climate / Sustainability", icon: "🌍", color: "#06b6d4" },
    energy: { name: "Energy", icon: "⚡", color: "#eab308" },
    materials: { name: "Materials Science", icon: "🔬", color: "#6366f1" },
    robotics: { name: "Robotics", icon: "🦾", color: "#ec4899" },
    general: { name: "General Research", icon: "📚", color: "#64748b" },
  };
  return { ...infos[domain], ...DOMAIN_DECOMPOSITION_RULES[domain] };
}

/**
 * Generate domain-specific subtasks for a research topic
 */
export function generateDomainSubtasks(topic: string): {
  domain: ResearchDomain;
  domainInfo: ReturnType<typeof getDomainInfo>;
  subtasks: Task[];
  subtaskTemplates: SubtaskTemplate[];
} {
  const domain = detectDomain(topic);
  const domainInfo = getDomainInfo(domain);
  const rules = DOMAIN_DECOMPOSITION_RULES[domain];

  const subtasks = rules.defaultSubtasks.map((t, i) => createTask(
    t.title,
    t.description,
    t.type,
    t.priority,
  ));

  return { domain, domainInfo, subtasks, subtaskTemplates: rules.defaultSubtasks };
}

// ─── Task Factory ─────────────────────────────────────────────────────────────

function createTask(
  title: string,
  description: string,
  type: "research" | "analysis" | "implementation" | "writing",
  priority: Priority,
): Task {
  const agentMap: Record<string, AgentName> = {
    research: "researcher",
    analysis: "analyst",
    implementation: "coder",
    writing: "writer",
  };

  return {
    id: uuidv4(),
    title,
    description,
    type: agentMap[type] ?? "researcher",
    priority,
    status: "pending",
    assignedTo: agentMap[type] ?? "researcher",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    retryCount: 0,
  };
}
