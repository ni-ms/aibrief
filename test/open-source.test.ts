// Synthetic GitHub fixtures. Never written to the user's database.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { createApp } from "../server/app.ts";
import { Collector } from "../server/collector.ts";
import { Store } from "../server/db.ts";
import { HttpClient } from "../server/http.ts";
import {
  OpenSourceService,
  parseGithubProjects,
} from "../server/open-source.ts";
import { githubUsername, githubProjectUrl } from "../shared/open-source.ts";

const fixture = (id = 1) => ({
  id,
  full_name: `fixture/project-${id}`,
  private: false,
  description: "TEST FIXTURE: project description",
  language: "Rust",
  stargazers_count: 12,
  forks_count: 3,
  topics: ["ai", "ai", "tools"],
  pushed_at: "2026-10-24T12:00:00Z",
  license: { spdx_id: "MIT" },
});

test("GitHub collections accept handles and profile URLs, rejecting other hosts and paths", () => {
  for (const value of [
    "f20201351h-maker",
    "@F20201351H-MAKER",
    "https://github.com/f20201351h-maker?tab=stars",
    "https://github.com/f20201351h-maker/",
  ])
    assert.equal(githubUsername(value), "f20201351h-maker");
  for (const value of [
    "",
    "../admin",
    "name/repo",
    "http://github.com/user",
    "https://github.com.evil.test/user",
    "https://github.com@evil.test/user",
    "https://user:pass@github.com/user",
    "https://github.com:444/user",
    "https://github.com/user/repo",
    "https://127.0.0.1/user",
    "a--b",
    "a".repeat(40),
  ])
    assert.throws(() => githubUsername(value), value);
});

test("project parsing retains GitHub metadata and safe identities without inventing licenses or links", () => {
  const projects = parseGithubProjects([
    fixture(),
    { ...fixture(), html_url: "javascript:alert(1)" },
    {
      ...fixture(2),
      license: { spdx_id: "NOASSERTION" },
      description: null,
      pushed_at: "invalid",
    },
    { ...fixture(3), private: true },
    { ...fixture(4), full_name: "bad/<script>" },
    { ...fixture(5), full_name: "bad/.." },
    { ...fixture(6), id: "6" },
  ]);
  assert.equal(projects.length, 2);
  assert.deepEqual(projects[0].topics, ["ai", "tools"]);
  assert.equal(projects[0].stars, 12);
  assert.equal(projects[0].pushedAt, "2026-10-24T12:00:00.000Z");
  assert.equal(
    githubProjectUrl(projects[0]),
    "https://github.com/fixture/project-1",
  );
  assert.equal(projects[1].license, null);
  assert.equal(projects[1].description, "");
  assert.equal(projects[1].pushedAt, null);
  assert.throws(() => parseGithubProjects({ message: "API error" }));
});

