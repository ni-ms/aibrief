import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import type {
  Feed,
  FollowedTopic,
  DiscoveryProvider,
  Profile,
  Resource,
  Source,
  Story,
} from "../../shared/types.ts";
export function useFeed() {
  const [data, setData] = useState<Feed | null>(null);
  const [providers, setProviders] = useState<DiscoveryProvider[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [since, setSince] = useState<string | null>(null);
  const visited = useRef(false),
    version = useRef(0);
  const providerSources = useRef("");
  const loading = useRef(0);
  const load = useCallback(async () => {
    const current = ++version.current;
    loading.current++;
    try {
      const next = await api<Feed>("/feed");
      if (current !== version.current) return;
      setData(next);
      const sourceKey = JSON.stringify(
        next.sources.map((s) => [s.id, s.enabled, s.config]),
      );
      if (providerSources.current !== sourceKey) {
        providerSources.current = sourceKey;
        void api<DiscoveryProvider[]>("/discovery/providers")
          .then(setProviders)
          .catch(() => {
            providerSources.current = "";
          });
      }
      setError("");
      if (!visited.current) {
        visited.current = true;
        setSince(next.profile.lastVisit);
        void api("/visit", "POST").catch(() => {
          visited.current = false;
        });
      }
    } catch (e) {
      if (current === version.current) setError((e as Error).message);
    } finally {
      loading.current--;
    }
  }, []);
  useEffect(() => {
    void load();
    void api<Resource[]>("/resources")
      .then(setResources)
      .catch((e) => setError(e.message));
    return () => {
      ++version.current;
    };
  }, [load]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let active = true;
    const schedule = () => {
      timer = setTimeout(
        async () => {
          if (!document.hidden && !loading.current) await load();
          if (active) schedule();
        },
        !data || data.syncing ? 3000 : 60000,
      );
    };
    schedule();
    const onVisible = () => {
      if (!document.hidden && !loading.current) {
        clearTimeout(timer);
        void load().finally(() => {
          if (active) schedule();
        });
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load, !!data, data?.syncing]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(timer);
  }, [notice]);
  async function refresh(force = true) {
    try {
      await api("/refresh", "POST", { force });
      setNotice("Refreshing sources…");
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function refreshSource(sourceId: string) {
    try {
      await api(`/sources/${sourceId}/refresh`, "POST");
      setNotice("Checking source…");
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function act(story: Story, patch: Record<string, unknown>) {
    try {
      await api(`/stories/${story.groupId}`, "PATCH", patch);
      await load();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  }
  async function saveSource(source: Source) {
    await api(`/sources/${source.id}`, "PUT", source);
    await load();
    setNotice(
      source.enabled
        ? `${source.name} saved. Check Latest for collected items.`
        : `${source.name} paused.`,
    );
  }
  async function removeSource(sourceId: string) {
    await api(`/sources/${sourceId}`, "DELETE");
    await load();
    setNotice("Source removed.");
  }
  async function saveProfile(profile: Profile) {
    await api("/profile", "PUT", profile);
    await load();
    setNotice("Interests saved.");
  }
  async function followTopic(query: string, selectedProviders: string[]) {
    const topic = await api<FollowedTopic>("/topics", "POST", {
      query,
      providers: selectedProviders,
    });
    await load();
    setNotice(`Following ${topic.name}. Collecting its first batch…`);
    return topic;
  }
  async function updateTopic(
    id: string,
    patch: { name?: string; paused?: boolean },
  ) {
    await api(`/topics/${id}`, "PATCH", patch);
    await load();
  }
  async function removeTopic(id: string) {
    await api(`/topics/${id}`, "DELETE");
    await load();
  }
  return {
    data,
    providers,
    followTopic,
    updateTopic,
    removeTopic,
    resources,
    error,
    notice,
    since,
    load,
    refresh,
    refreshSource,
    act,
    saveSource,
    removeSource,
    saveProfile,
    setNotice,
    resetSince: () => setSince(null),
  };
}
