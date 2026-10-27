// Compatibility exports for existing consumers. Adapters live in server/sources/.
export { parseArxiv } from "./sources/arxiv.ts";
export { parseReleases } from "./sources/github.ts";
export { parseHN } from "./sources/hackernews.ts";
export { parseMediumFeed } from "./sources/medium.ts";
export { parseHFPapers } from "./sources/hf-papers.ts";
export { parseSubstackFeed } from "./sources/substack.ts";
export { parseLobsters } from "./sources/lobsters.ts";
export { collect } from "./sources/index.ts";
