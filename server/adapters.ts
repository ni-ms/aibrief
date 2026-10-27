// Compatibility exports for existing consumers. Adapters live in server/sources/.
export { parseArxiv } from "./sources/arxiv.ts";
export { parseReleases } from "./sources/github.ts";
export { parseHN } from "./sources/hackernews.ts";
export { collect } from "./sources/index.ts";
