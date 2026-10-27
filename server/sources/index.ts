import type { Source } from "../../shared/types.ts";
import type { HttpClient } from "../http.ts";
import { collectArxiv } from "./arxiv.ts";
import { collectGithub } from "./github.ts";
import { collectHN } from "./hackernews.ts";
import { collectOpenReview } from "./openreview.ts";
import { collectBluesky } from "./bluesky.ts";
import { collectRSS } from "./rss.ts";
import { collectReddit } from "./reddit.ts";
/** Collector orchestration stays here. Each adapter only maps one public format. */
export async function collect(
  source: Source,
  http: HttpClient,
  terms: string[],
  needsBackfill = false,
) {
  switch (source.kind) {
    case "arxiv":
      return collectArxiv(source, http, terms, needsBackfill);
    case "github":
      return collectGithub(source, http);
    case "hn":
      return collectHN(source, http, terms);
    case "openreview":
      return collectOpenReview(source, http);
    case "bluesky":
      return collectBluesky(source, http);
    case "rss":
      return collectRSS(source, http);
    case "reddit":
      return collectReddit(source, http);
    default:
      throw new Error("Unsupported resource type");
  }
}
