import { runtimeEnv, browserMode } from "#platform";
import he from "he";
import type { CollectedItem, Source } from "../../shared/types.ts";
import { normalizeSubreddit } from "../../shared/reddit.ts";
import { labelTopics } from "../../shared/interests.ts";
import { normalizeUrl, plainText, isoDate } from "../normalize.ts";
import type { HttpClient } from "../http.ts";
import { parser, list, XMLValidator } from "./xml.ts";

export const REDDIT_RSS_END = Date.parse("2026-11-13T00:00:00Z");
export function redditConnection() {
  if (browserMode)
    return {
      connectionLabel: "Direct browser access",
      caveat:
        "Reddit may block direct browser requests. Public RSS is being retired on November 13, 2026. This browser app does not store Reddit API tokens; previously collected posts remain available.",
    };
  const oauth = !!runtimeEnv.REDDIT_ACCESS_TOKEN?.trim();
  const retired = Date.now() >= REDDIT_RSS_END;
  return {
    connectionLabel: oauth
      ? "Approved API token configured"
      : retired
        ? "API setup required"
        : "Public RSS · temporary",
    caveat: oauth
      ? "Uses your server’s approved Reddit API token. Tokens can expire; Reddit plans to end remaining public API access in March 2027."
      : retired
        ? "Reddit ended public RSS support on November 13, 2026. Configure an approved API token on the server to collect while your API access remains available."
        : "Reddit ends public RSS support on November 13, 2026. Until then, public communities may work without an account. An approved API token can be configured on the server.",
  };
}

function discussion(id: string) {
  if (!/^[a-z0-9]+$/i.test(id)) throw new Error("Invalid Reddit post identity");
  return `https://reddit.com/comments/${id.toLowerCase()}`;
}
function redditItem(
  id: string,
  title: unknown,
  abstract: string,
  publishedAt: string | null,
  author: string,
  linkedUrl?: string,
): CollectedItem {
  const canonicalUrl = discussion(id);
  const links = [{ label: "Reddit discussion", url: canonicalUrl }];
  if (linkedUrl) {
    try {
      const url = normalizeUrl(linkedUrl);
      if (
        !/(^|\.)reddit\.com$/.test(new URL(url).hostname) &&
        url !== canonicalUrl
      )
        links.push({ label: "Linked source", url });
    } catch {}
  }
  const textTitle = plainText(title);
  if (!textTitle) throw new Error("Missing Reddit post title");
  return {
    externalId: `t3_${id.toLowerCase()}`,
    canonicalUrl,
    title: textTitle,
    abstract: abstract.slice(0, 20000),
    releaseText: "",
    publishedAt,
    topics: labelTopics(`${textTitle} ${abstract}`),
    kind: "news",
    metadata: {
      publicationType: "post",
      ...(author && author !== "[deleted]" ? { authors: [author] } : {}),
    },
    links,
  };
}