test("starred projects paginate, coalesce requests, and reuse persisted HTTP cache", async () => {
  const dir = mkdtempSync(join(tmpdir(), "fieldnotes-stars-"));
  const path = join(dir, "stars.sqlite");
  let store = new Store(path);
  const calls: string[] = [];
  const fetcher: typeof fetch = async (input) => {
    const url = String(input);
    calls.push(url);
    return Response.json(
      new URL(url).searchParams.get("page") === "1"
        ? Array.from({ length: 100 }, (_, i) => fixture(i + 1))
        : [fixture(101)],
    );
  };
  try {
    let service = new OpenSourceService(store, new HttpClient(store, fetcher));
    const [first, same] = await Promise.all([
      service.stars("example"),
      service.stars("EXAMPLE"),
    ]);
    assert.equal(calls.length, 1);
    assert.equal(first, same);
    assert.equal(first.projects.length, 100);
    assert.equal(first.nextPage, 2);
    assert.ok(first.checkedAt);
    const second = await service.stars("example", 2);
    assert.equal(second.projects[0].id, 101);
    assert.equal(second.nextPage, null);
    assert.equal(calls.length, 2);
    await service.stars("example", 1, true);
    assert.equal(calls.length, 2); // Manual refresh still honors the five-minute cooldown.
    store.close();
    store = new Store(path);
    service = new OpenSourceService(store, new HttpClient(store, fetcher));
    assert.equal((await service.stars("example")).projects.length, 100);
    assert.equal(calls.length, 2);
    for (const page of [0, -1, 1.5, 1001, NaN])
      assert.throws(() => service.stars("example", page));
    assert.equal(calls.length, 2);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("GitHub rate limits preserve cached projects and their actual check time", async () => {
  const store = new Store(":memory:");
  let limited = false,
    calls = 0;
  const http = new HttpClient(store, async () => {
    calls++;
    return limited
      ? Response.json(
          { message: "limited" },
          { status: 429, headers: { "retry-after": "60" } },
        )
      : Response.json([fixture()]);
  });
  const service = new OpenSourceService(store, http);
  try {
    await service.stars("example");
    store.db
      .prepare("UPDATE http_cache SET checked_at=?")
      .run("2020-01-01T00:00:00Z");
    limited = true;
    const cached = await service.stars("example", 1, true);
    assert.equal(cached.stale, true);
    assert.equal(cached.projects[0].fullName, "fixture/project-1");
    assert.equal(cached.checkedAt, "2020-01-01T00:00:00Z");
    assert.match(cached.error!, /429/);
    await assert.rejects(service.stars("example", 2), /rate limited/);
    assert.equal(calls, 2);
  } finally {
    store.close();
  }
});

test("collections persist, deduplicate concurrent additions, and removed defaults stay removed", async () => {
  const dir = mkdtempSync(join(tmpdir(), "fieldnotes-collections-"));
  const path = join(dir, "collections.sqlite");
  let store = new Store(path);
  const fetcher: typeof fetch = async () => Response.json([]);
  try {
    let service = new OpenSourceService(store, new HttpClient(store, fetcher));
    assert.equal(service.collections()[0].username, "f20201351h-maker");
    await Promise.all([
      service.add("Example"),
      service.add("example"),
      service.add("second"),
    ]);
    assert.equal(service.collections().length, 3);
    store.close();
    store = new Store(path);
    service = new OpenSourceService(store, new HttpClient(store, fetcher));
    assert.equal(service.collections().length, 3);
    assert.deepEqual((await service.stars("example")).projects, []);
    for (const collection of service.collections())
      service.remove(collection.username);
    assert.deepEqual(service.collections(), []);
    store.close();
    store = new Store(path);
    assert.deepEqual(new OpenSourceService(store).collections(), []);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("unavailable accounts are not added as collections", async () => {
  const store = new Store(":memory:");
  try {
    const service = new OpenSourceService(
      store,
      new HttpClient(store, async () =>
        Response.json({ message: "Not Found" }, { status: 404 }),
      ),
    );
    await assert.rejects(service.add("missing"), /not found/);
    assert.equal(service.collections().length, 1);
  } finally {
    store.close();
  }
});

test("malformed successful responses cannot erase the last usable cached collection", async () => {
  const store = new Store(":memory:");
  let malformed = false;
  const service = new OpenSourceService(
    store,
    new HttpClient(store, async () =>
      Response.json(
        malformed ? { message: "unexpected proxy response" } : [fixture()],
      ),
    ),
  );
  try {
    await service.stars("example");
    store.db
      .prepare("UPDATE http_cache SET checked_at=?")
      .run("2020-01-01T00:00:00Z");
    malformed = true;
    const stale = await service.stars("example");
    assert.equal(stale.stale, true);
    assert.equal(stale.projects.length, 1);
    assert.equal(stale.checkedAt, "2020-01-01T00:00:00Z");
    const cached = store.db.prepare("SELECT body FROM http_cache").get() as {
      body: string;
    };
    assert.ok(Array.isArray(JSON.parse(cached.body)));
  } finally {
    store.close();
  }
});

test("Open Source API validates inputs, persists collections, and connects release follows", async () => {
  const store = new Store(":memory:");
  const service = new OpenSourceService(
    store,
    new HttpClient(store, async () => Response.json([fixture()])),
  );
  const collector = new Collector(store);
  let refreshes = 0;
  collector.refresh = async () => {
    refreshes++;
  };
  const server = createApp(store, collector, undefined, service).listen(
    0,
    "127.0.0.1",
  );
  await once(server, "listening");
  const root = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`;
  async function request(path: string, method = "GET", body?: unknown) {
    return fetch(root + path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
  }
  try {
    assert.equal(
      (await (await request("/open-source/collections")).json())[0].username,
      "f20201351h-maker",
    );
    for (const query of ["page=0", "page=1.5", "page=1001", "refresh=invalid"])
      assert.equal(
        (await request(`/open-source/stars/example?${query}`)).status,
        400,
      );
    assert.equal(
      (
        await request("/open-source/collections", "POST", {
          username: "https://evil.test/profile",
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await request("/open-source/collections", "POST", {
          username: "https://github.com/Example?tab=stars",
        })
      ).status,
      201,
    );
    const projects = await (await request("/open-source/stars/example")).json();
    assert.equal(projects.projects[0].fullName, "fixture/project-1");
    const source = {
      id: "github-test-project",
      kind: "github",
      name: "Test project",
      enabled: true,
      resourceId: "github",
      config: { repo: projects.projects[0].fullName },
    };
    assert.equal(
      (await request(`/sources/${source.id}`, "PUT", source)).status,
      200,
    );
    assert.equal(refreshes, 1);
    assert.ok(
      store
        .sources()
        .some((s) => s.config.repo === "fixture/project-1" && s.enabled),
    );
    assert.equal(
      (
        await request(`/sources/${source.id}`, "PUT", {
          ...source,
          enabled: false,
        })
      ).status,
      200,
    );
    assert.ok(store.sources().some((s) => s.id === source.id && !s.enabled));
    assert.equal(
      (await request("/open-source/collections/example", "DELETE")).status,
      200,
    );
    assert.equal(service.collections().length, 1);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    store.close();
  }
});
