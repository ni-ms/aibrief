export interface GithubProject {
  id: number;
  fullName: string;
  description: string;
  language: string | null;
  stars: number;
  forks: number;
  topics: string[];
  license: string | null;
  archived: boolean;
  pushedAt: string | null;
}

export interface GithubCollection {
  username: string;
  addedAt: string;
}

export interface StarredProjects {
  username: string;
  page: number;
  projects: GithubProject[];
  nextPage: number | null;
  checkedAt: string | null;
  stale: boolean;
  error: string | null;
}

/** Accept a handle or the public profile/stars URL; never accept arbitrary hosts. */
export function githubUsername(input: string): string {
  let name = input.trim();
  if (/^https?:\/\//i.test(name)) {
    const url = new URL(name);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "github.com" ||
      url.port ||
      url.username ||
      url.password ||
      !/^\/[^/]+\/?$/.test(url.pathname)
    )
      throw new Error(
        "Enter a GitHub username or a public GitHub profile URL.",
      );
    name = url.pathname.split("/")[1];
  }
  name = name.replace(/^@/, "").toLowerCase();
  if (!/^(?!.*--)[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/.test(name))
    throw new Error("Enter a valid GitHub username.");
  return name;
}

export function githubProjectUrl(project: Pick<GithubProject, "fullName">) {
  return `https://github.com/${project.fullName}`;
}
