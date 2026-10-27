import type { CollectedItem, Source } from "../../shared/types.ts";
import { labelTopics } from "../../shared/interests.ts";
import { normalizeUrl, plainText, isoDate } from "../normalize.ts";
import type { HttpClient } from "../http.ts";
export function parseBluesky(data: any): CollectedItem[] {
  if (!Array.isArray(data?.feed))
    throw new Error("Unexpected Bluesky response");
  return data.feed
    .filter((entry: any) => !entry.reason && entry.post?.record?.text)
    .map((entry: any) => {
      const post = entry.post;
      const text = plainText(post.record.text);
      const key = post.uri?.split("/").pop();
      if (!key || !post.author?.did) throw new Error("Invalid Bluesky post");
      const url = `https://bsky.app/profile/${post.author.did}/post/${key}`;
      const external = post.embed?.external || post.embed?.media?.external;
      const links = [{ label: "Original post", url }];
      if (external?.uri) {
        try {
          links.push({
            label: "Linked source",
            url: normalizeUrl(external.uri),
          });
        } catch {}
      }
      // Keep social posts separate from their linked paper: post text is not the paper's abstract.
      return {
        externalId: post.uri,
        canonicalUrl: url,
        title: plainText(external?.title) || text.slice(0, 160),
        abstract: text,
        releaseText: "",
        publishedAt: isoDate(post.record.createdAt),
        topics: labelTopics(text),
        kind: "news",
        metadata: { authors: [post.author.handle], publicationType: "post" },
        links,
      };
    });
}
export async function collectBluesky(source: Source, http: HttpClient) {
  return parseBluesky(
    await http.json(
      `https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(source.config.actor!)}&limit=40&filter=posts_no_replies`,
    ),
  );
}
