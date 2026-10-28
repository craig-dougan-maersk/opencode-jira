import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { FIELD, SEARCH_FIELDS } from "./fields.ts";
import { commentAdf, terminalText } from "./adf.ts";
import type { BoardConfig, Column, Issue, SprintInfo } from "./types.ts";

const API = "/rest/api/3";
const AGILE = "/rest/agile/1.0";
const RETRIES = 3;
const MAX_PAGES = 12;
const PAGE_SIZE = 100;

export class JiraError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "JiraError";
    this.status = status;
  }
}

interface Credentials {
  readonly email: string;
  readonly token: string;
}

let cachedCredentials: Credentials | undefined;

/**
 * Credentials come from the environment, then fall back to parsing ~/.zshenv.
 * A TUI plugin runs in the terminal process, so both normally resolve.
 */
export function resolveCredentials(): Credentials {
  if (cachedCredentials) return cachedCredentials;
  let email = process.env.JIRA_EMAIL;
  let token = process.env.JIRA_API_TOKEN;
  if (!email || !token) {
    const fromShell = readShellEnv();
    email ||= fromShell.JIRA_EMAIL;
    token ||= fromShell.JIRA_API_TOKEN;
  }
  if (!email || !token) {
    throw new JiraError(
      0,
      "Missing JIRA_EMAIL / JIRA_API_TOKEN. Export them, or add them to ~/.zshenv.",
    );
  }
  cachedCredentials = { email, token };
  return cachedCredentials;
}

