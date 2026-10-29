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
import { LocalAI, MODELS, summarizeViaEndpoint } from "../local-ai";
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
    () =>
      MODELS.find((m) => m.id === preferences.get("model"))?.id || MODELS[0].id,
  );
  const [endpointUrl, setEndpointUrlState] = useState(
    () => preferences.get("ai-endpoint") || "",
  );
  const [endpointModel, setEndpointModelState] = useState(
    () => preferences.get("ai-endpoint-model") || "qwen2.5:7b",
  );
  const [status, setStatus] = useState<
    "off" | "loading" | "ready" | "working" | "error"
  >(() => (preferences.get("ai-endpoint") ? "ready" : "off"));
  const [preferred, setPreferredState] = useState(
    () => preferences.get("ai-enabled") !== "false",
  );
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState(0);
  const [summaries, setSummaries] = useState<Record<string, Summary>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [interestKey, setInterestKey] = useState("");
  const engine = useRef<LocalAI | null>(null),
    generation = useRef(0);
  const loading = useRef<Promise<boolean> | null>(null);
  const working = useRef(false);
  const autoStopped = useRef("");
  const endpointRequest = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      ++generation.current;
      engine.current?.cancel();
      endpointRequest.current?.abort();
    },
    [],
  );
  useEffect(() => {
    if (!profile) return;
    let active = true;
    crypto.subtle
      .digest(
        "SHA-256",
        new TextEncoder().encode(
          JSON.stringify([
            ...(profile.focusTerms?.length
              ? [profile.prompt, profile.terms, profile.focusTerms]
              : [profile.prompt, profile.terms]),
            ...(endpointUrl.trim() ? [endpointUrl.trim()] : []),
          ]),
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
    endpointUrl,
  ]);
  const activeModelId = endpointUrl.trim()
    ? `endpoint:${endpointModel.trim() || "default"}`
    : model;
  const key = (s: Story, modelId = activeModelId) =>
    [
      s.id,
      summaryInput(s, profile ? summaryInterests(profile) : ""),
      depth,
      modelId,
      PROMPT_VERSION,
      interestKey,
    ].join(":");
  const selectedKey = story ? key(story) : "";
  useEffect(() => {
    if (!story || !interestKey) return;
    let active = true;
    api<{ result: Summary } | null>(
      `/summaries/${story.id}?model=${encodeURIComponent(activeModelId)}&interestKey=${interestKey}&depth=${depth}`,
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
    autoStopped.current = selectedKey;
    ++generation.current;
    endpointRequest.current?.abort();
    endpointRequest.current = null;
    loading.current = null;
    working.current = false;
    engine.current?.cancel();
    engine.current = null;
    setStatus(endpointUrl.trim() ? "ready" : "off");
    setMessage("Stopped.");
  }
  function disable() {
    cancel();
    setStatus("off");
  }
  function setPreferred(value: boolean) {
    preferences.set("ai-enabled", String(value));
    setPreferredState(value);
  }
  function setModel(value: string) {
    cancel();
    setModelState(value);
    preferences.set("model", value);
  }
  function setEndpointConfig(url: string, modelName: string) {
    cancel();
    const cleanUrl = url.trim();
    const cleanModel = modelName.trim() || "qwen2.5:7b";
    setEndpointUrlState(cleanUrl);
    setEndpointModelState(cleanModel);
    preferences.set("ai-endpoint", cleanUrl);
    preferences.set("ai-endpoint-model", cleanModel);
    if (cleanUrl) {
      setStatus("ready");
      setMessage(`Connected to endpoint (${cleanModel}).`);
    } else if (!engine.current) {
      setStatus("off");
      setMessage("");
    }
  }
  function enable(): Promise<boolean> {
    if (loading.current) return loading.current;
    if (status === "ready" || status === "working")
      return Promise.resolve(true);
    autoStopped.current = "";
    if (endpointUrl.trim()) {
      setStatus("ready");
      setErrors({});
      setMessage("Ready to summarize with your connected model.");
      return Promise.resolve(true);
    }
    const current = ++generation.current;
    engine.current?.cancel();
    const local = new LocalAI();
    engine.current = local;
    setStatus("loading");
    setMessage("Checking device…");
    setProgress(0);
    const task = (async () => {
      try {
        const loadedModel = await local.enable(model, (p, t) => {
          if (current === generation.current) {
            setProgress(Math.max(0, Math.min(1, p)));
            setMessage(t);
          }
        });
        if (current === generation.current) {
          if (loadedModel !== model) {
            setModelState(loadedModel);
            preferences.set("model", loadedModel);
          }
          setErrors({});
          setStatus("ready");
          setMessage(
            loadedModel === model
              ? "Model loaded. Select an item to get a summary."
              : "Loaded a compact model compatible with your graphics device.",
          );
          return true;
        }
      } catch (e) {
        local.cancel();
        if (current === generation.current) {
          engine.current = null;
          setStatus("error");
          setMessage((e as Error).message);
        }
      } finally {
        if (current === generation.current) loading.current = null;
      }
      return false;
    })();
    loading.current = task;
    return task;
  }
  const [cacheChecked, setCacheChecked] = useState("");
  async function summarize(stories: Story[]) {
    if (working.current || !profile || !interestKey) return;
    working.current = true;
    autoStopped.current = "";
    let failed = false;
    let current = generation.current;
    try {
      if (status !== "ready") {
        const task = enable();
        current = generation.current;
        const loaded = await task;
        if (!loaded || current !== generation.current) return;
      }
      setStatus("working");
      const summaryModelId = endpointUrl.trim()
        ? activeModelId
        : engine.current?.modelId || model;
      const controller = new AbortController();
      endpointRequest.current = controller;
      for (const [index, item] of stories
        .filter((s) => s.abstract || s.releaseText)
        .slice(0, 10)
        .entries()) {
        if (current !== generation.current) break;
        setMessage(`Reading ${index + 1}…`);
        try {
          const cached = await api<{ result: Summary } | null>(
            `/summaries/${item.id}?model=${encodeURIComponent(summaryModelId)}&interestKey=${interestKey}&depth=${depth}`,
          );
          if (current !== generation.current) break;
          const result =
            cached?.result ||
            (endpointUrl.trim()
              ? await summarizeViaEndpoint(
                  item,
                  summaryInterests(profile),
                  depth,
                  endpointUrl.trim(),
                  endpointModel.trim(),
                  AbortSignal.any([
                    controller.signal,
                    AbortSignal.timeout(120000),
                  ]),
                )
              : await engine.current!.summarize(
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
              model: summaryModelId,
              interestKey,
              result,
            });
          if (current !== generation.current) break;
          setSummaries((prior) => ({
            ...prior,
            [key(item, summaryModelId)]: result,
          }));
          setErrors((prior) => ({ ...prior, [key(item, summaryModelId)]: "" }));
        } catch (e) {
          if (current === generation.current) {
            failed = true;
            engine.current?.cancel();
            engine.current = null;
            setStatus("error");
            setMessage((e as Error).message);
            setErrors((prior) => ({
              ...prior,
              [key(item, summaryModelId)]: (e as Error).message,
            }));
          }
          break;
        }
      }
    } finally {
      if (current === generation.current) {
        working.current = false;
        endpointRequest.current = null;
        if (!failed && (engine.current || endpointUrl.trim())) {
          setStatus("ready");
          setMessage("Ready.");
        }
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
      !errors[key(story)] &&
      autoStopped.current !== key(story) &&
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
    endpointUrl,
    endpointModel,
    setEndpointConfig,
    preferred,
    setPreferred,
    disable,
    status,
    message,
    progress,
    enable,
    cancel,
    summarize,
    summary: story ? summaries[key(story)] : undefined,
    error: story ? errors[key(story)] : undefined,
  };
}
export type AIState = ReturnType<typeof useLocalAI>;
