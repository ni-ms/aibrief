export type SourceKind =
  "arxiv" | "hn" | "github" | "openreview" | "rss" | "bluesky" | "reddit";
export interface Source {
  id: string;
  kind: SourceKind;
  name: string;
  enabled: boolean;
  resourceId?: string;
  config: {
    categories?: string[];
    searchTerms?: string[];
    repo?: string;
    limit?: number;
    venue?: string;
    url?: string;
    actor?: string;
    subreddit?: string;
    sort?: "new" | "hot" | "top";
  };
  lastSuccess: string | null;
  lastAttempt: string | null;
  error: string | null;
}
export interface CollectedItem {
  metadata?: {
    arxivId?: string;
    arxivVersion?: number;
    updatedAt?: string | null;
    comment?: string;
    doi?: string;
    venue?: string;
    authors?: string[];
    publicationType?:
      "preprint" | "conference" | "article" | "post" | "release";
  };
  fetchedAt?: string;
  externalId: string;
  canonicalUrl: string;
  title: string;
  abstract: string;
  releaseText: string;
  publishedAt: string | null;
  topics: string[];
  kind: "research" | "tools" | "news";
  links: { label: string; url: string }[];
}
export interface Item extends CollectedItem {
  id: number;
  groupId: number;
  sourceId: string;
  sourceName: string;
  sourceKind?: SourceKind;
  firstSeenAt: string;
  lastFetchedAt: string;
  contentHash: string;
}
export interface Story extends Item {
  followedTopicIds?: string[];
  changedAt?: string;
  sources: string[];
  links: { label: string; url: string }[];
  read: boolean;
  saved: boolean;
  dismissed: boolean;
  feedback: number;
  score: number;
  reasons: string[];
  ranking?: Ranking;
}
export interface Profile {
  prompt: string;
  terms: string[];
  weights: Record<string, number>;
  lastVisit: string | null;
  focusTerms?: string[];
  excludeTerms?: string[];
  strictFocus?: boolean;
}
export interface Feed {
  followedTopics: FollowedTopic[];
  stories: Story[];
  sources: Source[];
  profile: Profile;
  syncing: boolean;
  collectedAt: string | null;
}
export interface TopicCheck {
  lastAttempt: string | null;
  lastSuccess: string | null;
  error: string | null;
}
export interface FollowedTopic {
  id: string;
  name: string;
  query: string;
  providers: string[];
  paused: boolean;
  createdAt: string;
  checks: Record<string, TopicCheck>;
}
export interface DiscoveryProvider {
  id: string;
  name: string;
  capability: "upstream" | "collected";
  enabled: boolean;
}
export interface DiscoveryResult extends CollectedItem {
  providerId: string;
  providerName: string;
  origin: "upstream" | "collected";
}
export interface Discovery {
  query: string;
  providers: string[];
  results: DiscoveryResult[];
  checks: Record<string, TopicCheck>;
}
export type SummaryDepth = "brief" | "standard" | "detailed";
export interface Summary {
  whatChanged: string;
  whyItMatters: string;
  evidence: string;
  topics: string[];
}

export interface Ranking {
  lexical: number;
  focus: number;
  feedback: number;
  freshness: number;
  context: number;
  total: number;
  eligible: boolean;
  matchedTerms: string[];
  excludedBy: string[];
}
export interface Resource {
  id: string;
  kind: SourceKind | null;
  name: string;
  category: "Research" | "Code" | "Discussion" | "Writing" | "Social";
  description: string;
  docs: string;
  field?: "categories" | "repo" | "venue" | "url" | "actor" | "subreddit";
  placeholder?: string;
  preset?: Source;
  unavailable?: string;
  caveat?: string;
  connectionLabel?: string;
}

export interface PaperVersion {
  paperKey: string;
  version: number;
  title: string;
  abstract: string;
  comment: string;
  updatedAt: string | null;
  observedAt: string;
  sourceUrl: string;
}
export interface TrailLink {
  id: string;
  kind: "code" | "followup";
  title: string;
  url: string;
  relation: "paper-linked" | "release-linked" | "cites" | "mentions" | "user";
  evidenceUrl: string;
  evidenceText: string;
  publishedAt?: string | null;
  year?: number;
  available?: boolean | null;
  description?: string;
  release?: { title: string; url: string; publishedAt: string | null };
  linkedVersion?: number;
  lastCheckedAt?: string;
  error?: string;
}
export interface TrailCheck {
  lastAttempt: string | null;
  lastSuccess: string | null;
  error: string | null;
}
export interface ResearchTrail {
  groupId: number;
  paperUrl: string;
  paperKey: string | null;
  versions: PaperVersion[];
  code: TrailLink[];
  followUps: TrailLink[];
  checks: Partial<Record<"versions" | "code" | "citations", TrailCheck>>;
  lastAttempt: string | null;
  refreshing: boolean;
  citationsPartial: boolean;
}
export interface VersionChanges {
  from: number;
  to: number;
  titleChanged: boolean;
  commentChanged: boolean;
  addedSentences: string[];
  removedSentences: string[];
  codeAdded: string[];
  codeRemoved: string[];
  abstractChanged: boolean;
  truncated: boolean;
}
