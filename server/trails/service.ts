import { runtimeEnv } from "#platform";
import type { Store } from "../db.ts";
import type { HttpClient } from "../http.ts";
import type {
  ResearchTrail,
  TrailCheck,
  TrailLink,
} from "../../shared/types.ts";
import { arxivIdentity, githubRepository } from "../../shared/trail.ts";
import { parseArxiv } from "../sources/arxiv.ts";
import { normalizeUrl } from "../normalize.ts";
import {
  linkedCode,
  corpusLinks,
  parseCitations,
  versionFromItem,
} from "./evidence.ts";
import { TrailStore } from "./store.ts";
const SIX_HOURS = 6 * 60 * 60 * 1000,
  COOLDOWN = 5 * 60 * 1000;
const unique = (links: TrailLink[]) => [
  ...new Map(links.map((l) => [l.url, l])).values(),
];
export class TrailService {
  private store: Store;
  private http: HttpClient;
  readonly data: TrailStore;
  private queue: Promise<unknown> = Promise.resolve();
  private jobs = new Map<number, Promise<void>>();
  constructor(store: Store, http: HttpClient) {
    this.store = store;
    this.http = http;
    this.data = new TrailStore(store);
  }
  read(groupId: number): ResearchTrail {
    const trail = this.data.read(groupId);
    const paper = this.store.stories().find((s) => s.groupId === groupId)!;
    const local = corpusLinks(paper, this.store.stories());
    const direct = linkedCode(paper, trail.versions);
    const known = trail.code;
    const enrichedDirect = direct.map((link) => ({
      ...known.find((old) => old.url === link.url),
      ...link,
      available:
        known.find((old) => old.url === link.url)?.available ?? link.available,
      release: known.find((old) => old.url === link.url)?.release,
      lastCheckedAt: known.find((old) => old.url === link.url)?.lastCheckedAt,
      error: known.find((old) => old.url === link.url)?.error,
    }));
    trail.code = unique([
      ...known.filter((l) => !direct.some((d) => d.url === l.url)),
      ...local.filter(
        (l) => l.kind === "code" && !direct.some((d) => d.url === l.url),
      ),
      ...enrichedDirect,
    ]);
    trail.followUps = unique([
      ...trail.followUps,
      ...local.filter((l) => l.kind === "followup"),
    ]);
    return { ...trail, refreshing: this.jobs.has(groupId) };
  }
  refresh(groupId: number, manual = false): Promise<void> {
    if (this.jobs.has(groupId)) return this.jobs.get(groupId)!;
    const trail = this.read(groupId);
    if (
      runtimeEnv.COLLECTION_DISABLED === "true" ||
      (trail.lastAttempt &&
        Date.now() - Date.parse(trail.lastAttempt) <
          (manual ? COOLDOWN : SIX_HOURS))
    )
      return Promise.resolve();
    trail.lastAttempt = new Date().toISOString();
    this.data.save(trail);
    const task = this.queue
      .then(() => this.collect(groupId))
      .catch((error) => {
        const current = this.data.read(groupId);
        current.checks.versions = {
          lastAttempt: trail.lastAttempt,
          lastSuccess: current.checks.versions?.lastSuccess || null,
          error: error instanceof Error ? error.message : "Trail update failed",
        };
        this.data.save(current);
      })
      .finally(() => this.jobs.delete(groupId));
    this.jobs.set(groupId, task);
    this.queue = task.catch(() => {});
    return task;
  }
  refreshWatched() {
    for (const id of this.data.watched()) void this.refresh(id);
  }
  private async collect(groupId: number) {
    let trail = this.read(groupId);
    const paper = this.store.stories().find((s) => s.groupId === groupId)!;
    const identity = arxivIdentity(paper.canonicalUrl);
    const now = () => new Date().toISOString();
    async function checked(
      previous: TrailCheck | undefined,
      work: () => Promise<void>,
    ): Promise<TrailCheck> {
      const lastAttempt = now();
      try {
        await work();
        return { lastAttempt, lastSuccess: now(), error: null };
      } catch (e) {
        return {
          lastAttempt,
          lastSuccess: previous?.lastSuccess || null,
          error: (e as Error).message,
        };
      }
    }
    if (identity) {
      trail.checks.versions = await checked(trail.checks.versions, async () => {
        const entries = parseArxiv(
          await this.http.text(
            `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(identity.id)}&max_results=1`,
          ),
        );
        const latest = entries.find(
          (e) => arxivIdentity(e.canonicalUrl)?.id === identity.id,
        );
        if (!latest) throw new Error("No arXiv version record returned.");
        const version = versionFromItem(latest);
        if (!version) throw new Error("arXiv did not supply a version number.");
        this.store.saveVersion(version);
        const primary = this.store
          .items()
          .find((i) => i.groupId === groupId && i.sourceKind === "arxiv");
        const source =
          primary &&
          this.store.sources().find((s) => s.id === primary.sourceId);
        if (source) this.store.ingest(source, [latest]);
        if (
          version.version > 1 &&
          !this.store
            .versions(identity.id)
            .some((v) => v.version === version.version - 1)
        ) {
          const older = parseArxiv(
            await this.http.text(
              `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(identity.id + "v" + (version.version - 1))}&max_results=1`,
            ),
          );
          const previous = older
            .map((e) => versionFromItem(e))
            .find(
              (v) =>
                v?.paperKey === identity.id &&
                v.version === version.version - 1,
            );
          if (!previous)
            throw new Error(
              "Previous version was not returned; latest version retained.",
            );
          this.store.saveVersion(previous);
        }
      });
      trail.versions = this.store.versions(identity.id);
    }
    const candidates = this.read(groupId)
      .code.filter((l) => l.relation !== "user")
      .slice(0, 3);
    if (candidates.length) {
      trail.checks.code = await checked(trail.checks.code, async () => {
        let failure: Error | undefined;
        for (const candidate of candidates) {
          const repo = githubRepository(candidate.url);
          if (!repo) continue;
          const prior = trail.code.find((l) => l.url === candidate.url);
          let enriched = { ...prior, ...candidate };
          try {
            const metadata = (await this.http.json(
              `https://api.github.com/repos/${repo}`,
            )) as any;
            if (!metadata.full_name || !metadata.html_url)
              throw new Error("Invalid repository metadata");
            enriched = {
              ...enriched,
              title: metadata.full_name,
              description: String(metadata.description || "").slice(0, 600),
              available: true,
              lastCheckedAt: now(),
              error: undefined,
            };
            const releases = (await this.http.json(
              `https://api.github.com/repos/${repo}/releases?per_page=1`,
            )) as any;
            if (!Array.isArray(releases))
              throw new Error("Invalid release response");
            if (releases[0])
              enriched.release = {
                title: String(releases[0].name || releases[0].tag_name),
                url: normalizeUrl(releases[0].html_url),
                publishedAt: releases[0].published_at || null,
              };
          } catch (e) {
            enriched.error = (e as Error).message;
            failure = e as Error;
          }
          trail.code = unique([
            ...trail.code.filter((l) => l.url !== candidate.url),
            enriched,
          ]);
        }
        if (failure) throw failure;
      });
    }
    if (identity || paper.metadata?.doi) {
      trail.checks.citations = await checked(
        trail.checks.citations,
        async () => {
          const key = identity
            ? `ARXIV:${identity.id}`
            : `DOI:${paper.metadata!.doi}`;
          const url = `https://api.semanticscholar.org/graph/v1/paper/${encodeURIComponent(key)}/citations?fields=title,year,url,externalIds,publicationDate&limit=100`;
          const data = parseCitations(await this.http.json(url), url);
          trail.followUps = unique([...trail.followUps, ...data.links]);
          trail.citationsPartial = data.partial;
        },
      );
    }
    this.data.save(trail);
  }
}