function readShellEnv(): Record<string, string> {
  const result: Record<string, string> = {};
  for (const file of [".zshenv", ".zprofile", ".zshrc", ".env"]) {
    try {
      const text = readFileSync(join(homedir(), file), "utf8");
      for (const name of ["JIRA_EMAIL", "JIRA_API_TOKEN"]) {
        if (result[name]) continue;
        const match = text.match(
          new RegExp(`(?:export\\s+)?${name}\\s*=\\s*"?([^"\\n]+)"?`),
        );
        if (match) result[name] = match[1].trim();
      }
    } catch {
      // File absent or unreadable: try the next candidate.
    }
  }
  return result;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class JiraClient {
  readonly site: string;
  private readonly auth: string;
  private accountId: string | undefined;

  constructor(site: string) {
    const { email, token } = resolveCredentials();
    this.site = site.replace(/^https?:\/\//, "").replace(/\/+$/, "");
    this.auth = `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`;
  }

  private url(
    path: string,
    query?: Record<string, string | number | boolean | undefined>,
  ) {
    const target = new URL(`https://${this.site}${path}`);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined) target.searchParams.set(key, String(value));
    }
    return target.toString();
  }

  private async request<T>(
    method: string,
    path: string,
    options: {
      query?: Record<string, string | number | boolean | undefined>;
      body?: unknown;
      signal?: AbortSignal;
      retry?: boolean;
    } = {},
  ): Promise<T> {
    const url = this.url(path, options.query);
    let lastError: unknown;
    const retries = options.retry === false ? 0 : RETRIES;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url, {
          method,
          signal: options.signal,
          headers: {
            Authorization: this.auth,
            Accept: "application/json",
            ...(options.body === undefined
              ? {}
              : { "Content-Type": "application/json" }),
          },
          body:
            options.body === undefined
              ? undefined
              : JSON.stringify(options.body),
        });
        if (response.status === 429 || response.status >= 500) {
          const retryAfter = Number(response.headers.get("retry-after"));
          const wait =
            Number.isFinite(retryAfter) && retryAfter > 0
              ? retryAfter * 1000
              : 1000 * (attempt + 1);
          if (attempt < retries) {
            await sleep(wait);
            continue;
          }
          throw new JiraError(
            response.status,
            `Jira returned ${response.status} for ${path}`,
          );
        }
        if (!response.ok) {
          throw new JiraError(
            response.status,
            `Jira ${response.status}; request rejected`,
          );
        }
        if (response.status === 204) return undefined as T;
        const text = await response.text();
        return (text ? JSON.parse(text) : undefined) as T;
      } catch (error) {
        lastError = error;
        if (error instanceof JiraError) throw error;
        if (options.signal?.aborted) throw error;
        if (attempt < retries) {
          await sleep(1000 * (attempt + 1));
          continue;
        }
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  /** The current user's accountId, resolved once per client. */
  async me(signal?: AbortSignal): Promise<string> {
    if (this.accountId) return this.accountId;
    const data = await this.request<{ accountId: string }>(
      "GET",
      `${API}/myself`,
      { signal },
    );
    this.accountId = data.accountId;
    return data.accountId;
  }

  /** Non-idempotent: exactly one attempt, including 429/5xx/transport errors. */
  async addComment(
    key: string,
    text: string,
  ): Promise<{ readonly id: string }> {
    if (!/^[A-Z][A-Z0-9_]*-\d+$/.test(key))
      throw new Error("Invalid issue key");
    // REST v3 documents 413 but publishes no stable numeric body limit.
    // This conservative plugin limit is not advertised as an API quota.
    if (!text.trim() || text.length > 32000 || terminalText(text) !== text)
      throw new Error("Comment must contain 1–32000 safe characters");
    return this.request(
      "POST",
      `${API}/issue/${encodeURIComponent(key)}/comment`,
      {
        body: { body: commentAdf(text) },
        retry: false,
        signal: AbortSignal.timeout(30000),
      },
    );
  }

  async myself(
    signal?: AbortSignal,
  ): Promise<{ accountId: string; displayName: string; emailAddress: string }> {
    return this.request("GET", `${API}/myself`, { signal });
  }

  /** Boards visible to the user, optionally scoped to a project. */
  async boards(
    projectKey?: string,
    signal?: AbortSignal,
  ): Promise<{ id: number; name: string; type: string }[]> {
    const data = await this.request<{
      values?: { id: number; name: string; type: string }[];
    }>("GET", `${AGILE}/board`, {
      query: { projectKeyOrId: projectKey, maxResults: 50 },
      signal,
    });
    return data.values ?? [];
  }

  async boardConfig(
    boardId: number,
    signal?: AbortSignal,
  ): Promise<BoardConfig> {
    const [config, board] = await Promise.all([
      this.request<{
        name?: string;
        filter?: { id?: string };
        columnConfig?: {
          columns?: { name: string; statuses?: { id: string }[] }[];
        };
      }>("GET", `${AGILE}/board/${boardId}/configuration`, { signal }),
      this.request<{ name: string; type: string }>(
        "GET",
        `${AGILE}/board/${boardId}`,
        { signal },
      ),
    ]);
    const columns: Column[] = (config.columnConfig?.columns ?? []).map(
      (column) => ({
        name: column.name,
        statusIds: (column.statuses ?? []).map((status) => status.id),
      }),
    );
    let filterJql = "";
    const filterId = config.filter?.id;
    if (filterId) {
      try {
        const filter = await this.request<{ jql?: string }>(
          "GET",
          `${API}/filter/${filterId}`,
          { signal },
        );
        filterJql = filter.jql ?? "";
      } catch {
        filterJql = "";
      }
    }
    return {
      id: boardId,
      name: board.name,
      type: board.type,
      columns,
      filterJql,
    };
  }

  async sprints(
    boardId: number,
    state?: string,
    signal?: AbortSignal,
  ): Promise<SprintInfo[]> {
    const data = await this.request<{ values?: SprintInfo[] }>(
      "GET",
      `${AGILE}/board/${boardId}/sprint`,
      {
        query: { state, maxResults: 50 },
        signal,
      },
    );
    return data.values ?? [];
  }

  async activeSprint(
    boardId: number,
    signal?: AbortSignal,
  ): Promise<SprintInfo | undefined> {
    const active = await this.sprints(boardId, "active", signal);
    return active[0];
  }

  async sprintIssues(
    boardId: number,
    sprintId: number,
    signal?: AbortSignal,
  ): Promise<Issue[]> {
    const raw = await this.paginateAgile(
      `${AGILE}/board/${boardId}/sprint/${sprintId}/issue`,
      signal,
    );
    return raw.map((item) => toIssue(item, this.site));
  }

  async backlog(
    boardId: number,
    signal?: AbortSignal,
  ): Promise<{ issues: Issue[]; truncated: boolean }> {
    const raw = await this.paginateAgile(
      `${AGILE}/board/${boardId}/backlog`,
      signal,
    );
    return {
      issues: raw.map((item) => toIssue(item, this.site)),
      truncated: false,
    };
  }

  /** JQL search, following nextPageToken until the result set is exhausted or capped. */
  async search(
    jql: string,
    options: {
      fields?: readonly string[];
      cap?: number;
      signal?: AbortSignal;
    } = {},
  ) {
    const cap = options.cap ?? PAGE_SIZE * MAX_PAGES;
    const issues: Issue[] = [];
    let token: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const data: {
        issues?: Record<string, unknown>[];
        nextPageToken?: string;
        isLast?: boolean;
      } = await this.request("POST", `${API}/search/jql`, {
        body: {
          jql,
          maxResults: Math.min(PAGE_SIZE, cap - issues.length),
          fields: options.fields ?? SEARCH_FIELDS,
          ...(token ? { nextPageToken: token } : {}),
        },
        signal: options.signal,
      });
      const batch = data.issues ?? [];
      for (const item of batch) issues.push(toIssue(item, this.site));
      if (data.isLast !== false && !data.nextPageToken) break;
      token = data.nextPageToken;
      if (!token || issues.length >= cap) break;
    }
    return { issues, truncated: issues.length >= cap };
  }

  async issue(key: string, signal?: AbortSignal): Promise<IssueDetailRaw> {
    return this.request("GET", `${API}/issue/${key}`, {
      query: {
        fields: [
          ...SEARCH_FIELDS,
          "description",
          "issuelinks",
          "subtasks",
          "parent",
          "labels",
          "created",
        ].join(","),
      },
      signal,
    });
  }

  async transitions(key: string, signal?: AbortSignal) {
    const data = await this.request<{
      transitions?: { id: string; name: string; to?: { name?: string } }[];
    }>("GET", `${API}/issue/${key}/transitions`, { signal });
    return data.transitions ?? [];
  }

  async transition(key: string, transitionId: string, signal?: AbortSignal) {
    await this.request("POST", `${API}/issue/${key}/transitions`, {
      body: { transition: { id: transitionId } },
      signal,
    });
  }

  async assign(key: string, accountId: string | null, signal?: AbortSignal) {
    await this.request("PUT", `${API}/issue/${key}/assignee`, {
      body: { accountId },
      signal,
    });
  }

  async addToSprint(
    sprintId: number,
    keys: readonly string[],
    signal?: AbortSignal,
  ) {
    await this.request("POST", `${AGILE}/sprint/${sprintId}/issue`, {
      body: { issues: [...keys] },
      signal,
    });
  }

  async edit(
    key: string,
    fields: Record<string, unknown>,
    signal?: AbortSignal,
  ) {
    await this.request("PUT", `${API}/issue/${key}`, {
      body: { fields },
      signal,
    });
  }

  private async paginateAgile(path: string, signal?: AbortSignal) {
    const results: Record<string, unknown>[] = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      const startAt = page * PAGE_SIZE;
      const data: {
        issues?: Record<string, unknown>[];
        total?: number;
        isLast?: boolean;
      } = await this.request("GET", path, {
        query: { startAt, maxResults: PAGE_SIZE },
        signal,
      });
      const batch = data.issues ?? [];
      results.push(...batch);
      const total = data.total ?? results.length;
      if (batch.length === 0 || results.length >= total || data.isLast === true)
        break;
    }
    return results;
  }
}

