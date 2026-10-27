import { useEffect, useRef, useState } from "react";
import type { ResearchTrail } from "../../shared/types.ts";
import { api } from "../lib/api";
export function useTrail(groupId: number) {
  const [trail, setTrail] = useState<ResearchTrail | null>(null),
    [error, setError] = useState("");
  const active = useRef(false),
    revision = useRef(0),
    pending = useRef(false),
    latest = useRef<ResearchTrail | null>(null);
  function commit(next: ResearchTrail) {
    if (!active.current) return;
    latest.current = next;
    setTrail(next);
    setError("");
  }
  async function load() {
    if (pending.current) return;
    const current = ++revision.current;
    try {
      const next = await api<ResearchTrail>(`/trails/${groupId}`);
      if (active.current && current === revision.current) commit(next);
      return next;
    } catch (e) {
      if (active.current && current === revision.current)
        setError((e as Error).message);
    }
  }
  async function mutate(path: string, method: string, body?: unknown) {
    pending.current = true;
    ++revision.current; // A slower poll cannot overwrite a saved/hidden link.
    try {
      commit(
        await api<ResearchTrail>(`/trails/${groupId}${path}`, method, body),
      );
    } finally {
      pending.current = false;
    }
  }
  async function refresh() {
    try {
      await mutate("/refresh", "POST");
    } catch (e) {
      if (active.current) setError((e as Error).message);
    }
  }
  useEffect(() => {
    active.current = true;
    void load().then((next) => {
      if (
        active.current &&
        next &&
        (!next.lastAttempt ||
          Date.now() - Date.parse(next.lastAttempt) > 6 * 3600000)
      )
        void refresh();
    });
    // Once a check finishes, no background polling is needed for this single-user view.
    const timer = setInterval(() => {
      if (latest.current?.refreshing) void load();
    }, 2000);
    return () => {
      active.current = false;
      ++revision.current;
      clearInterval(timer);
    };
  }, [groupId]);
  async function add(body: {
    kind: "code" | "followup";
    url: string;
    title: string;
    note: string;
  }) {
    await mutate("/links", "POST", body);
  }
  async function hide(id: string, hidden: boolean) {
    await mutate(`/links/${id}`, "PATCH", { hidden });
  }
  return { trail, error, refresh, add, hide };
}
