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
import { loadSummarySource } from "../lib/article.ts";
export function useLocalAI(profile: Profile | undefined, story: Story | null) {
  const [depth, setDepthState] = useState<SummaryDepth>(() => {
    const saved = DepthSchema.safeParse(preferences.get("summary-depth"));
    return saved.success ? saved.data : "standard";
  });
  const [depthRequested, setDepthRequested] = useState<number | null>(null);
  function setDepth(value: SummaryDepth) {
    setDepthState(value);
    setDepthRequested(story?.id ?? null);
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
  const [articles, setArticles] = useState<Record<string, string>>({});
  const [fetchingArticle, setFetchingArticle] = useState("");
  const [articleErrors, setArticleErrors] = useState<Record<string, string>>(
    {},
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [interestKey, setInterestKey] = useState("");
  const engine = useRef<LocalAI | null>(null),
    generation = useRef(0);
  const loading = useRef<Promise<boolean> | null>(null);
  const working = useRef(false);
  const autoStopped = useRef("");
  const endpointRequest = useRef<AbortController | null>(null);
  const articleRequest = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      ++generation.current;
      engine.current?.cancel();
      endpointRequest.current?.abort();
      articleRequest.current?.abort();
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
  const sourceKey = (s: Story) => `${s.id}:${s.contentHash}:${s.canonicalUrl}`;
  const key = (s: Story, modelId = activeModelId) =>
    [
      s.id,
      s.contentHash,
      s.canonicalUrl,
      summaryInput(
        { ...s, articleText: s.articleText || articles[sourceKey(s)] },
        profile ? summaryInterests(profile) : "",
      ),
      depth,
      modelId,
      PROMPT_VERSION,
      interestKey,
    ].join(":");
  const selectedKey = story ? key(story) : "";
  useEffect(() => {
    if (!story || !interestKey) return;
    let active = true;
    loadSummarySource(story, api, false)
      .then(async (source) => {
        if (!active) return;
        if (source.articleText)
          setArticles((prior) => ({
            ...prior,
            [sourceKey(story)]: source.articleText!,
          }));
        const cached = await api<{ result: Summary } | null>(
          `/summaries/${story.id}?model=${encodeURIComponent(activeModelId)}&interestKey=${interestKey}&depth=${depth}`,
        );
        if (cached && active)
          setSummaries((prior) => ({ ...prior, [key(source)]: cached.result }));
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
    articleRequest.current?.abort();
    articleRequest.current = null;
    setFetchingArticle("");
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
    if (
      engine.current?.engine ||
      (endpointUrl.trim() && (status === "ready" || status === "working"))
    )
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
  async function fetchArticle(item: Story) {
    if (articleRequest.current || working.current) return;
    const controller = new AbortController();
    articleRequest.current = controller;
    setFetchingArticle(sourceKey(item));
    setArticleErrors((prior) => ({ ...prior, [sourceKey(item)]: "" }));
    try {
      const source = await loadSummarySource(
        item,
        api,
        true,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setArticles((prior) => ({
        ...prior,
        [sourceKey(item)]: source.articleText!,
      }));
    } catch (error) {
      if (!controller.signal.aborted)
        setArticleErrors((prior) => ({
          ...prior,
          [sourceKey(item)]: (error as Error).message,
        }));
    } finally {
      if (articleRequest.current === controller) {
        articleRequest.current = null;
        setFetchingArticle("");
      }
    }
  }
  async function summarize(stories: Story[], fetchMissing = true) {
    if (working.current || !profile || !interestKey) return;
    articleRequest.current?.abort();
    articleRequest.current = null;
    working.current = true;
    setDepthRequested(null);
    setErrors((prior) => {
      const next = { ...prior };
      for (const item of stories) delete next[key(item)];
      return next;
    });
    setArticleErrors((prior) => {
      const next = { ...prior };
      for (const item of stories) delete next[sourceKey(item)];
      return next;
    });
    autoStopped.current = "";
    let failed = false;
    let current = generation.current;
    const controller = new AbortController();
    endpointRequest.current = controller;
    setStatus("working");
    try {
      let summaryModelId = endpointUrl.trim()
        ? activeModelId
        : engine.current?.modelId || model;
      for (const [index, original] of stories
        .filter((s) => fetchMissing || s.abstract || s.releaseText)
        .slice(0, 10)
        .entries()) {
        if (current !== generation.current) break;
        setMessage(`Reading ${index + 1}…`);
        let item = original;
        try {
          const needsArticle = !original.abstract && !original.releaseText;
          if (needsArticle && fetchMissing) {
            setMessage("Fetching readable article…");
            setFetchingArticle(sourceKey(original));
          }
          item = await loadSummarySource(
            original,
            api,
            needsArticle && fetchMissing,
            controller.signal,
          );
          if (current !== generation.current) break;
          setFetchingArticle("");
          if (item.articleText)
            setArticles((prior) => ({
              ...prior,
              [sourceKey(item)]: item.articleText!,
            }));
          const cached = await api<{ result: Summary } | null>(
            `/summaries/${item.id}?model=${encodeURIComponent(summaryModelId)}&interestKey=${interestKey}&depth=${depth}`,
          );
          if (current !== generation.current) break;
          if (!cached && !endpointUrl.trim() && !engine.current?.engine) {
            const task = enable();
            current = generation.current;
            const loaded = await task;
            if (!loaded || current !== generation.current) {
              failed = true;
              return;
            }
            summaryModelId = engine.current?.modelId || model;
          }
          setStatus("working");
          setMessage(`Summarizing ${index + 1}…`);
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
        setFetchingArticle("");
        if (!failed && (engine.current || endpointUrl.trim())) {
          setStatus("ready");
          setMessage("Ready.");
        } else if (!failed) {
          setStatus("off");
          setMessage("");
        }
      }
    }
  }
  useEffect(() => {
    if (
      (preferred || depthRequested === story?.id) &&
      (status === "ready" ||
        (depthRequested === story?.id &&
          status !== "working" &&
          status !== "loading")) &&
      story &&
      interestKey &&
      cacheChecked === key(story) &&
      !summaries[key(story)] &&
      !errors[key(story)] &&
      autoStopped.current !== key(story) &&
      (story.abstract || story.releaseText || depthRequested === story.id)
    )
      void summarize([story], depthRequested === story.id);
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
    articleText: story ? articles[sourceKey(story)] : undefined,
    fetchingArticle: !!story && fetchingArticle === sourceKey(story),
    articleError: story ? articleErrors[sourceKey(story)] : undefined,
    fetchArticle,
    summary: story ? summaries[key(story)] : undefined,
    error: story ? errors[key(story)] : undefined,
  };
}
export type AIState = ReturnType<typeof useLocalAI>;
