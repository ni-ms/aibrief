import type { Store } from "../../server/store.ts";
import { Collector } from "../../server/collector.ts";
import { HttpClient } from "../../server/http.ts";
import { TrailService } from "../../server/trails/service.ts";
import { OpenSourceService } from "../../server/open-source.ts";
import { feedRoutes } from "../../server/routes/feed.ts";
import { profileRoutes } from "../../server/routes/profile.ts";
import { sourcesRoutes } from "../../server/routes/sources.ts";
import { topicRoutes } from "../../server/routes/topics.ts";
import { summariesRoutes } from "../../server/routes/summaries.ts";
import { trailRoutes } from "../../server/routes/trails.ts";
import { openSourceRoutes } from "../../server/routes/open-source.ts";
import { preferenceRoutes } from "../../server/routes/preferences.ts";

export function createBrowserRuntime(
  store: Store,
  fetcher: typeof fetch = fetch,
) {
  const http = new HttpClient(store, fetcher);
  const collector = new Collector(store, http);
  const trails = new TrailService(store, http);
  const openSource = new OpenSourceService(store, http);
  const routers = [
    feedRoutes(store, collector),
    profileRoutes(store, collector),
    sourcesRoutes(store, collector),
    topicRoutes(store, collector),
    summariesRoutes(store, collector),
    trailRoutes(store, trails),
    openSourceRoutes(openSource),
    preferenceRoutes(store),
  ];
  return {
    async refresh() {
      await collector.refresh();
      trails.refreshWatched();
    },
    async dispatch(path: string, method: string, body?: unknown) {
      for (const router of routers) {
        const result = await router.dispatch(path, method, body);
        if (result) {
          if (result.status >= 400)
            throw new Error((result.body as { error: string }).error);
          return result.body;
        }
      }
      throw new Error("Unknown local operation");
    },
  };
}
