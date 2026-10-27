// All source defaults live here. Settings edits persist in SQLite; defaults only seed a new database.
import type { Source } from "../shared/types.ts";
export const SYNC_INTERVAL_MS = 45 * 60 * 1000;
export const MANUAL_COOLDOWN_MS = 30 * 1000;
export const DEFAULT_PROMPT =
  "Follow AI and machine learning, local language models, and quantum computing. Prioritize research papers and practical open-source tools.";
export const DEFAULT_SOURCES: Source[] = [
  {
    id: "arxiv-ai",
    kind: "arxiv",
    name: "arXiv · AI & learning",
    enabled: true,
    config: { categories: ["cs.AI", "cs.LG", "cs.CL"] },
    lastSuccess: null,
    lastAttempt: null,
    error: null,
  },
  {
    id: "arxiv-quantum",
    kind: "arxiv",
    name: "arXiv · Quantum physics",
    enabled: true,
    config: { categories: ["quant-ph"] },
    lastSuccess: null,
    lastAttempt: null,
    error: null,
  },
  {
    id: "hackernews",
    kind: "hn",
    name: "Hacker News",
    enabled: true,
    config: { limit: 120 },
    lastSuccess: null,
    lastAttempt: null,
    error: null,
  },
  {
    id: "github-transformers",
    kind: "github",
    name: "GitHub · Transformers",
    enabled: true,
    config: { repo: "huggingface/transformers" },
    lastSuccess: null,
    lastAttempt: null,
    error: null,
  },
  {
    id: "github-webllm",
    kind: "github",
    name: "GitHub · WebLLM",
    enabled: true,
    config: { repo: "mlc-ai/web-llm" },
    lastSuccess: null,
    lastAttempt: null,
    error: null,
  },
  {
    id: "github-qiskit",
    kind: "github",
    name: "GitHub · Qiskit",
    enabled: true,
    config: { repo: "Qiskit/qiskit" },
    lastSuccess: null,
    lastAttempt: null,
    error: null,
  },
];

// Deterministic prompt-to-feed routing. Custom subjects remain available through Source library.
export const INTEREST_ARXIV_CATEGORIES: Record<string, string[]> = {
  "AI & machine learning": ["cs.AI", "cs.LG", "cs.CL"],
  "Quantum computing": ["quant-ph"],
  Robotics: ["cs.RO"],
  "Biology & health": ["q-bio.BM", "q-bio.GN"],
  "Systems & software": ["cs.DC", "cs.PL", "cs.DB"],
  Security: ["cs.CR"],
};