export interface IssueDetailRaw {
  key: string;
  fields: Record<string, any>;
}

export function toIssue(raw: Record<string, any>, site: string): Issue {
  const fields = raw.fields ?? {};
  const epicLink = firstString(fields[FIELD.epicLink]);
  const parent = fields[FIELD.parent];
  const parentKey: string | null = parent?.key ?? null;
  const parentIsEpic = parent?.fields?.issuetype?.name === "Epic";
  const epicKey = epicLink ?? (parentIsEpic ? parentKey : null);
  return {
    key: raw.key,
    summary: fields.summary ?? "",
    type: fields.issuetype?.name ?? "Unknown",
    status: fields.status?.name ?? "Unknown",
    statusId: String(fields.status?.id ?? ""),
    statusCategory: fields.status?.statusCategory?.name ?? "No Category",
    assignee: fields.assignee?.displayName ?? null,
    assigneeId: fields.assignee?.accountId ?? null,
    epicKey,
    parentKey,
    points:
      typeof fields[FIELD.storyPoints] === "number"
        ? fields[FIELD.storyPoints]
        : null,
    priority: fields.priority?.name ?? null,
    updated: fields.updated ?? "",
    url: `https://${site}/browse/${raw.key}`,
  };
}

function firstString(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  if (
    value &&
    typeof value === "object" &&
    "key" in (value as Record<string, unknown>)
  ) {
    const key = (value as Record<string, unknown>).key;
    return typeof key === "string" ? key : null;
  }
  return null;
}

export function truncate(text: string, max: number) {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`;
}
