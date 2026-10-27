import type { IncomingMessage, ServerResponse } from "node:http";
import { assertPublicFeedUrl } from "#platform";

export async function handleProxyRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const reqUrl = new URL(req.url || "", "http://127.0.0.1");
  const targetUrl = reqUrl.searchParams.get("url");

  if (!targetUrl) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Missing url parameter" }));
    return;
  }

  try {
    await assertPublicFeedUrl(targetUrl);
  } catch (error) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        error:
          error instanceof Error ? error.message : "Invalid feed URL",
      }),
    );
    return;
  }

  try {
    let currentUrl = targetUrl;
    let response: Response | null = null;
    const accept =
      "application/json, application/rss+xml, application/atom+xml, text/xml, text/plain, */*";

    for (let hop = 0; hop <= 3; hop++) {
      response = await fetch(currentUrl, {
        headers: {
          "User-Agent": "Fieldnotes/0.1 (personal local research reader)",
          Accept: accept,
        },
        redirect: "manual",
        signal: AbortSignal.timeout(18000),
      });

      if (
        response.status >= 300 &&
        response.status < 400 &&
        response.status !== 304
      ) {
        if (hop >= 3) {
          res.statusCode = 502;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Too many feed redirects" }));
          return;
        }
        const target = response.headers.get("location");
        if (!target) {
          res.statusCode = 502;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Invalid feed redirect location" }));
          return;
        }
        currentUrl = new URL(target, currentUrl).toString();
        await assertPublicFeedUrl(currentUrl);
        await response.body?.cancel();
        continue;
      }
      break;
    }

    if (!response) {
      res.statusCode = 502;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "No response from upstream feed" }));
      return;
    }

    if (!response.ok && response.status !== 304) {
      res.statusCode = response.status >= 400 && response.status < 600 ? response.status : 502;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: `HTTP ${response.status} from upstream feed`,
        }),
      );
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      res.statusCode = response.status;
      res.end("");
      return;
    }

    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 12_000_000) {
        await reader.cancel();
        res.statusCode = 502;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Source response exceeds 12 MB" }));
        return;
      }
      chunks.push(value);
    }

    const contentType =
      response.headers.get("content-type") || "text/plain; charset=utf-8";
    res.statusCode = response.status;
    res.setHeader("Content-Type", contentType);
    res.setHeader("X-Content-Type-Options", "nosniff");
    for (const chunk of chunks) {
      res.write(chunk);
    }
    res.end();
  } catch (error) {
    if (!res.headersSent) {
      res.statusCode = 502;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error:
            error instanceof Error ? error.message : "Proxy request failed",
        }),
      );
    }
  }
}
