/**
 * Config loader — supports ~/.autoresearchrc (JSON or YAML)
 *
 * Priority: CLI flags > env vars > config file > defaults
 */

import { readFileSync, existsSync } from "fs";
import { homedir } from "os";
import { resolve } from "path";

export interface CliConfig {
  provider: string;
  model: {
    orchestrator: string;
    reasoning: string;
    research: string;
    writer: string;
  };
  search: {
    tavilyKey: string;
    maxResults: number;
  };
  output: {
    defaultFormat: "text" | "json" | "md" | "html";
    defaultDir: string;
  };
}

const DEFAULT_CONFIG: CliConfig = {
  provider: "groq",
  model: {
    orchestrator: "llama-3.3-70b-versatile",
    reasoning: "llama-3.3-70b-versatile",
    research: "llama-3.3-70b-versatile",
    writer: "llama-3.3-70b-versatile",
  },
  search: {
    tavilyKey: "",
    maxResults: 8,
  },
  output: {
    defaultFormat: "text",
    defaultDir: "./output",
  },
};

export function loadConfig(): CliConfig {
  const configPath = resolve(homedir(), ".autoresearchrc");
  const localPath = resolve(process.cwd(), ".autoresearchrc");

  let fileConfig: Partial<CliConfig> = {};

  for (const path of [configPath, localPath]) {
    if (existsSync(path)) {
      try {
        const raw = readFileSync(path, "utf-8").trim();
        if (path.endsWith(".json") || path.endsWith("rc")) {
          fileConfig = JSON.parse(raw);
        } else if (path.endsWith(".yaml") || path.endsWith(".yml")) {
          // Simple YAML parser for basic key-value pairs
          fileConfig = parseSimpleYaml(raw);
        }
        break;
      } catch (e) {
        console.warn(`[Config] Failed to load ${path}:`, (e as Error).message);
      }
    }
  }

  return deepMerge(DEFAULT_CONFIG, fileConfig);
}

function deepMerge(base: CliConfig, override: Partial<CliConfig>): CliConfig {
  const result = {
    provider: override.provider ?? base.provider,
    model: {
      orchestrator: (override.model?.orchestrator ?? base.model.orchestrator),
      reasoning: (override.model?.reasoning ?? base.model.reasoning),
      research: (override.model?.research ?? base.model.research),
      writer: (override.model?.writer ?? base.model.writer),
    },
    search: {
      tavilyKey: (override.search?.tavilyKey ?? base.search.tavilyKey),
      maxResults: (override.search?.maxResults ?? base.search.maxResults),
    },
    output: {
      defaultFormat: (override.output?.defaultFormat ?? base.output.defaultFormat),
      defaultDir: (override.output?.defaultDir ?? base.output.defaultDir),
    },
  };
  return result;
}

// Very simple YAML parser for flat key-value structures
function parseSimpleYaml(raw: string): Partial<CliConfig> {
  const result: Record<string, unknown> = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx > 0) {
      const key = trimmed.slice(0, colonIdx).trim();
      const val = trimmed.slice(colonIdx + 1).trim();
      // Top-level keys
      if (key.includes(".")) {
        const [section, sub] = key.split(".");
        if (!result[section]) result[section] = {};
        (result[section] as Record<string, unknown>)[sub] = parseValue(val);
      } else {
        result[key] = parseValue(val);
      }
    }
  }
  return result as Partial<CliConfig>;
}

function parseValue(val: string): unknown {
  if (val === "true") return true;
  if (val === "false") return false;
  const num = Number(val);
  if (!isNaN(num) && val !== "") return num;
  return val.replace(/^["']|["']$/g, "");
}
