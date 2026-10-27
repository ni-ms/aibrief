export const TOPICS: Record<string, string[]> = {
  "AI & machine learning": [
    "artificial intelligence",
    "machine learning",
    "llm",
    "large language",
    "neural",
    "transformer",
    "inference",
    "diffusion",
    "reinforcement learning",
    "ai",
    "cs.ai",
    "cs.lg",
  ],
  "Quantum computing": [
    "quantum",
    "qubit",
    "qiskit",
    "quant-ph",
    "quantum error",
  ],
  Robotics: ["robot", "robotics", "embodied", "cs.ro"],
  "Biology & health": ["biology", "protein", "genomics", "biotech", "q-bio"],
  "Systems & software": [
    "compiler",
    "database",
    "distributed systems",
    "programming",
    "software",
    "webgpu",
  ],
  Security: ["security", "cryptography", "vulnerability", "encryption"],
};
/** Treat ordinary hyphen/space variants alike while preserving whole-word boundaries. */
export function countMatches(text: string, term: string) {
  const escaped = term
    .trim()
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/[\s-]+/g, "[\\s-]+");
  if (!escaped) return 0;
  return [
    ...text.matchAll(
      new RegExp(`(^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, "gi"),
    ),
  ].length;
}
export function matches(text: string, term: string) {
  return countMatches(text, term) > 0;
}
export function deriveTerms(prompt: string): string[] {
  const stop = new Set(
    "i me my am interested interests in and or the a an to of for with about latest recent new developments research papers tools focus follow track keep updated on please want technical practical especially from into breakthroughs computing learning show tell advances news like care would prefer looking understand".split(
      " ",
    ),
  );
  const words = prompt.toLowerCase().match(/[a-z][a-z0-9-]+/g) || [];
  const terms = words.filter((w) => !stop.has(w) && w.length > 2);
  for (const [topic, aliases] of Object.entries(TOPICS))
    if (aliases.some((t) => matches(prompt, t)) || matches(prompt, topic))
      terms.push(...aliases);
  return [...new Set(terms)].slice(0, 70);
}
export function labelTopics(text: string): string[] {
  const topics = Object.entries(TOPICS)
    .filter(([, terms]) => terms.some((t) => matches(text, t)))
    .map(([topic]) => topic);
  return topics.length ? topics : ["Other research"];
}
