import { preferences } from "../lib/preferences";
import { useEffect, useRef, useState } from "react";
import type {
  Profile,
  Story,
  Summary,
  SummaryDepth,
} from "../../shared/types.ts";
import {
  PROMPT_VERSION,
  summaryInput,
  summaryInterests,
  DepthSchema,
} from "../../shared/summary.ts";
import {
  LocalAI,
  MODELS,
  checkDevice,
  downloadBytes,
  modelIsCached,
} from "../local-ai";
import { api } from "../lib/api";
export function useLocalAI(profile: Profile | undefined, story: Story | null) {
  const [depth, setDepthState] = useState<SummaryDepth>(() => {
    const saved = DepthSchema.safeParse(preferences.get("summary-depth"));
    return saved.success ? saved.data : "standard";
  });
  const [depthRequested, setDepthRequested] = useState(false);
  function setDepth(value: SummaryDepth) {
    setDepthState(value);
    setDepthRequested(true);
    preferences.set("summary-depth", value);
  }
  const [model, setModelState] = useState(
    () => preferences.get("model") || MODELS[0].id,
  );
  const [status, setStatus] = useState<
    "off" | "loading" | "ready" | "working" | "error"
  >("off");
  const [preferred, setPreferredState] = useState(
    () => preferences.get("ai-enabled") !== "false",
  );
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState(0);
  const [device, setDevice] = useState("");
  const [bytes, setBytes] = useState<number | null>(null);
  const [checking, setChecking] = useState(false);
  const [summaries, setSummaries] = useState<Record<string, Summary>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [interestKey, setInterestKey] = useState("");
  const engine = useRef<LocalAI | null>(null),
    generation = useRef(0);
  useEffect(() => () => engine.current?.cancel(), []);
  useEffect(() => {
    if (!profile) return;
    let active = true;
    crypto.subtle
      .digest(
        "SHA-256",
        new TextEncoder().encode(
          JSON.stringify(
            profile.focusTerms?.length
              ? [profile.prompt, profile.terms, profile.focusTerms]
              : [profile.prompt, profile.terms],
          ),
        ),
      )
      .then((hash) => {
        if (active)
          setInterestKey(
            [...new Uint8Array(hash)]
              .map((b) => b.toString(16).padStart(2, "0"))
              .join(""),
          );
      });
    return () => {
      active = false;
    };
  }, [
    profile?.prompt,
    JSON.stringify(profile?.terms),
    JSON.stringify(profile?.focusTerms),
  ]);
  const key = (s: Story) =>
    [
      s.id,
      summaryInput(s, profile ? summaryInterests(profile) : ""),
      depth,
      model,
      PROMPT_VERSION,
      interestKey,
    ].join(":");
  const selectedKey = story ? key(story) : "";
  useEffect(() => {
    if (!story || !interestKey) return;
    let active = true;
    api<{ result: Summary } | null>(
      `/summaries/${story.id}?model=${encodeURIComponent(model)}&interestKey=${interestKey}&depth=${depth}`,
    )
      .then((cached) => {
        if (cached && active)
          setSummaries((prior) => ({ ...prior, [key(story)]: cached.result }));
      })
      .catch(() => {})
      .finally(() => {
        if (active) setCacheChecked(key(story));
      });
    return () => {
      active = false;
    };
  }, [selectedKey]);
  function cancel() {
    ++generation.current;
    engine.current?.cancel();
    engine.current = null;
    setStatus("off");
    setMessage("Stopped.");
  }
  function disable() {
    preferences.set("ai-enabled", "false");
    setPreferredState(false);
    cancel();
  }
  function setPreferred(value: boolean) {
    preferences.set("ai-enabled", String(value));
    setPreferredState(value);
    if (!value) cancel();
  }
  function setModel(value: string) {
    cancel();
    setModelState(value);
    preferences.set("model", value);
    setDevice("");
    setBytes(null);
  }
  async function check() {
    setChecking(true);
    try {
      setDevice(await checkDevice(model));
      setBytes(await downloadBytes(model));
    } catch (e) {
      setDevice((e as Error).message);
    } finally {
      setChecking(false);
    }
  }
  async function enable() {
    preferences.set("ai-enabled", "true");
    setPreferredState(true);
    const current = ++generation.current;
    engine.current?.cancel();
    const local = new LocalAI();
    engine.current = local;
    setStatus("loading");
    setMessage("Checking device…");
    setProgress(0);
    try {
      await local.enable(model, (p, t) => {
        if (current === generation.current) {
          setProgress(p);
          setMessage(t);
        }
      });
      if (current === generation.current) {
        setStatus("ready");
        setMessage("Ready.");
      }
    } catch (e) {
      local.cancel();
      if (current === generation.current) {
        setStatus("error");
        setMessage((e as Error).message);
      }
    }
  }
  useEffect(() => {
    if (!preferred || engine.current) return;
    const current = ++generation.current;
    let active = true;
    setStatus("loading");
    setMessage("Checking cached model…");
    void (async () => {
      try {
        setDevice(await checkDevice(model));
        const cached = await modelIsCached(model);
        if (!active || generation.current !== current) return;
        if (cached) await enable();
        else {
          setStatus("off");
          setMessage(
            "Enable the local model to download its files. It will start automatically on later visits while cached.",
          );
        }
      } catch (e) {
        if (active && generation.current === current) {
          setStatus("error");
          setMessage((e as Error).message);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [model, preferred]);
  const [cacheChecked, setCacheChecked] = useState("");
  async function summarize(stories: Story[]) {
    if (status !== "ready" || !profile || !interestKey) return;
    const current = generation.current;
    setStatus("working");
    let failed = false;
    try {
      for (const [index, item] of stories
        .filter((s) => s.abstract || s.releaseText)
        .slice(0, 10)
        .entries()) {
        if (current !== generation.current) break;
        setMessage(`Reading ${index + 1}…`);
        try {
          const cached = await api<{ result: Summary } | null>(
            `/summaries/${item.id}?model=${encodeURIComponent(model)}&interestKey=${interestKey}&depth=${depth}`,
          );
          const result =
            cached?.result ||
            (await engine.current!.summarize(
              item,
              summaryInterests(profile),
              depth,
            ));
          if (current !== generation.current) break;
          if (!cached)
            await api(`/summaries/${item.id}`, "PUT", {
              contentHash: item.contentHash,
              inputText: summaryInput(item, summaryInterests(profile)),
              depth,
              model,
              interestKey,
              result,
            });
          if (current !== generation.current) break;
          setSummaries((prior) => ({ ...prior, [key(item)]: result }));
          setErrors((prior) => ({ ...prior, [key(item)]: "" }));
        } catch (e) {
          if (current === generation.current) {
            failed = true;
            engine.current?.cancel();
            setStatus("error");
            setMessage((e as Error).message);
            setErrors((prior) => ({
              ...prior,
              [key(item)]: (e as Error).message,
            }));
          }
          break;
        }
      }
    } finally {
      if (current === generation.current && !failed) {
        setStatus("ready");
        setMessage("Ready.");
      }
    }
  }
  useEffect(() => {
    if (
      (preferred || depthRequested) &&
      status === "ready" &&
      story &&
      interestKey &&
      cacheChecked === key(story) &&
      !summaries[key(story)] &&
      (story.abstract || story.releaseText)
    )
      void summarize([story]);
  }, [
    preferred,
    depthRequested,
    depth,
    status,
    story?.id,
    story?.contentHash,
    interestKey,
    cacheChecked,
  ]);
  return {
    depth,
    setDepth,
    model,
    setModel,
    preferred,
    setPreferred,
    disable,
    status,
    message,
    progress,
    device,
    bytes,
    checking,
    check,
    enable,
    cancel,
    summarize,
    summary: story ? summaries[key(story)] : undefined,
    error: story ? errors[key(story)] : undefined,
  };
}
export type AIState = ReturnType<typeof useLocalAI>;
