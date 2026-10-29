import { assertPublicFeedUrl, browserMode } from "#platform";
import type { Store } from "./db.ts";
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
export class HttpClient {
  private store: Store;
  private fetcher: typeof fetch;
  private arxivQueue: Promise<unknown> = Promise.resolve();
  constructor(store: Store, fetcher: typeof fetch = fetch) {
    this.store = store;
    // Browser fetch requires its global receiver even when injected into a class.
    this.fetcher = fetcher.bind(globalThis);
  }
  async text(
    url: string,
    ttl = 0,
    publicFeed = false,
    requestHeaders?: Record<string, string>,
  ): Promise<string> {
    if (/(^|\.)arxiv\.org$/.test(new URL(url).hostname)) {
      const pending = this.arxivQueue.then(() =>
        this.requestText(url, ttl, publicFeed, requestHeaders),
      );
      this.arxivQueue = pending.catch(() => {});
      return pending;
    }
    return this.requestText(url, ttl, publicFeed, requestHeaders);
  }
  private async requestText(
    url: string,
    ttl = 0,
    publicFeed = false,
    requestHeaders?: Record<string, string>,
  ): Promise<string> {
    const cache = this.store.db
      .prepare("SELECT * FROM http_cache WHERE url=?")
      .get(url) as
      | {
          body: string;
          etag: string | null;
          last_modified: string | null;
          checked_at: string;
        }
      | undefined;
    if (cache && Date.now() - Date.parse(cache.checked_at) < ttl)
      return cache.body;
    const host = new URL(url).hostname;
    const blockedUntil = Number(this.store.meta(`backoff:${host}`) || 0);
    if (blockedUntil > Date.now())
      throw new Error(
        `Source rate limited. Retry after ${new Date(blockedUntil).toLocaleString()}.`,
      );
    for (let attempt = 0; attempt < 2; attempt++) {
      // Persist spacing across restarts, and await the entire response before the next request.
      if (host.endsWith("arxiv.org")) {
        await delay(
          Math.max(
            0,
            3100 -
              (Date.now() - Number(this.store.meta("arxiv:last-request") || 0)),
          ),
        );
        this.store.meta("arxiv:last-request", String(Date.now()));
      }
      try {
        const headers: Record<string, string> = {
          "User-Agent": "Fieldnotes/0.1 (personal local research reader)",
          Accept:
            host === "api.github.com"
              ? "application/vnd.github+json"
              : "application/json, application/rss+xml, application/atom+xml, text/xml",
        };
        if (host === "api.github.com")
          headers["X-GitHub-Api-Version"] = "2026-03-10";
        Object.assign(headers, requestHeaders);
        if (cache?.etag && !browserMode) headers["If-None-Match"] = cache.etag;
        if (cache?.last_modified && !browserMode)
          headers["If-Modified-Since"] = cache.last_modified;
        if (browserMode) delete headers["User-Agent"];
        let response = await this.fetcher(url, {
          headers,
          ...(browserMode
            ? { mode: "cors" as const, credentials: "omit" as const }
            : {}),
          // Never forward a server-side OAuth token through a redirect.
          redirect: headers.Authorization
            ? "error"
            : publicFeed && !browserMode
              ? "manual"
              : "follow",
          signal: AbortSignal.timeout(18000),
        });
        if (publicFeed && !browserMode) {
          let redirectUrl = url;
          for (
            let hop = 0;
            response.status >= 300 &&
            response.status < 400 &&
            response.status !== 304;
            hop++
          ) {
            if (hop >= 3) throw new Error("Too many feed redirects");
            const target = response.headers.get("location");
            if (!target) throw new Error("Invalid feed redirect");
            redirectUrl = new URL(target, redirectUrl).toString();
            await assertPublicFeedUrl(redirectUrl);
            await response.body?.cancel();
            response = await this.fetcher(redirectUrl, {
              headers: {
                "User-Agent": headers["User-Agent"],
                Accept: headers.Accept,
              },
              redirect: "manual",
              signal: AbortSignal.timeout(18000),
            });
          }
        }
        if (response.status === 304 && cache) {
          this.store.db
            .prepare("UPDATE http_cache SET checked_at=? WHERE url=?")
            .run(new Date().toISOString(), url);
          return cache.body;
        }
        if (!response.ok) {
          if (host === "api2.openreview.net" && response.status === 403)
            throw new Error(
              "OpenReview requires verification or denies public access. No new papers collected.",
            );
          const retry = response.headers.get("retry-after");
          const reset = response.headers.get("x-ratelimit-reset");
          if (
            response.status === 429 ||
            (response.status === 403 && (reset || retry))
          ) {
            const until = retry
              ? /^\d+$/.test(retry)
                ? Date.now() + Number(retry) * 1000
                : Date.parse(retry)
              : reset
                ? (host === "oauth.reddit.com" ? Date.now() : 0) +
                  Number(reset) * 1000
                : Date.now() + 60000;
            this.store.meta(
              `backoff:${host}`,
              String(Math.max(Date.now() + 60000, until || 0)),
            );
          }
          throw new Error(
            `HTTP ${response.status} from ${host}${response.status === 403 || response.status === 429 ? " (public API rate limit; existing items retained)" : ""}`,
          );
        }
        // Bound body size before parsing untrusted source content.
        const reader = response.body?.getReader();
        if (!reader) throw new Error("Empty source response");
        const chunks: Uint8Array[] = [];
        let size = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > 12_000_000) {
            await reader.cancel();
            throw new Error("Source response exceeds 12 MB");
          }
          chunks.push(value);
        }
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.length;
        }
        const body = new TextDecoder().decode(bytes);
        this.store.db
          .prepare(
            "INSERT INTO http_cache VALUES(?,?,?,?,?) ON CONFLICT(url) DO UPDATE SET body=excluded.body,etag=excluded.etag,last_modified=excluded.last_modified,checked_at=excluded.checked_at",
          )
          .run(
            url,
            body,
            response.headers.get("etag"),
            response.headers.get("last-modified"),
            new Date().toISOString(),
          );
        return body;
      } catch (error) {
        if (browserMode && error instanceof TypeError) {
          try {
            const proxyResponse = await this.fetcher(
              `/api/proxy?url=${encodeURIComponent(url)}`,
              {
                mode: "cors",
                credentials: "omit",
                signal: AbortSignal.timeout(18000),
              },
            );
            if (proxyResponse.ok) {
              const body = await proxyResponse.text();
              this.store.db
                .prepare(
                  "INSERT INTO http_cache VALUES(?,?,?,?,?) ON CONFLICT(url) DO UPDATE SET body=excluded.body,etag=excluded.etag,last_modified=excluded.last_modified,checked_at=excluded.checked_at",
                )
                .run(
                  url,
                  body,
                  proxyResponse.headers.get("etag"),
                  proxyResponse.headers.get("last-modified"),
                  new Date().toISOString(),
                );
              return body;
            }
          } catch {
            // Proxy failed or unavailable
          }
          throw new Error(
            `${host} could not be reached from this browser. The source may block cross-site access, or the network may be unavailable. Saved items are kept.`,
          );
        }
        if (
          attempt === 1 ||
          Number(this.store.meta(`backoff:${host}`) || 0) > Date.now() ||
          /HTTP 4|OpenReview requires verification/.test(String(error))
        )
          throw error;
        await delay(1200 * (attempt + 1));
      }
    }
    throw new Error("Source request failed");
  }
  checkedAt(url: string): string | undefined {
    return (
      this.store.db
        .prepare("SELECT checked_at FROM http_cache WHERE url=?")
        .get(url) as { checked_at: string } | undefined
    )?.checked_at;
  }
  async json(
    url: string,
    ttl = 0,
    headers?: Record<string, string>,
  ): Promise<unknown> {
    return JSON.parse(await this.text(url, ttl, false, headers));
  }
}
