import { useEffect, useRef, useState } from "react";
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
  async function load() {
    const current = ++version.current;
    try {
      const next = await api<Feed>("/feed");
      if (current !== version.current) return;
      setData(next);
      void api<DiscoveryProvider[]>("/discovery/providers")
        .then(setProviders)
        .catch(() => {});
      setError("");
      if (!visited.current) {
        visited.current = true;
        setSince(next.profile.lastVisit);
        void api("/visit", "POST").catch(() => {
          visited.current = false;
        });
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
    void api<Resource[]>("/resources")
      .then(setResources)
      .catch((e) => setError(e.message));
    const timer = setInterval(() => void load(), 5000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(timer);
  }, [notice]);
  async function refresh() {
    try {
      await api("/refresh", "POST");
      setNotice(
        "Refreshing. Sources checked in the last 5 minutes use the cache.",
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function act(story: Story, patch: Record<string, unknown>) {
    try {
      await api(`/stories/${story.groupId}`, "PATCH", patch);
      await load();
    } catch (e) {
      setError((e as Error).message);
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
    act,
    saveSource,
    saveProfile,
    setNotice,
  };
}