/** Public Atom entries contain post text and link wrappers, never full comments. */
export function parseRedditRSS(xml: string): CollectedItem[] {
  if (XMLValidator.validate(xml) !== true)
    throw new Error("Invalid Reddit RSS/Atom XML");
  const doc = parser.parse(xml);
  if (!doc.feed || typeof doc.feed !== "object")
    throw new Error(
      "Expected a Reddit Atom feed; Reddit may have blocked or retired RSS access",
    );
  const entries = list(doc.feed.entry).slice(0, 40);
  const results = entries.flatMap((row) => {
    try {
      const id = String(row.id || "").match(/^t3_([a-z0-9]+)$/i)?.[1];
      if (!id) return [];
      const alternate = list(row.link).find(
        (l) => l["@_rel"] === "alternate" || !l["@_rel"],
      );
      const original = new URL(alternate?.["@_href"]);
      if (
        !/(^|\.)reddit\.com$/.test(original.hostname) ||
        !new RegExp(`/comments/${id}(?:/|$)`, "i").test(original.pathname)
      )
        return [];
      const html = he.decode(
        String(row.content?.["#text"] || row.content || row.summary || ""),
      );
      // Reddit appends author and [link]/[comments] controls after the source body.
      const body = html.replace(
        /(?:\s|&(?:#(?:32|x20)|nbsp);)+submitted by(?:\s|&(?:#(?:32|x20)|nbsp);)*(?:<a\b|\/u\/)[\s\S]*$/i,
        "",
      );
      const linked = [
        ...html.matchAll(
          /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>\s*\[link\]\s*<\/a>/gi,
        ),
      ][0]?.[1];
      const abstract = plainText(body)
        .replace(/\s*\[(?:link|comments)\]\s*/gi, " ")
        .trim();
      return [
        redditItem(
          id,
          row.title?.["#text"] || row.title,
          abstract,
          isoDate(row.published || row.updated),
          plainText(row.author?.name),
          linked,
        ),
      ];
    } catch {
      return [];
    }
  });
  if (entries.length && !results.length)
    throw new Error(
      "Reddit feed contained no recognizable posts; existing items retained",
    );
  return results;
}

/** OAuth listings preserve discussion identity even when a post links to a paper. */
export function parseRedditListing(data: any): CollectedItem[] {
  if (data?.kind !== "Listing" || !Array.isArray(data.data?.children))
    throw new Error("Unexpected Reddit API response");
  const entries = data.data.children.slice(0, 40);
  const results = entries.flatMap((entry: any) => {
    try {
      const row = entry.data;
      if (
        entry.kind !== "t3" ||
        !row ||
        row.over_18 ||
        row.promoted ||
        row.removed_by_category ||
        !row.id
      )
        return [];
      const text =
        row.selftext === "[removed]" || row.selftext === "[deleted]"
          ? ""
          : plainText(row.selftext);
      return [
        redditItem(
          row.id,
          row.title,
          text,
          Number.isFinite(row.created_utc)
            ? new Date(row.created_utc * 1000).toISOString()
            : null,
          row.author || "",
          row.is_self ? undefined : row.url_overridden_by_dest || row.url,
        ),
      ];
    } catch {
      return [];
    }
  });
  return results;
}

export async function collectReddit(source: Source, http: HttpClient) {
  const subreddit = normalizeSubreddit(source.config.subreddit || "");
  const sort = source.config.sort || "new";
  if (!["new", "hot", "top"].includes(sort))
    throw new Error("Invalid Reddit post order");
  const token = runtimeEnv.REDDIT_ACCESS_TOKEN?.trim();
  if (token) {
    if (!/^[A-Za-z0-9._~+/=-]+$/.test(token))
      throw new Error(
        "REDDIT_ACCESS_TOKEN has an invalid format. Set an approved OAuth read token on the server; existing items retained.",
      );
    try {
      return parseRedditListing(
        await http.json(
          `https://oauth.reddit.com/r/${subreddit}/${sort}?limit=40&raw_json=1`,
          0,
          {
            Authorization: `Bearer ${token}`,
            "User-Agent":
              runtimeEnv.REDDIT_USER_AGENT?.trim() ||
              "Fieldnotes/0.1 (personal local research reader)",
          },
        ),
      );
    } catch (error) {
      if (/HTTP 401/.test(String(error)))
        throw new Error(
          "Reddit API token expired or was rejected. Update REDDIT_ACCESS_TOKEN on the server with an approved read token; existing items retained.",
        );
      if (/HTTP 403/.test(String(error)))
        throw new Error(
          "Reddit denied API access. Check app approval and community access; existing items retained.",
        );
      // Fetch/header errors must never expose a credential copied into the environment.
      throw new Error(
        (error instanceof Error
          ? error.message
          : "Reddit API request failed"
        ).replaceAll(token, "[redacted]"),
      );
    }
  }
  if (Date.now() >= REDDIT_RSS_END)
    throw new Error(
      "Reddit ended public RSS support on November 13, 2026. Configure an approved REDDIT_ACCESS_TOKEN on the server; existing items retained.",
    );
  try {
    return parseRedditRSS(
      await http.text(
        `https://www.reddit.com/r/${subreddit}/${sort}/.rss?limit=40`,
        0,
        true,
      ),
    );
  } catch (error) {
    if (/HTTP (403|404|429)/.test(String(error)))
      throw new Error(
        "Reddit public feed is unavailable, private or rate limited. Retry later or configure an approved API token on the server; existing items retained.",
      );
    throw error;
  }
}
