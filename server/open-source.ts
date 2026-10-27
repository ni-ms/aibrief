import type { Store } from "./db.ts";
import { HttpClient } from "./http.ts";
import { MANUAL_COOLDOWN_MS, SYNC_INTERVAL_MS } from "./config.ts";
import {
  githubUsername,
  type GithubCollection,
  type GithubProject,
  type StarredProjects,
} from "../shared/open-source.ts";

const COLLECTIONS_KEY = "open-source:collections";
const PAGE_SIZE = 100;
const validRepo = /^[a-z0-9_-][a-z0-9_.-]*\/[a-z0-9_.-]+$/i;

/** Keep GitHub's metadata, with safe identities and no inferred project claims. */
export function parseGithubProjects(data: unknown): GithubProject[] {
  if (!Array.isArray(data))
    throw new Error("Unexpected GitHub stars response.");
  const projects = new Map<string, GithubProject>();
  for (const row of data) {
    if (
      !row ||
      typeof row.full_name !== "string" ||
      !validRepo.test(row.full_name) ||
      [".", ".."].includes(row.full_name.split("/")[1]) ||
      !Number.isSafeInteger(row.id) ||
      row.id <= 0 ||
      row.private === true
    )
      continue;
    const count = (value: unknown) =>
      typeof value === "number" && Number.isSafeInteger(value) && value >= 0
        ? value
        : 0;
    projects.set(row.full_name.toLowerCase(), {
      id: row.id,
      fullName: row.full_name,
      description:
        typeof row.description === "string"
          ? row.description.slice(0, 3000)
          : "",
      language:
        typeof row.language === "string" ? row.language.slice(0, 80) : null,
      stars: count(row.stargazers_count),
      forks: count(row.forks_count),
      topics: Array.isArray(row.topics)
        ? [
            ...new Set<string>(
              row.topics.filter(
                (t: unknown): t is string =>
                  typeof t === "string" && /^[a-z0-9-]{1,80}$/.test(t),
              ),
            ),
          ].slice(0, 30)
        : [],
      license:
        typeof row.license?.spdx_id === "string" &&
        row.license.spdx_id !== "NOASSERTION"
          ? row.license.spdx_id.slice(0, 80)
          : null,
      archived: row.archived === true,
      pushedAt:
        typeof row.pushed_at === "string" &&
        Number.isFinite(Date.parse(row.pushed_at))
          ? new Date(row.pushed_at).toISOString()
          : null,
    });
  }
  return [...projects.values()];
}

export class OpenSourceService {
  private pending = new Map<string, Promise<StarredProjects>>();
  private store: Store;
  private http: HttpClient;
  constructor(store: Store, http = new HttpClient(store)) {
    this.store = store;
    this.http = http;
  }

  collections(): GithubCollection[] {
    const saved = this.store.meta(COLLECTIONS_KEY);
    if (saved) return JSON.parse(saved);
    const initial = [
      { username: "f20201351h-maker", addedAt: new Date().toISOString() },
    ];
    this.store.meta(COLLECTIONS_KEY, JSON.stringify(initial));
    return initial;
  }

  async add(input: string) {
    const username = githubUsername(input);
    const collections = this.collections();
    if (collections.some((c) => c.username === username)) return { username };
    if (collections.length >= 12)
      throw new Error(
        "You can keep up to 12 GitHub collections. Remove one to add another.",
      );
    // Validate public access before persisting a new collection.
    await this.stars(username);
    // Re-read after the request so concurrent additions cannot overwrite each other.
    const latest = this.collections();
    if (!latest.some((c) => c.username === username)) {
      if (latest.length >= 12)
        throw new Error("Maximum 12 GitHub collections.");
      latest.push({ username, addedAt: new Date().toISOString() });
      this.store.meta(COLLECTIONS_KEY, JSON.stringify(latest));
    }
    return { username };
  }

  remove(input: string) {
    const username = githubUsername(input);
    this.store.meta(
      COLLECTIONS_KEY,
      JSON.stringify(this.collections().filter((c) => c.username !== username)),
    );
  }

  stars(input: string, page = 1, refresh = false): Promise<StarredProjects> {
    const username = githubUsername(input);
    if (!Number.isInteger(page) || page < 1 || page > 1000)
      throw new Error("Invalid GitHub collection page.");
    const url = `https://api.github.com/users/${username}/starred?per_page=${PAGE_SIZE}&sort=created&direction=desc&page=${page}`;
    const existing = this.pending.get(url);
    if (existing) return existing;
    const pending = this.readPage(url, username, page, refresh).finally(() =>
      this.pending.delete(url),
    );
    this.pending.set(url, pending);
    return pending;
  }

  private async readPage(
    url: string,
    username: string,
    page: number,
    refresh: boolean,
  ): Promise<StarredProjects> {
    const cached = this.store.db
      .prepare("SELECT * FROM http_cache WHERE url=?")
      .get(url) as
      | {
          body: string;
          etag: string | null;
          last_modified: string | null;
          checked_at: string;
        }
      | undefined;
    const result = (
      body: string,
      stale: boolean,
      error: string | null,
    ): StarredProjects => {
      const raw: unknown = JSON.parse(body);
      return {
        username,
        page,
        projects: parseGithubProjects(raw),
        nextPage:
          Array.isArray(raw) && raw.length === PAGE_SIZE && page < 1000
            ? page + 1
            : null,
        checkedAt: this.http.checkedAt(url) || null,
        stale,
        error,
      };
    };
    try {
      return result(
        await this.http.text(
          url,
          refresh ? MANUAL_COOLDOWN_MS : SYNC_INTERVAL_MS,
        ),
        false,
        null,
      );
    } catch (error) {
      const message = /HTTP 404/.test(String(error))
        ? "GitHub user not found, or their stars are not public."
        : (error as Error).message;
      if (cached) {
        try {
          // A malformed HTTP 200 must not replace the last usable project list.
          parseGithubProjects(JSON.parse(cached.body));
          this.store.db
            .prepare("INSERT OR REPLACE INTO http_cache VALUES(?,?,?,?,?)")
            .run(
              url,
              cached.body,
              cached.etag,
              cached.last_modified,
              cached.checked_at,
            );
          return result(cached.body, true, message);
        } catch {
          /* No usable cached response. */
        }
      }
      throw new Error(message);
    }
  }
}
