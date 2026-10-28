// tui.tsx
import { effect as _$effect5 } from "@opentui/solid";
import { memo as _$memo4 } from "@opentui/solid";
import { insert as _$insert5 } from "@opentui/solid";
import { createTextNode as _$createTextNode3 } from "@opentui/solid";
import { insertNode as _$insertNode4 } from "@opentui/solid";
import { setProp as _$setProp5 } from "@opentui/solid";
import { createElement as _$createElement5 } from "@opentui/solid";
import { createComponent as _$createComponent4 } from "@opentui/solid";
import { execFile } from "node:child_process";
import { createMemo as createMemo2, createSignal as createSignal3, onCleanup as onCleanup2 } from "solid-js";

// lib/jira.ts
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// lib/fields.ts
var FIELD = {
  sprint: "customfield_10001",
  epicLink: "customfield_10002",
  epicStatus: "customfield_10003",
  epicName: "customfield_10004",
  storyPoints: "customfield_10006",
  rank: "customfield_10000",
  parent: "parent"
};
var DEPENDENCY_LINK_TYPES = /* @__PURE__ */ new Set([
  "Blocks",
  "Dependency",
  "Deployment Dependency",
  "Problem/Incident",
  "Release",
  "Work item split",
  "Parent-Child"
]);
var SEARCH_FIELDS = [
  "summary",
  "status",
  "assignee",
  "issuetype",
  "priority",
  "updated",
  "resolution",
  FIELD.parent,
  FIELD.epicLink,
  FIELD.storyPoints
];

// lib/adf.ts
function terminalText(text) {
  return text.replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "").replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "").replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, "");
}
function safeUrl(value) {
  if (typeof value !== "string" || /[\x00-\x20\x7f]/.test(value)) return;
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password)
      return;
    return url.href;
  } catch {
    return;
  }
}
var MAX_NODES = 2e4;
var MAX_TEXT = 2e5;
var MAX_DEPTH = 32;
var labelText = (value, fallback = "") => typeof value === "string" ? terminalText(value.slice(0, 4096)) : typeof value === "number" && Number.isFinite(value) ? String(value) : fallback;
function projectAdf(document) {
  if (typeof document === "string")
    return [
      {
        text: terminalText(document.slice(0, MAX_TEXT)) + (document.length > MAX_TEXT ? "\n[Document safety limit reached; open Jira for full content.]" : ""),
        kind: "prose"
      }
    ];
  const blocks = [];
  let nodes = 0, chars = 0, traversedText = 0, limited = false;
  const bounded = (value) => {
    const remaining = Math.max(0, MAX_TEXT - traversedText);
    if (value.length > remaining) limited = true;
    const result = terminalText(value.slice(0, remaining));
    traversedText += result.length;
    return result;
  };
  const add = (text2, kind = "prose", href) => {
    if (chars >= MAX_TEXT) {
      limited = true;
      return;
    }
    const clean = terminalText(text2.slice(0, MAX_TEXT));
    if (chars + clean.length > MAX_TEXT) limited = true;
    blocks.push({ text: clean.slice(0, MAX_TEXT - chars), kind, href });
    chars += clean.length;
  };
  const walk = (value, depth, prefix = "") => {
    if (++nodes > MAX_NODES || depth > MAX_DEPTH || chars >= MAX_TEXT || traversedText >= MAX_TEXT) {
      limited = true;
      return "";
    }
    if (!value || typeof value !== "object")
      return typeof value === "string" ? bounded(value) : "";
    const node = value;
    const attrs = node.attrs && typeof node.attrs === "object" && !Array.isArray(node.attrs) ? node.attrs : {};
    const children = Array.isArray(node.content) ? node.content : [];
    const each = (visit) => {
      for (let index = 0; index < children.length; index++) {
        if (nodes >= MAX_NODES || traversedText >= MAX_TEXT || chars >= MAX_TEXT) {
          limited = true;
          break;
        }
        visit(children[index], index);
      }
    };
    const inline = () => {
      let result = "";
      each((child) => {
        result += walk(child, depth + 1, prefix);
      });
      return result.slice(0, MAX_TEXT);
    };
    switch (node.type) {
      case "text": {
        let text2 = bounded(typeof node.text === "string" ? node.text : "");
        for (const value2 of Array.isArray(node.marks) ? node.marks : []) {
          if (++nodes > MAX_NODES || traversedText >= MAX_TEXT) {
            limited = true;
            break;
          }
          if (!value2 || typeof value2 !== "object") continue;
          const mark = value2;
          const attrs2 = mark.attrs && typeof mark.attrs === "object" ? mark.attrs : {};
          if (mark.type === "strong") text2 = `**${text2}**`;
          if (mark.type === "em") text2 = `_${text2}_`;
          if (mark.type === "code") text2 = `\`${text2}\``;
          if (mark.type === "link") {
            const href = typeof attrs2.href === "string" && attrs2.href.length <= 4096 ? safeUrl(attrs2.href) : void 0;
            if (href) add(`${text2} \u2192 ${href}`, "link", href);
            else text2 += " [inert link]";
          }
        }
        return text2;
      }
      case "hardBreak":
        return "\n";
      case "doc":
        inline();
        return "";
      case "paragraph":
      case "heading": {
        const label = node.type === "heading" ? `${"#".repeat(Math.max(1, Math.min(6, typeof attrs.level === "number" && Number.isFinite(attrs.level) ? attrs.level : 1)))} ` : "";
        add(prefix + label + inline());
        return "";
      }
      case "codeBlock":
        add(
          `[Code: ${labelText(attrs.language, "plain")}]
${inline()}`,
          "code"
        );
        return "";
      case "bulletList":
      case "orderedList":
        each(
          (child, index) => walk(
            child,
            depth + 1,
            prefix + (node.type === "orderedList" ? `${(typeof attrs.order === "number" && Number.isFinite(attrs.order) ? attrs.order : 1) + index}. ` : "\u2022 ")
          )
        );
        return "";
      case "listItem":
        inline();
        return "";
      case "blockquote":
        each((child) => {
          walk(child, depth + 1, prefix + "> ");
        });
        return "";
      case "table":
        add("[Table \u2014 cells stacked]");
        each((child, index) => {
          add(`Row ${index + 1}`);
          walk(child, depth + 1);
        });
        return "";
      case "tableRow":
        each((child, index) => {
          add(`  Cell ${index + 1}`);
          walk(child, depth + 1, "    ");
        });
        return "";
      case "tableHeader":
        add("[Header]");
        inline();
        return "";
      case "tableCell": {
        const text2 = inline();
        if (text2) add(prefix + text2);
        return "";
      }
      case "rule":
        add("\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500");
        return "";
      default: {
        add(
          `[Unsupported: ${labelText(node.type, "malformed")}] ${labelText(attrs.alt ?? attrs.name)}`
        );
        const text2 = inline();
        if (text2) add(text2);
        return "";
      }
    }
  };
  const text = walk(document, 0);
  if (text) add(text);
  if (limited)
    blocks.push({
      text: "[Document safety limit reached; bounded plain-text excerpt follows. Open Jira for the full document.]",
      kind: "prose"
    });
  if (limited)
    blocks.push({
      text: blocks.slice(0, 4).map((block) => block.text).join("\n").slice(0, 1024) || "[No safe text available]",
      kind: "prose"
    });
  if (!blocks.length) add("No description.");
  return blocks;
}
function commentAdf(text) {
  return {
    type: "doc",
    version: 1,
    content: text.replace(/\r\n?/g, "\n").split("\n").map((line) => ({
      type: "paragraph",
      content: line ? [{ type: "text", text: line }] : []
    }))
  };
}

// lib/jira.ts
var API = "/rest/api/3";
var AGILE = "/rest/agile/1.0";
var RETRIES = 3;
var MAX_PAGES = 12;
var PAGE_SIZE = 100;
var JiraError = class extends Error {
  status;
  constructor(status, message2) {
    super(message2);
    this.name = "JiraError";
    this.status = status;
  }
};
var cachedCredentials;
function resolveCredentials() {
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
      "Missing JIRA_EMAIL / JIRA_API_TOKEN. Export them, or add them to ~/.zshenv."
    );
  }
  cachedCredentials = { email, token };
  return cachedCredentials;
}
function readShellEnv() {
  const result = {};
  for (const file of [".zshenv", ".zprofile", ".zshrc", ".env"]) {
    try {
      const text = readFileSync(join(homedir(), file), "utf8");
      for (const name of ["JIRA_EMAIL", "JIRA_API_TOKEN"]) {
        if (result[name]) continue;
        const match = text.match(
          new RegExp(`(?:export\\s+)?${name}\\s*=\\s*"?([^"\\n]+)"?`)
        );
        if (match) result[name] = match[1].trim();
      }
    } catch {
    }
  }
  return result;
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
var JiraClient = class {
  site;
  auth;
  accountId;
  constructor(site) {
    const { email, token } = resolveCredentials();
    this.site = site.replace(/^https?:\/\//, "").replace(/\/+$/, "");
    this.auth = `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`;
  }
  url(path, query) {
    const target = new URL(`https://${this.site}${path}`);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== void 0) target.searchParams.set(key, String(value));
    }
    return target.toString();
  }
  async request(method, path, options = {}) {
    const url = this.url(path, options.query);
    let lastError;
    const retries = options.retry === false ? 0 : RETRIES;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url, {
          method,
          signal: options.signal,
          headers: {
            Authorization: this.auth,
            Accept: "application/json",
            ...options.body === void 0 ? {} : { "Content-Type": "application/json" }
          },
          body: options.body === void 0 ? void 0 : JSON.stringify(options.body)
        });
        if (response.status === 429 || response.status >= 500) {
          const retryAfter = Number(response.headers.get("retry-after"));
          const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1e3 : 1e3 * (attempt + 1);
          if (attempt < retries) {
            await sleep(wait);
            continue;
          }
          throw new JiraError(
            response.status,
            `Jira returned ${response.status} for ${path}`
          );
        }
        if (!response.ok) {
          throw new JiraError(
            response.status,
            `Jira ${response.status}; request rejected`
          );
        }
        if (response.status === 204) return void 0;
        const text = await response.text();
        return text ? JSON.parse(text) : void 0;
      } catch (error) {
        lastError = error;
        if (error instanceof JiraError) throw error;
        if (options.signal?.aborted) throw error;
        if (attempt < retries) {
          await sleep(1e3 * (attempt + 1));
          continue;
        }
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }
  /** The current user's accountId, resolved once per client. */
  async me(signal) {
    if (this.accountId) return this.accountId;
    const data = await this.request(
      "GET",
      `${API}/myself`,
      { signal }
    );
    this.accountId = data.accountId;
    return data.accountId;
  }
  /** Non-idempotent: exactly one attempt, including 429/5xx/transport errors. */
  async addComment(key, text) {
    if (!/^[A-Z][A-Z0-9_]*-\d+$/.test(key))
      throw new Error("Invalid issue key");
    if (!text.trim() || text.length > 32e3 || terminalText(text) !== text)
      throw new Error("Comment must contain 1\u201332000 safe characters");
    return this.request(
      "POST",
      `${API}/issue/${encodeURIComponent(key)}/comment`,
      {
        body: { body: commentAdf(text) },
        retry: false,
        signal: AbortSignal.timeout(3e4)
      }
    );
  }
  async myself(signal) {
    return this.request("GET", `${API}/myself`, { signal });
  }
  /** Boards visible to the user, optionally scoped to a project. */
  async boards(projectKey, signal) {
    const data = await this.request("GET", `${AGILE}/board`, {
      query: { projectKeyOrId: projectKey, maxResults: 50 },
      signal
    });
    return data.values ?? [];
  }
  async boardConfig(boardId, signal) {
    const [config, board] = await Promise.all([
      this.request("GET", `${AGILE}/board/${boardId}/configuration`, { signal }),
      this.request(
        "GET",
        `${AGILE}/board/${boardId}`,
        { signal }
      )
    ]);
    const columns = (config.columnConfig?.columns ?? []).map(
      (column) => ({
        name: column.name,
        statusIds: (column.statuses ?? []).map((status) => status.id)
      })
    );
    let filterJql = "";
    const filterId = config.filter?.id;
    if (filterId) {
      try {
        const filter = await this.request(
          "GET",
          `${API}/filter/${filterId}`,
          { signal }
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
      filterJql
    };
  }
  async sprints(boardId, state, signal) {
    const data = await this.request(
      "GET",
      `${AGILE}/board/${boardId}/sprint`,
      {
        query: { state, maxResults: 50 },
        signal
      }
    );
    return data.values ?? [];
  }
  async activeSprint(boardId, signal) {
    const active = await this.sprints(boardId, "active", signal);
    return active[0];
  }
  async sprintIssues(boardId, sprintId, signal) {
    const raw = await this.paginateAgile(
      `${AGILE}/board/${boardId}/sprint/${sprintId}/issue`,
      signal
    );
    return raw.map((item) => toIssue(item, this.site));
  }
  async backlog(boardId, signal) {
    const raw = await this.paginateAgile(
      `${AGILE}/board/${boardId}/backlog`,
      signal
    );
    return {
      issues: raw.map((item) => toIssue(item, this.site)),
      truncated: false
    };
  }
  /** JQL search, following nextPageToken until the result set is exhausted or capped. */
  async search(jql, options = {}) {
    const cap = options.cap ?? PAGE_SIZE * MAX_PAGES;
    const issues = [];
    let token;
    for (let page = 0; page < MAX_PAGES; page++) {
      const data = await this.request("POST", `${API}/search/jql`, {
        body: {
          jql,
          maxResults: Math.min(PAGE_SIZE, cap - issues.length),
          fields: options.fields ?? SEARCH_FIELDS,
          ...token ? { nextPageToken: token } : {}
        },
        signal: options.signal
      });
      const batch = data.issues ?? [];
      for (const item of batch) issues.push(toIssue(item, this.site));
      if (data.isLast !== false && !data.nextPageToken) break;
      token = data.nextPageToken;
      if (!token || issues.length >= cap) break;
    }
    return { issues, truncated: issues.length >= cap };
  }
  async issue(key, signal) {
    return this.request("GET", `${API}/issue/${key}`, {
      query: {
        fields: [
          ...SEARCH_FIELDS,
          "description",
          "issuelinks",
          "subtasks",
          "parent",
          "labels",
          "created"
        ].join(",")
      },
      signal
    });
  }
  async transitions(key, signal) {
    const data = await this.request("GET", `${API}/issue/${key}/transitions`, { signal });
    return data.transitions ?? [];
  }
  async transition(key, transitionId, signal) {
    await this.request("POST", `${API}/issue/${key}/transitions`, {
      body: { transition: { id: transitionId } },
      signal
    });
  }
  async assign(key, accountId, signal) {
    await this.request("PUT", `${API}/issue/${key}/assignee`, {
      body: { accountId },
      signal
    });
  }
  async addToSprint(sprintId, keys, signal) {
    await this.request("POST", `${AGILE}/sprint/${sprintId}/issue`, {
      body: { issues: [...keys] },
      signal
    });
  }
  async edit(key, fields, signal) {
    await this.request("PUT", `${API}/issue/${key}`, {
      body: { fields },
      signal
    });
  }
  async paginateAgile(path, signal) {
    const results = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      const startAt = page * PAGE_SIZE;
      const data = await this.request("GET", path, {
        query: { startAt, maxResults: PAGE_SIZE },
        signal
      });
      const batch = data.issues ?? [];
      results.push(...batch);
      const total = data.total ?? results.length;
      if (batch.length === 0 || results.length >= total || data.isLast === true)
        break;
    }
    return results;
  }
};
function toIssue(raw, site) {
  const fields = raw.fields ?? {};
  const epicLink = firstString(fields[FIELD.epicLink]);
  const parent = fields[FIELD.parent];
  const parentKey = parent?.key ?? null;
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
    points: typeof fields[FIELD.storyPoints] === "number" ? fields[FIELD.storyPoints] : null,
    priority: fields.priority?.name ?? null,
    updated: fields.updated ?? "",
    url: `https://${site}/browse/${raw.key}`
  };
}
function firstString(value) {
  if (typeof value === "string" && value.length > 0) return value;
  if (value && typeof value === "object" && "key" in value) {
    const key = value.key;
    return typeof key === "string" ? key : null;
  }
  return null;
}
function truncate(text, max) {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}\u2026`;
}

// lib/model.ts
var UNRESOLVED = "resolution = Unresolved";
function quote(value) {
  return `"${value.replace(/["\\]/g, "\\$&")}"`;
}
function stripOrder(jql) {
  if (!jql) return "";
  return jql.replace(/\s+ORDER\s+BY\s+[\s\S]*$/i, "").trim();
}
function buildJql(input) {
  const scope = stripOrder(input.boardJql) || `project = ${quote(input.projectKey)}`;
  const clauses = [];
  switch (input.view) {
    case "mine":
      clauses.push(scope, UNRESOLVED);
      break;
    case "sprint":
      clauses.push(
        input.sprintId ? `sprint = ${input.sprintId}` : scope,
        UNRESOLVED
      );
      break;
    case "backlog":
      clauses.push(scope, "sprint is EMPTY", UNRESOLVED);
      break;
    case "epics":
      clauses.push(`project = ${quote(input.projectKey)}`, "issuetype = Epic");
      break;
    case "issue":
      clauses.push(
        input.epicKey ? `parent = ${input.epicKey}` : scope,
        UNRESOLVED
      );
      break;
  }
  if (input.view !== "epics" && input.view !== "issue") {
    clauses.push(assigneeClause(input.assignee));
  }
  if (input.filter.text.trim())
    clauses.push(`text ~ ${quote(input.filter.text.trim())}`);
  if (input.filter.type)
    clauses.push(`issuetype = ${quote(input.filter.type)}`);
  const order = input.view === "mine" ? "ORDER BY updated DESC" : "ORDER BY Rank ASC";
  return `${clauses.filter(Boolean).join(" AND ")} ${order}`;
}
function assigneeClause(filter) {
  switch (filter) {
    case "mine":
      return "assignee = currentUser()";
    case "others":
      return "assignee != currentUser() AND assignee is not EMPTY";
    case "unassigned":
      return "assignee is EMPTY";
    default:
      return "";
  }
}
function applyAssigneeFilter(issues, filter, me) {
  if (filter === "all") return [...issues];
  return issues.filter((issue) => {
    if (filter === "unassigned") return !issue.assigneeId;
    if (filter === "mine") return !!me && issue.assigneeId === me;
    return !!issue.assigneeId && issue.assigneeId !== me;
  });
}
function applyTextFilter(issues, filter) {
  const text = filter.text.trim().toLowerCase();
  return issues.filter((issue) => {
    if (filter.type && issue.type !== filter.type) return false;
    if (!text) return true;
    return issue.key.toLowerCase().includes(text) || issue.summary.toLowerCase().includes(text) || (issue.assignee ?? "").toLowerCase().includes(text) || issue.status.toLowerCase().includes(text);
  });
}
function groupByColumn(issues, columns) {
  const byStatus = /* @__PURE__ */ new Map();
  for (const column of columns)
    for (const statusId of column.statusIds)
      byStatus.set(statusId, column.name);
  const order = [];
  for (const column of columns)
    if (!order.includes(column.name)) order.push(column.name);
  const buckets = /* @__PURE__ */ new Map();
  for (const issue of issues) {
    const column = byStatus.get(issue.statusId) ?? "Unmapped";
    const bucket = buckets.get(column);
    if (bucket) bucket.push(issue);
    else buckets.set(column, [issue]);
  }
  const names = [
    ...order,
    ...[...buckets.keys()].filter((name) => !order.includes(name))
  ];
  return names.map((name) => ({
    column: name,
    issues: buckets.get(name) ?? []
  }));
}
function groupByEpic(issues, epicTitles) {
  const groups = /* @__PURE__ */ new Map();
  for (const issue of issues) {
    const key = issue.epicKey ?? "";
    const bucket = groups.get(key);
    if (bucket) bucket.push(issue);
    else groups.set(key, [issue]);
  }
  const named = [];
  const orphans = groups.get("") ?? [];
  for (const [key, bucket] of groups) {
    if (!key) continue;
    named.push({
      epicKey: key,
      epicSummary: epicTitles.get(key) ?? key,
      issues: bucket
    });
  }
  named.sort((a, b) => a.epicSummary.localeCompare(b.epicSummary));
  if (orphans.length)
    named.push({ epicKey: null, epicSummary: "No epic", issues: orphans });
  return named;
}
function toIssueDetail(raw, site) {
  const base = toIssue(raw, site);
  const fields = raw.fields ?? {};
  const links = [];
  for (const link of fields.issuelinks ?? []) {
    if (link.outwardIssue) {
      links.push({
        type: link.type?.name ?? "Link",
        direction: "outward",
        label: link.type?.outward ?? link.type?.name ?? "links to",
        key: link.outwardIssue.key,
        summary: link.outwardIssue.fields?.summary ?? "",
        status: link.outwardIssue.fields?.status?.name ?? "",
        blocking: link.type?.name === "Blocks"
      });
    }
    if (link.inwardIssue) {
      links.push({
        type: link.type?.name ?? "Link",
        direction: "inward",
        label: link.type?.inward ?? link.type?.name ?? "linked from",
        key: link.inwardIssue.key,
        summary: link.inwardIssue.fields?.summary ?? "",
        status: link.inwardIssue.fields?.status?.name ?? "",
        blocking: link.type?.name === "Blocks"
      });
    }
  }
  return {
    ...base,
    description: flattenDescription(fields.description),
    descriptionAdf: fields.description,
    links,
    subtasks: (fields.subtasks ?? []).map(
      (sub) => toIssue(sub, site)
    ),
    parent: fields.parent ? toIssue(
      { key: fields.parent.key, fields: fields.parent.fields ?? {} },
      site
    ) : null,
    epic: null
  };
}
function flattenDescription(node) {
  if (!node) return null;
  if (typeof node === "string") return truncate(node, 4e3);
  const parts = [];
  let remaining = 4e3, budget = 2e4;
  const walk = (current, depth = 0) => {
    if (budget-- <= 0 || depth > 32 || remaining <= 0) return;
    if (!current || typeof current !== "object") return;
    if (current.type === "text" && typeof current.text === "string") {
      const text2 = current.text.slice(0, remaining);
      parts.push(text2);
      remaining -= text2.length;
    }
    if (current.type === "hardBreak") parts.push("\n");
    if (Array.isArray(current.content))
      for (const child of current.content) {
        if (budget <= 0 || remaining <= 0) break;
        walk(child, depth + 1);
      }
    if (current.type === "paragraph" || current.type === "heading")
      parts.push("\n");
  };
  walk(node);
  const text = parts.join("").replace(/\n{3,}/g, "\n\n").trim();
  return text ? truncate(text, 4e3) : null;
}
function epicProgress(children) {
  const done = children.filter(
    (child) => child.statusCategory === "Done"
  ).length;
  return { childCount: children.length, doneCount: done };
}
function sprintDaysLeft(sprint) {
  if (!sprint.endDate) return "";
  const days = Math.ceil(
    (Date.parse(sprint.endDate) - Date.now()) / 864e5
  );
  if (Number.isNaN(days)) return "";
  if (days < 0) return `${Math.abs(days)}d over`;
  if (days === 0) return "ends today";
  return `${days}d left`;
}

// lib/navigation.ts
function pushScreen(stack, screen) {
  return [...stack, screen];
}
function popScreen(stack) {
  return [stack.slice(0, -1), stack.at(-1)];
}
function columnWindow(available, columns, selected) {
  const width = Math.max(1, available);
  const count = Math.max(
    1,
    Math.min(columns, Math.floor((width + 1) / 29) || 1)
  );
  const start = Math.max(0, Math.min(selected, columns - count));
  return {
    start,
    count,
    width: Math.max(1, Math.floor((width - count + 1) / count))
  };
}
var ROOT_VIEWS = ["mine", "sprint", "backlog", "epics"];

// ui/workspace.tsx
import { effect as _$effect3 } from "@opentui/solid";
import { insert as _$insert3 } from "@opentui/solid";
import { createComponent as _$createComponent2 } from "@opentui/solid";
import { memo as _$memo2 } from "@opentui/solid";
import { setProp as _$setProp3 } from "@opentui/solid";
import { createElement as _$createElement3 } from "@opentui/solid";
import { Show as Show2 } from "solid-js";

// ui/content.tsx
import { createTextNode as _$createTextNode } from "@opentui/solid";
import { insertNode as _$insertNode } from "@opentui/solid";
import { use as _$use } from "@opentui/solid";
import { createComponent as _$createComponent } from "@opentui/solid";
import { effect as _$effect } from "@opentui/solid";
import { insert as _$insert } from "@opentui/solid";
import { memo as _$memo } from "@opentui/solid";
import { setProp as _$setProp } from "@opentui/solid";
import { createElement as _$createElement } from "@opentui/solid";
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";

// ui/types.ts
function color(context, tone) {
  const text = context.theme?.text ?? {};
  if (tone === "accent")
    return text.action?.primary?.base ?? text.accent ?? text.base;
  if (tone === "warning" || tone === "error" || tone === "success")
    return text.feedback?.[tone]?.base ?? text[tone] ?? text.base;
  return text[tone] ?? (tone === "muted" ? text.subtle : void 0) ?? text.base;
}
function statusTone(issue) {
  if (issue.status.toLowerCase().includes("block")) return "error";
  if (issue.statusCategory === "Done") return "success";
  if (issue.statusCategory === "In Progress") return "warning";
  return "base";
}
function categoryLabel(category) {
  return category === "Done" ? "Done" : category === "In Progress" ? "In progress" : category === "To Do" ? "To do" : category || "Unknown category";
}
function leftClick(action) {
  return (event) => {
    if (event.button !== 0 || event.isDragging) return;
    event.stopPropagation();
    action();
  };
}

// ui/content.tsx
function WorkspaceContent(props) {
  const groups = createMemo(() => {
    const result = [];
    props.rows.forEach((row, index) => {
      if (row.kind === "group") result.push({
        label: row.label,
        items: []
      });
      if (row.kind === "issue") result.at(-1)?.items.push({
        row,
        index
      });
    });
    return result;
  });
  const window = createMemo(() => columnWindow(props.width, groups().length, props.column));
  const visible = createMemo(() => groups().slice(window().start, window().start + window().count));
  const [height, setHeight] = createSignal(props.context.renderer?.height ?? 24);
  const focused = createMemo(() => props.rows[props.selected]);
  return _$createComponent(Show, {
    get when() {
      return props.board;
    },
    get fallback() {
      return (() => {
        var _el$8 = _$createElement("scrollbox");
        _$use((ref) => props.register("list", ref), _el$8);
        _$setProp(_el$8, "flexGrow", 1);
        _$setProp(_el$8, "scrollY", true);
        _$setProp(_el$8, "scrollX", false);
        _$insert(_el$8, _$createComponent(For, {
          get each() {
            return props.rows;
          },
          children: (row, index) => row.kind === "group" ? (() => {
            var _el$9 = _$createElement("text");
            _$setProp(_el$9, "selectable", false);
            _$insert(_el$9, () => `${index() === props.selected && row.key ? "\u25B8 " : "\u2500\u2500 "}${terminalText(row.label)} (${row.count})${row.key ? " \xB7 Details" : ""}`);
            _$effect((_p$) => {
              var _v$ = `row-${index()}`, _v$2 = color(props.context, "accent"), _v$3 = leftClick(() => {
                if (props.enabled() && row.key) props.openKey(row.key);
              });
              _v$ !== _p$.e && (_p$.e = _$setProp(_el$9, "id", _v$, _p$.e));
              _v$2 !== _p$.t && (_p$.t = _$setProp(_el$9, "fg", _v$2, _p$.t));
              _v$3 !== _p$.a && (_p$.a = _$setProp(_el$9, "onMouseUp", _v$3, _p$.a));
              return _p$;
            }, {
              e: void 0,
              t: void 0,
              a: void 0
            });
            return _el$9;
          })() : row.kind === "text" ? (() => {
            var _el$0 = _$createElement("text");
            _$insert(_el$0, () => terminalText(row.text));
            _$effect((_$p) => _$setProp(_el$0, "fg", color(props.context, row.tone ?? "muted"), _$p));
            return _el$0;
          })() : row.kind === "link" ? (() => {
            var _el$1 = _$createElement("text");
            _$insert(_el$1, () => row.label);
            _$effect((_$p) => _$setProp(_el$1, "fg", color(props.context, "base"), _$p));
            return _el$1;
          })() : (() => {
            var _el$10 = _$createElement("text");
            _$setProp(_el$10, "selectable", false);
            _$insert(_el$10, () => `${index() === props.selected ? "\u25B8 " : "  "}${terminalText(row.issue.key)} \xB7 ${terminalText(row.issue.summary)} \xB7 ${terminalText(row.issue.status)}${row.note ? ` \xB7 ${terminalText(row.note)}` : ""}`);
            _$effect((_p$) => {
              var _v$4 = `row-${index()}`, _v$5 = color(props.context, index() === props.selected ? "accent" : "base"), _v$6 = leftClick(() => {
                if (props.enabled()) props.open(index());
              });
              _v$4 !== _p$.e && (_p$.e = _$setProp(_el$10, "id", _v$4, _p$.e));
              _v$5 !== _p$.t && (_p$.t = _$setProp(_el$10, "fg", _v$5, _p$.t));
              _v$6 !== _p$.a && (_p$.a = _$setProp(_el$10, "onMouseUp", _v$6, _p$.a));
              return _p$;
            }, {
              e: void 0,
              t: void 0,
              a: void 0
            });
            return _el$10;
          })()
        }));
        return _el$8;
      })();
    },
    get children() {
      var _el$ = _$createElement("box");
      _$setProp(_el$, "flexGrow", 1);
      _$setProp(_el$, "minHeight", 0);
      _$setProp(_el$, "flexDirection", "column");
      _$setProp(_el$, "onSizeChange", function() {
        setHeight(this.height);
      });
      _$insert(_el$, _$createComponent(Show, {
        get when() {
          return height() <= 6;
        },
        get fallback() {
          return [(() => {
            var _el$11 = _$createElement("text");
            _$insert(_el$11, () => `${window().start > 0 ? "\u2039 more \xB7 " : ""}Columns ${window().start + 1}\u2013${Math.min(groups().length, window().start + window().count)} / ${groups().length}${window().start + window().count < groups().length ? " \xB7 more \u203A" : ""}`);
            _$effect((_$p) => _$setProp(_el$11, "fg", color(props.context, "muted"), _$p));
            return _el$11;
          })(), (() => {
            var _el$12 = _$createElement("box");
            _$setProp(_el$12, "flexDirection", "row");
            _$setProp(_el$12, "flexGrow", 1);
            _$setProp(_el$12, "gap", 1);
            _$insert(_el$12, _$createComponent(For, {
              get each() {
                return visible();
              },
              children: (group, ordinal) => {
                const absolute = () => window().start + ordinal();
                let scroll;
                createEffect(() => {
                  const selected = props.selected;
                  if (absolute() === props.column) scroll?.scrollChildIntoView?.(`card-${selected}`);
                });
                return (() => {
                  var _el$13 = _$createElement("box"), _el$14 = _$createElement("text"), _el$15 = _$createElement("text"), _el$16 = _$createElement("scrollbox");
                  _$insertNode(_el$13, _el$14);
                  _$insertNode(_el$13, _el$15);
                  _$insertNode(_el$13, _el$16);
                  _$setProp(_el$13, "border", true);
                  _$setProp(_el$13, "flexDirection", "column");
                  _$setProp(_el$13, "flexShrink", 0);
                  _$setProp(_el$14, "selectable", false);
                  _$setProp(_el$14, "height", 1);
                  _$setProp(_el$14, "flexShrink", 0);
                  _$setProp(_el$14, "wrapMode", "none");
                  _$insert(_el$14, () => `${absolute() === props.column ? "\u25B8 " : ""}${terminalText(group.label)} (${group.items.length})`);
                  _$setProp(_el$15, "flexShrink", 0);
                  _$insert(_el$15, () => [...new Set(group.items.map((item) => categoryLabel(item.row.issue.statusCategory)))].join(" / ") || "No tickets");
                  _$use((ref) => {
                    scroll = ref;
                    props.register(`column-${absolute()}`, ref);
                  }, _el$16);
                  _$setProp(_el$16, "flexGrow", 1);
                  _$setProp(_el$16, "scrollY", true);
                  _$setProp(_el$16, "scrollX", false);
                  _$insert(_el$16, _$createComponent(Show, {
                    get when() {
                      return group.items.length;
                    },
                    get fallback() {
                      return (() => {
                        var _el$17 = _$createElement("text");
                        _$insertNode(_el$17, _$createTextNode(`No tickets`));
                        _$effect((_$p) => _$setProp(_el$17, "fg", color(props.context, "base"), _$p));
                        return _el$17;
                      })();
                    },
                    get children() {
                      return _$createComponent(For, {
                        get each() {
                          return group.items;
                        },
                        children: ({
                          row,
                          index
                        }) => (() => {
                          var _el$19 = _$createElement("box"), _el$20 = _$createElement("text"), _el$21 = _$createElement("text"), _el$22 = _$createElement("text");
                          _$insertNode(_el$19, _el$20);
                          _$insertNode(_el$19, _el$21);
                          _$insertNode(_el$19, _el$22);
                          _$setProp(_el$19, "id", `card-${index}`);
                          _$setProp(_el$19, "border", true);
                          _$setProp(_el$19, "flexDirection", "column");
                          _$setProp(_el$19, "flexShrink", 0);
                          _$setProp(_el$20, "selectable", false);
                          _$insert(_el$20, () => `${index === props.selected ? "\u25B8 " : ""}${terminalText(row.issue.key)} \xB7 ${terminalText(row.issue.type)}`);
                          _$setProp(_el$21, "height", 2);
                          _$setProp(_el$21, "wrapMode", "word");
                          _$insert(_el$21, () => terminalText(row.issue.summary));
                          _$insert(_el$22, () => `${terminalText(row.issue.status)} \xB7 ${categoryLabel(row.issue.statusCategory)} \xB7 ${terminalText(row.issue.assignee ?? "Unassigned")}${row.issue.points === null ? "" : ` \xB7 ${row.issue.points}sp`}`);
                          _$effect((_p$) => {
                            var _v$10 = index === props.selected ? "double" : "single", _v$11 = color(props.context, statusTone(row.issue)), _v$12 = leftClick(() => {
                              if (props.enabled()) props.open(index);
                            }), _v$13 = color(props.context, "base"), _v$14 = color(props.context, "base"), _v$15 = color(props.context, "base");
                            _v$10 !== _p$.e && (_p$.e = _$setProp(_el$19, "borderStyle", _v$10, _p$.e));
                            _v$11 !== _p$.t && (_p$.t = _$setProp(_el$19, "borderColor", _v$11, _p$.t));
                            _v$12 !== _p$.a && (_p$.a = _$setProp(_el$19, "onMouseUp", _v$12, _p$.a));
                            _v$13 !== _p$.o && (_p$.o = _$setProp(_el$20, "fg", _v$13, _p$.o));
                            _v$14 !== _p$.i && (_p$.i = _$setProp(_el$21, "fg", _v$14, _p$.i));
                            _v$15 !== _p$.n && (_p$.n = _$setProp(_el$22, "fg", _v$15, _p$.n));
                            return _p$;
                          }, {
                            e: void 0,
                            t: void 0,
                            a: void 0,
                            o: void 0,
                            i: void 0,
                            n: void 0
                          });
                          return _el$19;
                        })()
                      });
                    }
                  }));
                  _$effect((_p$) => {
                    var _v$7 = absolute() === props.column ? "double" : "single", _v$8 = color(props.context, absolute() === props.column ? "accent" : "muted"), _v$9 = window().width, _v$0 = color(props.context, "base"), _v$1 = color(props.context, "base");
                    _v$7 !== _p$.e && (_p$.e = _$setProp(_el$13, "borderStyle", _v$7, _p$.e));
                    _v$8 !== _p$.t && (_p$.t = _$setProp(_el$13, "borderColor", _v$8, _p$.t));
                    _v$9 !== _p$.a && (_p$.a = _$setProp(_el$13, "width", _v$9, _p$.a));
                    _v$0 !== _p$.o && (_p$.o = _$setProp(_el$14, "fg", _v$0, _p$.o));
                    _v$1 !== _p$.i && (_p$.i = _$setProp(_el$15, "fg", _v$1, _p$.i));
                    return _p$;
                  }, {
                    e: void 0,
                    t: void 0,
                    a: void 0,
                    o: void 0,
                    i: void 0
                  });
                  return _el$13;
                })();
              }
            }));
            return _el$12;
          })(), _$createComponent(For, {
            get each() {
              return props.rows.filter((row) => row.kind === "text");
            },
            children: (row) => (() => {
              var _el$23 = _$createElement("text");
              _$insert(_el$23, () => terminalText(row.text));
              _$effect((_$p) => _$setProp(_el$23, "fg", color(props.context, "base"), _$p));
              return _el$23;
            })()
          })];
        },
        get children() {
          return [(() => {
            var _el$2 = _$createElement("text");
            _$setProp(_el$2, "height", 1);
            _$setProp(_el$2, "flexShrink", 0);
            _$setProp(_el$2, "wrapMode", "none");
            _$insert(_el$2, (() => {
              var _c$ = _$memo(() => focused()?.kind === "issue");
              return () => _c$() ? `\u25B8 ${terminalText(focused().issue.key)}` : `${terminalText(groups()[props.column]?.label ?? "Board")} \xB7 No tickets`;
            })());
            _$effect((_$p) => _$setProp(_el$2, "fg", color(props.context, "base"), _$p));
            return _el$2;
          })(), _$createComponent(Show, {
            get when() {
              return focused()?.kind === "issue";
            },
            get children() {
              var _el$3 = _$createElement("text");
              _$setProp(_el$3, "height", 1);
              _$setProp(_el$3, "flexShrink", 0);
              _$setProp(_el$3, "wrapMode", "none");
              _$insert(_el$3, () => terminalText(focused().issue.summary));
              _$effect((_$p) => _$setProp(_el$3, "fg", color(props.context, "base"), _$p));
              return _el$3;
            }
          }), (() => {
            var _el$4 = _$createElement("scrollbox"), _el$5 = _$createElement("text");
            _$insertNode(_el$4, _el$5);
            _$use((ref) => props.register(`column-${props.column}`, ref), _el$4);
            _$setProp(_el$4, "id", "compact-board");
            _$setProp(_el$4, "flexGrow", 1);
            _$setProp(_el$4, "flexBasis", 0);
            _$setProp(_el$4, "minHeight", 0);
            _$setProp(_el$4, "scrollY", true);
            _$setProp(_el$4, "scrollX", true);
            _$setProp(_el$4, "overflow", "hidden");
            _$setProp(_el$4, "viewportOptions", {
              overflow: "hidden"
            });
            _$setProp(_el$5, "flexShrink", 0);
            _$insert(_el$5, () => terminalText(groups()[props.column]?.label ?? "Board"));
            _$insert(_el$4, _$createComponent(Show, {
              get when() {
                return focused()?.kind === "issue";
              },
              get children() {
                return [(() => {
                  var _el$6 = _$createElement("text");
                  _$setProp(_el$6, "flexShrink", 0);
                  _$insert(_el$6, () => `${focused().issue.type} \xB7 ${focused().issue.status} \xB7 ${categoryLabel(focused().issue.statusCategory)}`);
                  _$effect((_$p) => _$setProp(_el$6, "fg", color(props.context, "base"), _$p));
                  return _el$6;
                })(), (() => {
                  var _el$7 = _$createElement("text");
                  _$setProp(_el$7, "flexShrink", 0);
                  _$insert(_el$7, () => `${focused().issue.assignee ?? "Unassigned"} \xB7 ${focused().issue.points ?? "\u2013"}sp`);
                  _$effect((_$p) => _$setProp(_el$7, "fg", color(props.context, "base"), _$p));
                  return _el$7;
                })()];
              }
            }), null);
            _$effect((_$p) => _$setProp(_el$5, "fg", color(props.context, "base"), _$p));
            return _el$4;
          })()];
        }
      }));
      return _el$;
    }
  });
}
function TicketWindow(props) {
  let body;
  const [size, setSize] = createSignal({
    width: props.context.renderer?.width ?? 80,
    height: props.context.renderer?.height ?? 24
  });
  const width = () => size().width;
  const height = () => size().height;
  const inset = () => width() >= 60 && height() >= 18 ? 2 : 0;
  const compact = () => height() < 18 || width() < 60;
  createEffect(() => {
    if (props.focus === "relationships") body?.scrollChildIntoView?.(`relationship-${props.selected}`);
  });
  return (() => {
    var _el$24 = _$createElement("box"), _el$25 = _$createElement("box"), _el$26 = _$createElement("text"), _el$30 = _$createElement("scrollbox"), _el$31 = _$createElement("text"), _el$32 = _$createElement("text"), _el$33 = _$createElement("text"), _el$35 = _$createElement("text");
    _$insertNode(_el$24, _el$25);
    _$setProp(_el$24, "position", "absolute");
    _$setProp(_el$24, "left", 0);
    _$setProp(_el$24, "top", 0);
    _$setProp(_el$24, "width", "100%");
    _$setProp(_el$24, "height", "100%");
    _$setProp(_el$24, "alignItems", "center");
    _$setProp(_el$24, "onSizeChange", function() {
      setSize({
        width: this.width,
        height: this.height
      });
    });
    _$setProp(_el$24, "onMouseUp", (event) => event.stopPropagation());
    _$insertNode(_el$25, _el$26);
    _$insertNode(_el$25, _el$30);
    _$insertNode(_el$25, _el$35);
    _$setProp(_el$25, "width", "100%");
    _$setProp(_el$25, "maxWidth", 112);
    _$setProp(_el$25, "height", "100%");
    _$setProp(_el$25, "border", true);
    _$setProp(_el$25, "borderStyle", "double");
    _$setProp(_el$25, "flexDirection", "column");
    _$setProp(_el$25, "onMouseUp", (event) => event.stopPropagation());
    _$setProp(_el$26, "height", 1);
    _$setProp(_el$26, "flexShrink", 0);
    _$setProp(_el$26, "selectable", false);
    _$insert(_el$26, () => `${terminalText(props.ticket.issue.key)} \xB7 ${props.focus === "back" ? "\u25B8 " : ""}Back`);
    _$insert(_el$25, _$createComponent(Show, {
      get when() {
        return _$memo(() => !!compact())() && height() >= 8;
      },
      get children() {
        var _el$27 = _$createElement("text");
        _$setProp(_el$27, "height", 1);
        _$setProp(_el$27, "flexShrink", 0);
        _$setProp(_el$27, "wrapMode", "none");
        _$insert(_el$27, () => `${terminalText(props.ticket.issue.type)} \xB7 ${terminalText(props.ticket.issue.status)}`);
        _$effect((_$p) => _$setProp(_el$27, "fg", color(props.context, "base"), _$p));
        return _el$27;
      }
    }), _el$30);
    _$insert(_el$25, _$createComponent(Show, {
      get when() {
        return !compact();
      },
      get children() {
        return [(() => {
          var _el$28 = _$createElement("text");
          _$setProp(_el$28, "height", 2);
          _$setProp(_el$28, "flexShrink", 0);
          _$setProp(_el$28, "wrapMode", "word");
          _$insert(_el$28, () => terminalText(props.ticket.issue.summary));
          _$effect((_$p) => _$setProp(_el$28, "fg", color(props.context, "base"), _$p));
          return _el$28;
        })(), (() => {
          var _el$29 = _$createElement("text");
          _$setProp(_el$29, "height", 1);
          _$setProp(_el$29, "flexShrink", 0);
          _$insert(_el$29, () => `${terminalText(props.ticket.issue.type)} \xB7 ${terminalText(props.ticket.issue.status)} \xB7 ${terminalText(props.ticket.issue.assignee ?? "Unassigned")} \xB7 ${props.ticket.issue.points ?? "\u2013"}sp \xB7 ${terminalText(props.ticket.issue.priority ?? "\u2013")}`);
          _$effect((_$p) => _$setProp(_el$29, "fg", color(props.context, "base"), _$p));
          return _el$29;
        })()];
      }
    }), _el$30);
    _$insertNode(_el$30, _el$31);
    _$insertNode(_el$30, _el$32);
    _$insertNode(_el$30, _el$33);
    _$use((ref) => {
      body = ref;
      props.register("body", ref);
    }, _el$30);
    _$setProp(_el$30, "flexGrow", 1);
    _$setProp(_el$30, "flexBasis", 0);
    _$setProp(_el$30, "minHeight", 0);
    _$setProp(_el$30, "overflow", "hidden");
    _$setProp(_el$30, "viewportOptions", {
      overflow: "hidden"
    });
    _$setProp(_el$30, "scrollY", true);
    _$setProp(_el$30, "scrollX", true);
    _$setProp(_el$31, "flexShrink", 0);
    _$insert(_el$31, () => terminalText(props.ticket.issue.summary));
    _$setProp(_el$32, "flexShrink", 0);
    _$insert(_el$32, () => `${terminalText(props.ticket.issue.type)} \xB7 ${terminalText(props.ticket.issue.status)} \xB7 ${terminalText(props.ticket.issue.assignee ?? "Unassigned")} \xB7 ${props.ticket.issue.points ?? "\u2013"}sp \xB7 ${terminalText(props.ticket.issue.priority ?? "\u2013")}`);
    _$insertNode(_el$33, _$createTextNode(`Description`));
    _$insert(_el$30, _$createComponent(For, {
      get each() {
        return props.ticket.blocks;
      },
      children: (block) => (() => {
        var _el$36 = _$createElement("text");
        _$insert(_el$36, () => block.text);
        _$effect((_p$) => {
          var _v$29 = block.kind === "code" ? "none" : "word", _v$30 = block.kind !== "link", _v$31 = color(props.context, block.kind === "link" ? "accent" : "base"), _v$32 = block.href ? leftClick(() => {
            if (props.enabled()) props.link(block.href);
          }) : void 0;
          _v$29 !== _p$.e && (_p$.e = _$setProp(_el$36, "wrapMode", _v$29, _p$.e));
          _v$30 !== _p$.t && (_p$.t = _$setProp(_el$36, "selectable", _v$30, _p$.t));
          _v$31 !== _p$.a && (_p$.a = _$setProp(_el$36, "fg", _v$31, _p$.a));
          _v$32 !== _p$.o && (_p$.o = _$setProp(_el$36, "onMouseUp", _v$32, _p$.o));
          return _p$;
        }, {
          e: void 0,
          t: void 0,
          a: void 0,
          o: void 0
        });
        return _el$36;
      })()
    }), null);
    _$insert(_el$30, _$createComponent(For, {
      get each() {
        return props.ticket.relationships;
      },
      children: (row, index) => row.kind === "group" ? (() => {
        var _el$37 = _$createElement("text");
        _$insert(_el$37, () => row.label);
        _$effect((_$p) => _$setProp(_el$37, "fg", color(props.context, "accent"), _$p));
        return _el$37;
      })() : row.kind === "text" ? (() => {
        var _el$38 = _$createElement("text");
        _$insert(_el$38, () => terminalText(row.text));
        _$effect((_$p) => _$setProp(_el$38, "fg", color(props.context, row.tone ?? "base"), _$p));
        return _el$38;
      })() : row.kind === "link" ? (() => {
        var _el$39 = _$createElement("text");
        _$setProp(_el$39, "selectable", false);
        _$insert(_el$39, () => `${props.selected === index() && props.focus === "relationships" ? "\u25B8 " : ""}${row.label}`);
        _$effect((_p$) => {
          var _v$33 = `relationship-${index()}`, _v$34 = color(props.context, "accent"), _v$35 = leftClick(() => {
            if (props.enabled()) props.link(row.href);
          });
          _v$33 !== _p$.e && (_p$.e = _$setProp(_el$39, "id", _v$33, _p$.e));
          _v$34 !== _p$.t && (_p$.t = _$setProp(_el$39, "fg", _v$34, _p$.t));
          _v$35 !== _p$.a && (_p$.a = _$setProp(_el$39, "onMouseUp", _v$35, _p$.a));
          return _p$;
        }, {
          e: void 0,
          t: void 0,
          a: void 0
        });
        return _el$39;
      })() : (() => {
        var _el$40 = _$createElement("text");
        _$setProp(_el$40, "selectable", false);
        _$insert(_el$40, () => `${props.focus === "relationships" && props.selected === index() ? "\u25B8 " : ""}${terminalText(row.issue.key)} \xB7 ${terminalText(row.note ?? row.issue.type)} \xB7 ${terminalText(row.issue.summary)}`);
        _$effect((_p$) => {
          var _v$36 = `relationship-${index()}`, _v$37 = color(props.context, props.focus === "relationships" && props.selected === index() ? "accent" : "base"), _v$38 = leftClick(() => {
            if (props.enabled()) props.open(index());
          });
          _v$36 !== _p$.e && (_p$.e = _$setProp(_el$40, "id", _v$36, _p$.e));
          _v$37 !== _p$.t && (_p$.t = _$setProp(_el$40, "fg", _v$37, _p$.t));
          _v$38 !== _p$.a && (_p$.a = _$setProp(_el$40, "onMouseUp", _v$38, _p$.a));
          return _p$;
        }, {
          e: void 0,
          t: void 0,
          a: void 0
        });
        return _el$40;
      })()
    }), null);
    _$setProp(_el$35, "height", 1);
    _$setProp(_el$35, "flexShrink", 0);
    _$setProp(_el$35, "wrapMode", "none");
    _$setProp(_el$35, "selectable", false);
    _$insert(_el$35, (() => {
      var _c$2 = _$memo(() => width() < 24);
      return () => _c$2() ? `${props.focus === "comment" ? "\u25B8" : ""}c Comment` : _$memo(() => width() < 60)() ? "Add comment [c] \xB7 Esc Back" : `${props.focus === "comment" ? "\u25B8 " : ""}Add comment [c] \xB7 Tab focus \xB7 \u2191/\u2193 scroll \xB7 Esc Back`;
    })());
    _$effect((_p$) => {
      var _v$16 = inset(), _v$17 = inset(), _v$18 = inset() ? 1 : 0, _v$19 = inset() ? 1 : 0, _v$20 = color(props.context, "accent"), _v$21 = props.context.theme?.background?.base, _v$22 = color(props.context, "accent"), _v$23 = leftClick(() => {
        if (props.enabled()) props.back();
      }), _v$24 = color(props.context, "base"), _v$25 = color(props.context, "base"), _v$26 = color(props.context, "accent"), _v$27 = color(props.context, "accent"), _v$28 = leftClick(() => {
        if (props.enabled()) props.comment();
      });
      _v$16 !== _p$.e && (_p$.e = _$setProp(_el$24, "paddingLeft", _v$16, _p$.e));
      _v$17 !== _p$.t && (_p$.t = _$setProp(_el$24, "paddingRight", _v$17, _p$.t));
      _v$18 !== _p$.a && (_p$.a = _$setProp(_el$24, "paddingTop", _v$18, _p$.a));
      _v$19 !== _p$.o && (_p$.o = _$setProp(_el$24, "paddingBottom", _v$19, _p$.o));
      _v$20 !== _p$.i && (_p$.i = _$setProp(_el$25, "borderColor", _v$20, _p$.i));
      _v$21 !== _p$.n && (_p$.n = _$setProp(_el$25, "backgroundColor", _v$21, _p$.n));
      _v$22 !== _p$.s && (_p$.s = _$setProp(_el$26, "fg", _v$22, _p$.s));
      _v$23 !== _p$.h && (_p$.h = _$setProp(_el$26, "onMouseUp", _v$23, _p$.h));
      _v$24 !== _p$.r && (_p$.r = _$setProp(_el$31, "fg", _v$24, _p$.r));
      _v$25 !== _p$.d && (_p$.d = _$setProp(_el$32, "fg", _v$25, _p$.d));
      _v$26 !== _p$.l && (_p$.l = _$setProp(_el$33, "fg", _v$26, _p$.l));
      _v$27 !== _p$.u && (_p$.u = _$setProp(_el$35, "fg", _v$27, _p$.u));
      _v$28 !== _p$.c && (_p$.c = _$setProp(_el$35, "onMouseUp", _v$28, _p$.c));
      return _p$;
    }, {
      e: void 0,
      t: void 0,
      a: void 0,
      o: void 0,
      i: void 0,
      n: void 0,
      s: void 0,
      h: void 0,
      r: void 0,
      d: void 0,
      l: void 0,
      u: void 0,
      c: void 0
    });
    return _el$24;
  })();
}

// ui/comment.tsx
import { effect as _$effect2 } from "@opentui/solid";
import { insertNode as _$insertNode2 } from "@opentui/solid";
import { use as _$use2 } from "@opentui/solid";
import { insert as _$insert2 } from "@opentui/solid";
import { setProp as _$setProp2 } from "@opentui/solid";
import { createElement as _$createElement2 } from "@opentui/solid";
import { createSignal as createSignal2, onCleanup } from "solid-js";
function CommentComposer(props) {
  const [focus, setFocus] = createSignal2(0);
  const [text, setText] = createSignal2(props.state.initial);
  const [pending, setPending] = createSignal2(false);
  const [error, setError] = createSignal2("");
  const [width, setWidth] = createSignal2(props.context.renderer?.width ?? 80);
  let editor;
  const pop = props.context.keymap.mode.push("jira-comment");
  onCleanup(pop);
  const allowed = () => props.context.ui.router.current().name === "jira" && props.context.keymap.mode.current() === "jira-comment";
  const valid = () => !!text().trim() && text().length <= 32e3 && terminalText(text()) === text();
  const intendFocus = (index) => {
    if (pending()) return;
    setFocus(index);
    if (focus() === 0) editor?.focus();
    else editor?.blur();
  };
  const cycle = (delta) => intendFocus((focus() + delta + 3) % 3);
  const cancel = () => {
    if (allowed() && !pending()) {
      props.save(text());
      props.close();
    }
  };
  const submit = async () => {
    if (!allowed() || pending() || !valid()) return;
    const frozen = text();
    const identity = {
      ...props.state
    };
    setPending(true);
    props.save(frozen);
    setError("");
    try {
      await props.send(frozen, identity);
      props.success(identity);
    } catch (cause) {
      const status = typeof cause === "object" && cause !== null && "status" in cause ? Number(cause.status) : 0;
      setError(status >= 400 && status < 500 ? `Jira ${status}; comment rejected. Draft retained.` : "Delivery uncertain; check Jira before retrying. Draft retained.");
      setPending(false);
      intendFocus(0);
    } finally {
      setPending(false);
    }
  };
  props.context.keymap.layer(() => ({
    mode: "jira-comment",
    priority: 80,
    enabled: allowed,
    commands: [{
      id: "jira.comment.tab",
      bind: "tab",
      run: () => {
        if (!pending()) cycle(1);
      }
    }, {
      id: "jira.comment.shift.tab",
      bind: "shift+tab",
      run: () => {
        if (!pending()) cycle(-1);
      }
    }, {
      id: "jira.comment.escape",
      bind: "escape",
      run: cancel
    }, {
      id: "jira.comment.return",
      bind: "return",
      run: () => {
        if (focus() === 0) return false;
        if (focus() === 1) void submit();
        else cancel();
      }
    }]
  }));
  return (() => {
    var _el$ = _$createElement2("box"), _el$2 = _$createElement2("text"), _el$3 = _$createElement2("textarea"), _el$4 = _$createElement2("text"), _el$5 = _$createElement2("box"), _el$6 = _$createElement2("text"), _el$7 = _$createElement2("text");
    _$insertNode2(_el$, _el$2);
    _$insertNode2(_el$, _el$3);
    _$insertNode2(_el$, _el$4);
    _$insertNode2(_el$, _el$5);
    _$setProp2(_el$, "position", "absolute");
    _$setProp2(_el$, "left", 0);
    _$setProp2(_el$, "top", 0);
    _$setProp2(_el$, "width", "100%");
    _$setProp2(_el$, "height", "100%");
    _$setProp2(_el$, "border", true);
    _$setProp2(_el$, "borderStyle", "double");
    _$setProp2(_el$, "flexDirection", "column");
    _$setProp2(_el$, "onSizeChange", function() {
      setWidth(this.width);
    });
    _$setProp2(_el$, "onMouseUp", (event) => event.stopPropagation());
    _$setProp2(_el$2, "height", 1);
    _$setProp2(_el$2, "flexShrink", 0);
    _$insert2(_el$2, () => `${props.state.key} \xB7 Comment`);
    _$use2((ref) => {
      editor = ref;
    }, _el$3);
    _$setProp2(_el$3, "id", "jira-comment-editor");
    _$setProp2(_el$3, "flexGrow", 1);
    _$setProp2(_el$3, "keyBindings", [{
      name: "return",
      meta: true,
      action: "newline"
    }, {
      name: "return",
      ctrl: true,
      action: "newline"
    }]);
    _$setProp2(_el$3, "onContentChange", () => {
      if (!pending()) {
        const value = editor?.plainText ?? text();
        setText(value);
        props.save(value);
      }
    });
    _$setProp2(_el$4, "height", 1);
    _$setProp2(_el$4, "flexShrink", 0);
    _$insert2(_el$4, () => error() || (pending() ? "Submitting; target and body frozen\u2026" : text().length > 32e3 ? "Plugin limit: 32000 characters" : width() < 44 ? "\u21B5Newline Tab Esc" : "Enter: newline \xB7 Tab: actions \xB7 Esc: retain draft"));
    _$insertNode2(_el$5, _el$6);
    _$insertNode2(_el$5, _el$7);
    _$setProp2(_el$5, "flexDirection", "row");
    _$setProp2(_el$5, "gap", 1);
    _$setProp2(_el$5, "height", 1);
    _$setProp2(_el$5, "flexShrink", 0);
    _$setProp2(_el$6, "selectable", false);
    _$setProp2(_el$6, "flexShrink", 0);
    _$insert2(_el$6, () => `${focus() === 1 ? "\u25B8 " : ""}Submit${pending() || !valid() ? " \xD7" : ""}`);
    _$setProp2(_el$7, "selectable", false);
    _$setProp2(_el$7, "flexShrink", 0);
    _$insert2(_el$7, () => `${focus() === 2 ? "\u25B8 " : ""}Cancel`);
    _$effect2((_p$) => {
      var _v$ = props.context.theme?.background?.base, _v$2 = color(props.context, "accent"), _v$3 = color(props.context, "base"), _v$4 = leftClick(() => intendFocus(0)), _v$5 = leftClick(() => intendFocus(0)), _v$6 = focus() === 0 && !pending(), _v$7 = props.state.initial, _v$8 = color(props.context, "base"), _v$9 = color(props.context, "base"), _v$0 = props.context.theme?.background?.base, _v$1 = props.context.theme?.background?.base, _v$10 = color(props.context, "error"), _v$11 = color(props.context, focus() === 1 ? "accent" : "base"), _v$12 = leftClick(() => {
        intendFocus(1);
        void submit();
      }), _v$13 = color(props.context, focus() === 2 ? "accent" : "base"), _v$14 = leftClick(() => {
        intendFocus(2);
        cancel();
      });
      _v$ !== _p$.e && (_p$.e = _$setProp2(_el$, "backgroundColor", _v$, _p$.e));
      _v$2 !== _p$.t && (_p$.t = _$setProp2(_el$, "borderColor", _v$2, _p$.t));
      _v$3 !== _p$.a && (_p$.a = _$setProp2(_el$2, "fg", _v$3, _p$.a));
      _v$4 !== _p$.o && (_p$.o = _$setProp2(_el$3, "onMouseDown", _v$4, _p$.o));
      _v$5 !== _p$.i && (_p$.i = _$setProp2(_el$3, "onMouseUp", _v$5, _p$.i));
      _v$6 !== _p$.n && (_p$.n = _$setProp2(_el$3, "focused", _v$6, _p$.n));
      _v$7 !== _p$.s && (_p$.s = _$setProp2(_el$3, "initialValue", _v$7, _p$.s));
      _v$8 !== _p$.h && (_p$.h = _$setProp2(_el$3, "textColor", _v$8, _p$.h));
      _v$9 !== _p$.r && (_p$.r = _$setProp2(_el$3, "focusedTextColor", _v$9, _p$.r));
      _v$0 !== _p$.d && (_p$.d = _$setProp2(_el$3, "backgroundColor", _v$0, _p$.d));
      _v$1 !== _p$.l && (_p$.l = _$setProp2(_el$3, "focusedBackgroundColor", _v$1, _p$.l));
      _v$10 !== _p$.u && (_p$.u = _$setProp2(_el$4, "fg", _v$10, _p$.u));
      _v$11 !== _p$.c && (_p$.c = _$setProp2(_el$6, "fg", _v$11, _p$.c));
      _v$12 !== _p$.w && (_p$.w = _$setProp2(_el$6, "onMouseUp", _v$12, _p$.w));
      _v$13 !== _p$.m && (_p$.m = _$setProp2(_el$7, "fg", _v$13, _p$.m));
      _v$14 !== _p$.f && (_p$.f = _$setProp2(_el$7, "onMouseUp", _v$14, _p$.f));
      return _p$;
    }, {
      e: void 0,
      t: void 0,
      a: void 0,
      o: void 0,
      i: void 0,
      n: void 0,
      s: void 0,
      h: void 0,
      r: void 0,
      d: void 0,
      l: void 0,
      u: void 0,
      c: void 0,
      w: void 0,
      m: void 0,
      f: void 0
    });
    return _el$;
  })();
}

// ui/workspace.tsx
function WorkspaceViewport(props) {
  return (() => {
    var _el$ = _$createElement3("box");
    _$setProp3(_el$, "flexDirection", "column");
    _$setProp3(_el$, "flexGrow", 1);
    _$setProp3(_el$, "minHeight", 1);
    _$insert3(_el$, _$createComponent2(Show2, {
      get when() {
        return props.rows.length > 0;
      },
      get fallback() {
        return (() => {
          var _el$3 = _$createElement3("text");
          _$insert3(_el$3, () => props.loading ? "Loading\u2026" : "No results for current filters.");
          _$effect3((_$p) => _$setProp3(_el$3, "fg", color(props.context, "base"), _$p));
          return _el$3;
        })();
      },
      get children() {
        return _$createComponent2(WorkspaceContent, {
          get context() {
            return props.context;
          },
          get rows() {
            return props.rows;
          },
          get selected() {
            return _$memo2(() => !!props.ticket)() ? props.workspaceSelected : props.selected;
          },
          get board() {
            return props.board;
          },
          get column() {
            return props.column;
          },
          get width() {
            return Math.max(1, props.width - 2);
          },
          enabled: () => props.enabled() && !props.ticket,
          get register() {
            return props.register;
          },
          get openKey() {
            return props.openKey;
          },
          get open() {
            return props.open;
          }
        });
      }
    }), null);
    _$insert3(_el$, _$createComponent2(Show2, {
      get when() {
        return _$memo2(() => !!props.detailsKey)() && !props.ticket;
      },
      get children() {
        var _el$2 = _$createElement3("text");
        _$setProp3(_el$2, "selectable", false);
        _$insert3(_el$2, () => `${props.focus === "details" ? "\u25B8 " : ""}Details \xB7 ${props.detailsKey}`);
        _$effect3((_p$) => {
          var _v$ = color(props.context, "base"), _v$2 = leftClick(() => {
            if (props.enabled()) props.openKey(props.detailsKey);
          });
          _v$ !== _p$.e && (_p$.e = _$setProp3(_el$2, "fg", _v$, _p$.e));
          _v$2 !== _p$.t && (_p$.t = _$setProp3(_el$2, "onMouseUp", _v$2, _p$.t));
          return _p$;
        }, {
          e: void 0,
          t: void 0
        });
        return _el$2;
      }
    }), null);
    _$insert3(_el$, _$createComponent2(Show2, {
      get when() {
        return props.ticket;
      },
      children: (value) => _$createComponent2(TicketWindow, {
        get context() {
          return props.context;
        },
        get ticket() {
          return value();
        },
        get selected() {
          return props.selected;
        },
        get focus() {
          return props.focus;
        },
        get enabled() {
          return props.enabled;
        },
        get back() {
          return props.back;
        },
        get comment() {
          return props.comment;
        },
        get link() {
          return props.link;
        },
        get register() {
          return props.register;
        },
        get open() {
          return props.relationship;
        }
      })
    }), null);
    _$insert3(_el$, _$createComponent2(Show2, {
      get when() {
        return props.composer;
      },
      children: (state) => _$createComponent2(CommentComposer, {
        get context() {
          return props.context;
        },
        get state() {
          return state();
        },
        get save() {
          return props.save;
        },
        get close() {
          return props.close;
        },
        get send() {
          return props.send;
        },
        get success() {
          return props.success;
        }
      })
    }), null);
    return _el$;
  })();
}

// lib/graph.ts
async function dependencyGraph(client, key, maxDepth = 2, signal) {
  const visited = /* @__PURE__ */ new Set();
  const cycles = [];
  let truncated = false;
  const rootRaw = await client.issue(key, signal);
  const rootIssue = toIssue(rootRaw, client.site);
  const expand = async (issueKey, edge, depth) => {
    const raw = await client.issue(issueKey, signal);
    const detail = toIssue(raw, client.site);
    const links2 = [];
    for (const link of raw.fields?.issuelinks ?? []) {
      const target = link.outwardIssue ?? link.inwardIssue;
      if (!target) continue;
      if (!DEPENDENCY_LINK_TYPES.has(link.type?.name ?? "")) continue;
      links2.push({
        type: link.type?.name ?? "Link",
        direction: link.outwardIssue ? "outward" : "inward",
        label: link.outwardIssue ? link.type?.outward : link.type?.inward,
        key: target.key,
        summary: target.fields?.summary ?? "",
        status: target.fields?.status?.name ?? "",
        blocking: link.type?.name === "Blocks"
      });
    }
    const children = [];
    if (depth < maxDepth) {
      for (const link of links2) {
        if (visited.has(link.key)) {
          cycles.push(`${issueKey} -> ${link.key}`);
          continue;
        }
        visited.add(link.key);
        children.push(await expand(link.key, link.label, depth + 1));
      }
    } else if (links2.length > 0) {
      truncated = true;
    }
    return { issue: detail, edge, depth, children };
  };
  visited.add(key);
  const nodes = [];
  const links = [];
  for (const link of rootRaw.fields?.issuelinks ?? []) {
    const target = link.outwardIssue ?? link.inwardIssue;
    if (!target) continue;
    if (!DEPENDENCY_LINK_TYPES.has(link.type?.name ?? "")) continue;
    links.push({
      type: link.type?.name ?? "Link",
      direction: link.outwardIssue ? "outward" : "inward",
      label: link.outwardIssue ? link.type?.outward : link.type?.inward,
      key: target.key,
      summary: target.fields?.summary ?? "",
      status: target.fields?.status?.name ?? "",
      blocking: link.type?.name === "Blocks"
    });
  }
  for (const link of links) {
    if (visited.has(link.key)) {
      cycles.push(`${key} -> ${link.key}`);
      continue;
    }
    visited.add(link.key);
    nodes.push(await expand(link.key, link.label, 1));
  }
  if (links.length > 0 && maxDepth < 1) truncated = true;
  return { nodes, truncated, cycles };
}
function flattenTree(nodes) {
  const rows = [];
  const walk = (list) => {
    for (const node of list) {
      rows.push({ issue: node.issue, edge: node.edge, depth: node.depth });
      walk(node.children);
    }
  };
  walk(nodes);
  return rows;
}

// lib/workspace-data.ts
async function graphRows(c, key, depth) {
  const result = await dependencyGraph(c, key, depth);
  const rows = [
    {
      kind: "group",
      label: `Dependency tree \xB7 ${key}`,
      count: result.nodes.length
    }
  ];
  if (!result.nodes.length)
    rows.push({ kind: "text", text: "No dependency links.", tone: "muted" });
  for (const node of flattenTree(result.nodes))
    rows.push({
      kind: "issue",
      issue: node.issue,
      note: `${"  ".repeat(node.depth - 1)}${node.edge}`.trim()
    });
  if (result.truncated)
    rows.push({
      kind: "text",
      text: `Depth limit ${depth} reached.`,
      tone: "warning"
    });
  if (result.cycles.length)
    rows.push({
      kind: "text",
      text: `Cycles skipped: ${result.cycles.join(", ")}`,
      tone: "warning"
    });
  return { rows, count: result.nodes.length };
}
var BATCH = 50;
function chunks(items, size) {
  return Array.from(
    { length: Math.ceil(items.length / size) },
    (_, index) => items.slice(index * size, (index + 1) * size)
  );
}
async function childCounts(c, keys) {
  const counts = /* @__PURE__ */ new Map();
  for (const batch of chunks(keys, BATCH)) {
    const result = await c.search(`parent in (${batch.join(", ")})`, { cap: 1500 }).catch(() => ({ issues: [], truncated: true }));
    if (result.truncated) continue;
    for (const key of batch) counts.set(key, { childCount: 0, doneCount: 0 });
    for (const issue of result.issues) {
      const key = issue.parentKey ?? issue.epicKey;
      if (!key) continue;
      const entry = counts.get(key) ?? { childCount: 0, doneCount: 0 };
      counts.set(key, {
        childCount: entry.childCount + 1,
        doneCount: entry.doneCount + (issue.statusCategory === "Done" ? 1 : 0)
      });
    }
  }
  return counts;
}
async function groupRows(c, issues, config, truncated, target) {
  const out = [];
  if (target === "backlog") {
    const keys = [
      ...new Set(
        issues.map((issue) => issue.epicKey).filter((key) => !!key)
      )
    ];
    const titles = /* @__PURE__ */ new Map();
    for (const batch of chunks(keys, BATCH)) {
      const result = await c.search(`key in (${batch.join(", ")})`, {
        fields: ["summary"],
        cap: 300
      }).catch(() => ({ issues: [] }));
      for (const issue of result.issues) titles.set(issue.key, issue.summary);
    }
    for (const group of groupByEpic(issues, titles)) {
      out.push({
        kind: "group",
        label: group.epicKey ? `${group.epicKey} \xB7 ${titles.get(group.epicKey) ?? "title unavailable"}` : "No epic",
        key: group.epicKey ?? void 0,
        count: group.issues.length
      });
      for (const issue of group.issues) out.push({ kind: "issue", issue });
    }
  } else {
    for (const group of groupByColumn(issues, config.columns)) {
      out.push({
        kind: "group",
        label: group.column,
        count: group.issues.length
      });
      for (const issue of group.issues) out.push({ kind: "issue", issue });
    }
  }
  if (truncated)
    out.push({
      kind: "text",
      text: "Result truncated at the page cap.",
      tone: "warning"
    });
  return out;
}

// ui/keymap.ts
function workspaceCommands(a) {
  const command = (id, bind, run) => ({
    id: `jira.${id}`,
    bind,
    run
  });
  return [
    command("down", "j", () => a.move(1)),
    command("down.arrow", "down", () => a.move(1)),
    command("up", "k", () => a.move(-1)),
    command("up.arrow", "up", () => a.move(-1)),
    command("left", "left", () => a.horizontal(-1)),
    command("right", "right", () => a.horizontal(1)),
    command("tab", "tab", () => a.cycleFocus(1)),
    command("shift.tab", "shift+tab", () => a.cycleFocus(-1)),
    command("comment", "c", a.addComment),
    command("activate", "return", a.activate),
    command("browser", "o", a.openInBrowser),
    command("copy", "y", a.copyKey),
    command("transition", "m", () => void a.runAction("transition")),
    command("assign", "i", () => void a.runAction("assign")),
    command("unassign", "u", () => void a.runAction("unassign")),
    command("sprint", "s", () => void a.runAction("sprint")),
    command("assignee", "a", () => void a.pickAssignee()),
    command("type", "t", () => void a.pickType()),
    command("search", "/", () => void a.search()),
    command("graph", "g", () => void a.showGraph()),
    command("settings", ",", () => void a.configure()),
    command("refresh", "r", a.refresh),
    command("back", "backspace", a.back),
    command("close", "q", a.back),
    command("close.escape", "escape", a.back),
    ...["mine", "sprint", "backlog", "epics"].map(
      (view, index) => command(`view.${view}`, String(index + 1), () => a.switchView(view))
    )
  ];
}
var VIEWS = [
  { id: "mine", label: "My Work" },
  { id: "sprint", label: "Sprint" },
  { id: "backlog", label: "Backlog" },
  { id: "epics", label: "Epics" },
  { id: "issue", label: "Issue" }
];
var ASSIGNEE_LABELS = {
  mine: "mine",
  others: "others",
  unassigned: "unassigned",
  all: "all"
};

// ui/chrome.tsx
import { memo as _$memo3 } from "@opentui/solid";
import { effect as _$effect4 } from "@opentui/solid";
import { createTextNode as _$createTextNode2 } from "@opentui/solid";
import { insertNode as _$insertNode3 } from "@opentui/solid";
import { insert as _$insert4 } from "@opentui/solid";
import { createComponent as _$createComponent3 } from "@opentui/solid";
import { setProp as _$setProp4 } from "@opentui/solid";
import { use as _$use3 } from "@opentui/solid";
import { createElement as _$createElement4 } from "@opentui/solid";
import { createEffect as createEffect2, For as For2, Show as Show3 } from "solid-js";
function ViewTabs(props) {
  let scroll;
  createEffect2(() => {
    props.width;
    props.focus;
    const active = props.view === "issue" ? "mine" : props.view;
    const labels = VIEWS.filter((item) => item.id !== "issue");
    const index = labels.findIndex((item) => item.id === active);
    const offset = labels.slice(0, index).reduce((total, item) => total + item.label.length + 2, 0);
    queueMicrotask(() => scroll?.scrollTo({
      x: props.width >= 44 ? 0 : offset,
      y: 0
    }));
  });
  return _$createComponent3(Show3, {
    get when() {
      return props.width >= 44;
    },
    get fallback() {
      return (() => {
        var _el$2 = _$createElement4("box"), _el$3 = _$createElement4("text"), _el$4 = _$createTextNode2(`\u2039 `), _el$6 = _$createElement4("text"), _el$7 = _$createElement4("text"), _el$8 = _$createTextNode2(` \u203A`);
        _$insertNode3(_el$2, _el$3);
        _$insertNode3(_el$2, _el$6);
        _$insertNode3(_el$2, _el$7);
        _$setProp4(_el$2, "height", 1);
        _$setProp4(_el$2, "flexShrink", 0);
        _$setProp4(_el$2, "flexDirection", "row");
        _$insertNode3(_el$3, _el$4);
        _$setProp4(_el$3, "flexShrink", 0);
        _$setProp4(_el$3, "selectable", false);
        _$setProp4(_el$6, "flexShrink", 0);
        _$setProp4(_el$6, "selectable", false);
        _$insert4(_el$6, () => `[${VIEWS.find((item) => item.id === props.view)?.label ?? "My Work"}]`);
        _$insertNode3(_el$7, _el$8);
        _$setProp4(_el$7, "flexShrink", 0);
        _$setProp4(_el$7, "selectable", false);
        _$effect4((_p$) => {
          var _v$ = leftClick(() => {
            const index = VIEWS.findIndex((item) => item.id === props.view);
            props.switchView(VIEWS[(Math.max(0, index) + 3) % 4].id);
          }), _v$2 = leftClick(() => props.switchView(props.view === "issue" ? "mine" : props.view)), _v$3 = leftClick(() => {
            const index = VIEWS.findIndex((item) => item.id === props.view);
            props.switchView(VIEWS[(Math.max(0, index) + 1) % 4].id);
          });
          _v$ !== _p$.e && (_p$.e = _$setProp4(_el$3, "onMouseUp", _v$, _p$.e));
          _v$2 !== _p$.t && (_p$.t = _$setProp4(_el$6, "onMouseUp", _v$2, _p$.t));
          _v$3 !== _p$.a && (_p$.a = _$setProp4(_el$7, "onMouseUp", _v$3, _p$.a));
          return _p$;
        }, {
          e: void 0,
          t: void 0,
          a: void 0
        });
        return _el$2;
      })();
    },
    get children() {
      var _el$ = _$createElement4("scrollbox");
      _$use3((ref) => {
        scroll = ref;
      }, _el$);
      _$setProp4(_el$, "scrollX", true);
      _$setProp4(_el$, "scrollY", false);
      _$setProp4(_el$, "height", 1);
      _$setProp4(_el$, "flexShrink", 0);
      _$setProp4(_el$, "contentOptions", {
        flexDirection: "row",
        minWidth: 39
      });
      _$insert4(_el$, _$createComponent3(For2, {
        get each() {
          return VIEWS.filter((item) => item.id !== "issue");
        },
        children: (item) => (() => {
          var _el$0 = _$createElement4("text");
          _$setProp4(_el$0, "flexShrink", 0);
          _$setProp4(_el$0, "selectable", false);
          _$insert4(_el$0, (() => {
            var _c$ = _$memo3(() => item.id === props.view);
            return () => _c$() ? `${props.focus === "tabs" ? "\u25B8" : ""}[${item.label}]` : ` ${item.label} `;
          })());
          _$effect4((_p$) => {
            var _v$4 = `tab-${item.id}`, _v$5 = item.label.length + 3, _v$6 = color(props.context, item.id === props.view ? "accent" : "muted"), _v$7 = leftClick(() => props.switchView(item.id));
            _v$4 !== _p$.e && (_p$.e = _$setProp4(_el$0, "id", _v$4, _p$.e));
            _v$5 !== _p$.t && (_p$.t = _$setProp4(_el$0, "width", _v$5, _p$.t));
            _v$6 !== _p$.a && (_p$.a = _$setProp4(_el$0, "fg", _v$6, _p$.a));
            _v$7 !== _p$.o && (_p$.o = _$setProp4(_el$0, "onMouseUp", _v$7, _p$.o));
            return _p$;
          }, {
            e: void 0,
            t: void 0,
            a: void 0,
            o: void 0
          });
          return _el$0;
        })()
      }));
      return _el$;
    }
  });
}
function screenHint(width, focus, ticket, board, composer) {
  if (width < 44) {
    if (composer) return "\u21B5Newline Tab Esc";
    if (ticket) return focus === "relationships" ? "\u2191\u2193 \u21B5Link Tab Esc" : "\u2191\u2193Scroll Tab Esc";
    if (focus === "tabs") return "\u2190\u2192Tabs \u21B5 Tab Esc";
    return "\u21B5Open Tab EscBack";
  }
  if (composer) return "Enter newline \xB7 Tab actions \xB7 Escape retains draft";
  if (ticket) return focus === "relationships" ? "\u2191/\u2193 targets \xB7 Enter follow \xB7 Tab focus \xB7 Esc Back" : "\u2191/\u2193 scroll \xB7 Tab targets/actions \xB7 Esc Back \xB7 r Refresh";
  if (focus === "tabs") return "Tabs \u2190/\u2192 \xB7 \u2193/Enter content \xB7 Tab focus \xB7 Esc Back";
  return `${board ? "\u2190/\u2192 columns \xB7 " : "List \xB7 "}\u2191/\u2193 move \xB7 Enter open \xB7 Tab focus \xB7 Esc Back \xB7 r Refresh`;
}
function SessionReturnControl(props) {
  return (() => {
    var _el$1 = _$createElement4("text");
    _$setProp4(_el$1, "id", "jira-session-back");
    _$setProp4(_el$1, "selectable", false);
    _$setProp4(_el$1, "flexShrink", 0);
    _$insert4(_el$1, () => `${props.focused ? "\u25B8" : ""}${props.nested ? "Back" : props.width < 44 ? "Close" : "Close to session"} `);
    _$effect4((_p$) => {
      var _v$8 = color(props.context, props.focused ? "accent" : "base"), _v$9 = leftClick(props.back);
      _v$8 !== _p$.e && (_p$.e = _$setProp4(_el$1, "fg", _v$8, _p$.e));
      _v$9 !== _p$.t && (_p$.t = _$setProp4(_el$1, "onMouseUp", _v$9, _p$.t));
      return _p$;
    }, {
      e: void 0,
      t: void 0
    });
    return _el$1;
  })();
}

// ui/filters.ts
function filters(a) {
  const pickAssignee = async () => {
    const order = ["mine", "others", "unassigned", "all"];
    const picked = await a.context.ui.dialog.select({
      title: "Assignee filter",
      current: a.assignee(),
      options: order.map((value) => ({ title: value, value }))
    });
    if (!picked) return;
    a.setAssignee(picked);
    await a.load();
  };
  const pickType = async () => {
    const types = [
      ...new Set(
        a.rows().flatMap((row) => row.kind === "issue" ? [row.issue.type] : [])
      )
    ].sort();
    const picked = await a.context.ui.dialog.select({
      title: "Issue type",
      current: a.type() ?? "any",
      options: [
        { title: "any", value: "any" },
        ...types.map((value) => ({ title: value, value }))
      ]
    });
    if (!picked) return;
    a.setType(picked === "any" ? null : String(picked));
    await a.load();
  };
  const search = async () => {
    const query = await a.context.ui.dialog.prompt({
      title: "Filter text",
      placeholder: "summary, key or assignee"
    });
    if (query === void 0) return;
    a.setText(query);
    await a.load();
  };
  const configure = async () => {
    const s = a.cfg();
    const site = await a.context.ui.dialog.prompt({
      title: "Atlassian site",
      placeholder: s.site
    });
    if (site === void 0) return;
    const project = await a.context.ui.dialog.prompt({
      title: "Project key",
      placeholder: s.projectKey
    });
    if (project === void 0) return;
    let boardId = s.boardId;
    try {
      const boards = await new JiraClient(site || s.site).boards(
        project || s.projectKey
      );
      const picked = await a.context.ui.dialog.select({
        title: "Board",
        current: String(boardId ?? ""),
        options: boards.map((b) => ({
          title: `${b.name} (${b.type})`,
          value: String(b.id)
        }))
      });
      if (picked) boardId = Number(picked);
    } catch (e) {
      a.context.ui.toast.show({
        message: `Could not list boards: ${a.message(e)}`,
        variant: "warning"
      });
    }
    await a.updateSettings((draft) => {
      if (site) draft.site = site;
      if (project) draft.projectKey = project;
      draft.boardId = boardId;
    });
    a.reset();
    await a.load(true);
    a.context.ui.toast.show({
      message: "Jira settings saved",
      variant: "success"
    });
  };
  return { pickAssignee, pickType, search, configure };
}

// ui/actions.ts
async function runTicketAction(a, kind) {
  const issue = a.issue();
  if (!issue) {
    a.context.ui.toast.show({
      message: "No issue selected",
      variant: "warning"
    });
    return;
  }
  const c = a.client();
  try {
    if (kind === "transition") {
      const transitions = await c.transitions(issue.key);
      if (!transitions.length) {
        a.context.ui.toast.show({
          message: `No transitions available for ${issue.key}`,
          variant: "warning"
        });
        return;
      }
      const picked = await a.context.ui.dialog.select({
        title: `Move ${issue.key}`,
        options: transitions.map((t) => ({
          title: t.to?.name ?? t.name,
          value: t.id
        }))
      });
      if (!picked) return;
      await c.transition(issue.key, String(picked));
      a.context.ui.toast.show({
        message: `${issue.key} moved`,
        variant: "success"
      });
    } else if (kind === "assign") {
      const me = a.accountId() ?? await c.me();
      a.setAccountId(me);
      await c.assign(issue.key, me);
      a.context.ui.toast.show({
        message: `${issue.key} assigned to you`,
        variant: "success"
      });
    } else if (kind === "unassign") {
      const confirmed = await a.context.ui.dialog.confirm({
        title: `Unassign ${issue.key}?`,
        message: issue.summary,
        label: { confirm: "Unassign", cancel: "Cancel" }
      });
      if (!confirmed) return;
      await c.assign(issue.key, null);
      a.context.ui.toast.show({
        message: `${issue.key} unassigned`,
        variant: "success"
      });
    } else {
      const current = a.board(), active = a.sprint() ?? (current ? await c.activeSprint(current.id) : void 0);
      if (!active) {
        a.context.ui.toast.show({
          message: "No active sprint",
          variant: "warning"
        });
        return;
      }
      const confirmed = await a.context.ui.dialog.confirm({
        title: `Add ${issue.key} to ${active.name}?`,
        message: issue.summary,
        label: { confirm: "Add", cancel: "Cancel" }
      });
      if (!confirmed) return;
      await c.addToSprint(active.id, [issue.key]);
      a.context.ui.toast.show({
        message: `${issue.key} added to ${active.name}`,
        variant: "success"
      });
    }
    await a.refresh();
  } catch (e) {
    a.context.ui.toast.show({
      title: "Jira",
      message: a.message(e),
      variant: "error",
      duration: 8e3
    });
  }
}

// lib/ticket.ts
async function readTicket(c, key) {
  const issue = toIssueDetail(await c.issue(key), c.site);
  const children = issue.type === "Epic" ? await c.search(`parent = ${key} ORDER BY Rank ASC`, { cap: 300 }).catch(() => ({ issues: [], truncated: true })) : void 0;
  const epic = issue.epicKey && issue.epicKey !== key ? await c.issue(issue.epicKey).then((raw) => toIssueDetail(raw, c.site)).catch(() => null) : null;
  const out = [];
  if (issue.parent)
    out.push(
      { kind: "group", label: "Parent", count: 1 },
      { kind: "issue", issue: issue.parent, note: "parent" }
    );
  if (epic)
    out.push(
      { kind: "group", label: "Epic", count: 1 },
      { kind: "issue", issue: epic, note: "epic" }
    );
  if (issue.links.length) {
    out.push({
      kind: "group",
      label: "Links & dependencies",
      count: issue.links.length
    });
    for (const link of issue.links)
      out.push({
        kind: "issue",
        issue: {
          key: link.key,
          summary: link.summary,
          type: link.type,
          status: link.status,
          statusId: "",
          statusCategory: "Unknown",
          assignee: null,
          assigneeId: null,
          epicKey: null,
          parentKey: null,
          points: null,
          priority: null,
          updated: "",
          url: `https://${c.site}/browse/${link.key}`
        },
        note: `${link.direction} \xB7 ${link.label}`
      });
  }
  const subtasks = children?.issues ?? issue.subtasks;
  if (subtasks.length) {
    out.push({ kind: "group", label: "Subtasks", count: subtasks.length });
    for (const sub of subtasks)
      out.push({ kind: "issue", issue: sub, note: "sub-task" });
  }
  if (children?.truncated)
    out.push({
      kind: "text",
      text: "Children unavailable/partial",
      tone: "warning"
    });
  const blocks = projectAdf(issue.descriptionAdf ?? issue.description);
  for (const block of blocks)
    if (block.href)
      out.push({ kind: "link", label: block.text, href: block.href });
  return { issue, site: c.site, blocks, relationships: out };
}

// ui/entry.ts
function registerEntry(a) {
  a.context.keymap.layer(() => ({
    mode: "global",
    commands: [
      {
        id: "jira.open",
        title: "Jira board",
        description: "My tickets, the active sprint, the backlog, epics and dependencies",
        group: "Jira",
        palette: true,
        slash: { name: "jira", arguments: true },
        run: async (input) => {
          if (a.composer()) return;
          const route = a.context.ui.router.current();
          if (route.type !== "plugin" || route.name !== "jira")
            a.captureRoute({
              ...route,
              ...route.data ? { data: { ...route.data } } : {}
            });
          const intent = a.invalidate();
          a.reset();
          a.context.ui.router.navigate({
            type: "plugin",
            name: "jira",
            data: {}
          });
          const key = (input ?? "").trim().toUpperCase();
          const baseline = a.load(), generation = a.generation();
          if (/^[A-Z]+-\d+$/.test(key)) {
            await baseline;
            if (a.valid(intent, generation)) void a.openIssue(key);
          }
        }
      },
      {
        id: "jira.settings.command",
        title: "Jira: settings",
        group: "Jira",
        palette: true,
        run: () => {
          if (!a.composer()) void a.configure();
        }
      }
    ]
  }));
}

// tui.tsx
function message(error) {
  if (error instanceof JiraError && error.message === "No active sprint on this board") return error.message;
  if (error instanceof JiraError && error.message.startsWith("No boards found")) return "No boards available for this project.";
  if (error instanceof JiraError) return `Jira ${error.status || "unavailable"}; retry or check board access/configuration.`;
  return "Request failed; content may be stale. Retry or check Jira access/configuration.";
}
var tui_default = {
  id: "opencode-jira.tui",
  setup(context) {
    const stored = context.storage.store("settings", {
      initial: {
        site: "example.atlassian.net",
        projectKey: "DEMO",
        boardId: null,
        cacheSeconds: 60,
        linkDepth: 2
      }
    });
    const updateSettings = stored[1];
    const cfg = () => typeof stored[0] === "function" ? stored[0]() : stored[0];
    const [view, setView] = createSignal3("mine");
    const [assignee, setAssignee] = createSignal3("mine");
    const [text, setText] = createSignal3("");
    const [typeFilter, setTypeFilter] = createSignal3(null);
    const [rows, setRows] = createSignal3([]);
    const [selected, setSelected] = createSignal3(0);
    const [loading, setLoading] = createSignal3(false);
    const [status, setStatus] = createSignal3("");
    const [error, setError] = createSignal3(void 0);
    const [board, setBoard] = createSignal3(void 0);
    const [sprint, setSprint] = createSignal3(void 0);
    const [drillEpic, setDrillEpic] = createSignal3(null);
    const [graphKey, setGraphKey] = createSignal3(null);
    const [accountId, setAccountId] = createSignal3(null);
    const [myCount, setMyCount] = createSignal3(null);
    const [focus, setFocus] = createSignal3("content");
    const [column, setColumn] = createSignal3(0);
    const [ticket, setTicket] = createSignal3();
    const [composer, setComposer] = createSignal3();
    const [width, setWidth] = createSignal3(context.renderer?.width ?? 80);
    const [history, setHistory] = createSignal3([]);
    const [workspaceRows, setWorkspaceRows] = createSignal3([]);
    const [workspaceSelected, setWorkspaceSelected] = createSignal3(0);
    const [workspaceColumn, setWorkspaceColumn] = createSignal3(0);
    const drafts = /* @__PURE__ */ new Map();
    const scrollRefs = /* @__PURE__ */ new Map();
    let rememberedScroll = {};
    let generation = 0;
    let disposed = false;
    let hostRoute = {
      type: "home"
    };
    let retryRead;
    const columnSelection = /* @__PURE__ */ new Map();
    let workspaceBoard = true;
    let settingsEpoch = 0;
    let directIntent = 0;
    const clearRetry = () => {
      retryRead = void 0;
      setError(void 0);
    };
    const snapshot = () => ({
      view: view(),
      rows: rows(),
      selected: selected(),
      column: column(),
      focus: focus(),
      ticket: ticket(),
      drillEpic: drillEpic(),
      graphKey: graphKey(),
      filter: filterState(),
      scroll: Object.fromEntries([...scrollRefs].map(([id, ref]) => [id, {
        x: ref.scrollLeft,
        y: ref.scrollTop
      }]))
    });
    const remember = () => {
      setHistory((stack) => pushScreen(stack, snapshot()));
      if (!ticket() && ROOT_VIEWS.includes(view()) && !drillEpic()) {
        workspaceBoard = boardView();
        setWorkspaceRows(rows());
        setWorkspaceSelected(selected());
        setWorkspaceColumn(column());
      }
    };
    function restore(state) {
      setView(state.view);
      setRows(state.rows);
      setSelected(state.selected);
      setColumn(state.column);
      setFocus(state.focus);
      setTicket(state.ticket);
      setDrillEpic(state.drillEpic);
      setGraphKey(state.graphKey);
      setAssignee(state.filter.assignee);
      setText(state.filter.text);
      setTypeFilter(state.filter.type);
      rememberedScroll = state.scroll;
      queueMicrotask(() => {
        if (!disposed) for (const [id, position] of Object.entries(state.scroll)) scrollRefs.get(id)?.scrollTo(position);
      });
    }
    function back() {
      if (!boardInputEnabled()) return;
      generation++;
      directIntent++;
      clearRetry();
      setLoading(false);
      const [stack, state] = popScreen(history());
      if (state) {
        setHistory(stack);
        restore(state);
      } else context.ui.router.navigate(hostRoute);
    }
    const registerScroll = (id, ref) => {
      scrollRefs.set(id, ref);
      if (rememberedScroll[id]) ref.scrollTo(rememberedScroll[id]);
    };
    const boardView = () => !ticket() && !drillEpic() && (view() === "mine" || view() === "sprint");
    const groups = createMemo2(() => {
      const out = [];
      rows().forEach((row, index) => {
        if (row.kind === "group") out.push([]);
        else if (row.kind === "issue") out.at(-1)?.push(index);
      });
      return out;
    });
    const cache = /* @__PURE__ */ new Map();
    const client = () => new JiraClient(cfg().site);
    const filterState = () => ({
      assignee: assignee(),
      text: text(),
      type: typeFilter()
    });
    const selectableIndexes = createMemo2(() => rows().reduce((acc, row, index) => row.kind === "issue" || row.kind === "link" || view() === "backlog" && row.kind === "group" && row.key ? [...acc, index] : acc, []));
    const currentIssue = createMemo2(() => {
      if (ticket()) return ticket().issue;
      const row = rows()[selected()];
      return row && row.kind === "issue" ? row.issue : void 0;
    });
    function firstSelectable(list) {
      const index = list.findIndex((row) => row.kind === "issue");
      return index < 0 ? 0 : index;
    }
    function alignSelection(next) {
      const prior = currentIssue()?.key;
      const columns = [];
      next.forEach((row, index2) => {
        if (row.kind === "group") columns.push({
          label: row.label,
          header: index2,
          indexes: []
        });
        else if (row.kind === "issue") columns.at(-1)?.indexes.push(index2);
      });
      let active = Math.max(0, Math.min(column(), columns.length - 1));
      const retained = next.findIndex((row) => row.kind === "issue" && row.issue.key === prior);
      if (boardView() && retained >= 0) active = Math.max(0, columns.findIndex((group2) => group2.indexes.includes(retained)));
      const group = columns[active];
      const remembered = group && columnSelection.get(group.label);
      const index = retained >= 0 ? retained : group?.indexes.find((index2) => next[index2].issue.key === remembered) ?? (boardView() ? group?.indexes[0] ?? -1 : firstSelectable(next));
      for (const [label, key] of columnSelection) if (!next.some((row) => row.kind === "issue" && row.issue.key === key)) columnSelection.delete(label);
      setRows(next);
      setColumn(active);
      setSelected(index);
    }
    async function resolveBoard(c) {
      const configured = cfg().boardId;
      if (configured) return c.boardConfig(configured);
      const boards = await c.boards(cfg().projectKey);
      if (boards.length === 0) throw new JiraError(0, `No boards found for project ${cfg().projectKey}`);
      const preferred = boards.find((b) => b.type === "scrum") ?? boards[0];
      await updateSettings((draft) => {
        draft.boardId = preferred.id;
      });
      return c.boardConfig(preferred.id);
    }
    async function load(options = {}) {
      if (ticket() || composer()) return;
      const request = ++generation;
      const target = view();
      setError(void 0);
      setLoading(true);
      setStatus("loading\u2026");
      try {
        const c = client();
        const s = cfg();
        const filter = filterState();
        if (!accountId()) {
          const me = await c.me().catch(() => null);
          if (request !== generation || disposed) return;
          setAccountId(me);
        }
        let config = board();
        if (!config || options.refresh) {
          config = await resolveBoard(c);
          if (request !== generation || disposed) return;
          setBoard(config);
        }
        if (request !== generation || disposed) return;
        const key = `${target}|${filter.assignee}|${filter.text}|${filter.type}|${drillEpic()}|${config.id}`;
        const hit = cache.get(key);
        if (!options.refresh && hit && Date.now() - hit.at < s.cacheSeconds * 1e3) {
          alignSelection(hit.rows);
          setStatus("cached");
          return;
        }
        let next = [];
        if (target === "mine" || target === "sprint" || target === "backlog") {
          let issues;
          let truncated = false;
          if (target === "sprint") {
            const active = sprint() ?? await c.activeSprint(config.id);
            if (request !== generation || disposed) return;
            setSprint(active);
            if (!active) throw new JiraError(0, "No active sprint on this board");
            issues = await c.sprintIssues(config.id, active.id);
            issues = applyAssigneeFilter(applyTextFilter(issues, filter), filter.assignee, accountId());
          } else if (target === "backlog") {
            const result = await c.backlog(config.id);
            issues = applyAssigneeFilter(applyTextFilter(result.issues, filter), filter.assignee, accountId());
            truncated = result.truncated;
          } else {
            const jql = buildJql({
              view: "mine",
              projectKey: s.projectKey,
              boardJql: config.filterJql,
              assignee: filter.assignee,
              filter
            });
            const result = await c.search(jql, {
              cap: 400
            });
            issues = result.issues;
            truncated = result.truncated;
          }
          next = await groupRows(c, issues, config, truncated, target);
        } else if (target === "epics") {
          const jql = buildJql({
            view: "epics",
            projectKey: s.projectKey,
            assignee: filter.assignee,
            filter
          });
          const result = await c.search(jql, {
            cap: 400
          });
          const epics = applyTextFilter(result.issues, filter);
          const counts = await childCounts(c, epics.map((epic) => epic.key));
          for (const category of [...new Set(epics.map((epic) => epic.statusCategory))]) {
            const items = epics.filter((epic) => epic.statusCategory === category);
            next.push({
              kind: "group",
              label: category,
              count: items.length
            });
            for (const epic of items) {
              const progress = counts.get(epic.key);
              next.push({
                kind: "issue",
                issue: epic,
                note: progress ? `${progress.doneCount}/${progress.childCount} done` : "unknown/partial child count"
              });
            }
          }
          if (result.truncated) next.push({
            kind: "text",
            text: "Epics result partial",
            tone: "warning"
          });
        } else {
          next = await epicChildrenRows(c, filter);
        }
        if (request !== generation || disposed) return;
        cache.set(key, {
          at: Date.now(),
          rows: next
        });
        alignSelection(next);
        setStatus(`${next.filter((row) => row.kind === "issue").length} issues`);
      } catch (e) {
        if (request !== generation || disposed) return;
        setError(message(e));
        setStatus("error");
      } finally {
        if (request === generation && !disposed) setLoading(false);
      }
    }
    async function epicChildrenRows(c, filter, target = drillEpic()) {
      if (!target) {
        return [{
          kind: "text",
          text: "Select an epic in the Epics view and press enter.",
          tone: "muted"
        }];
      }
      const epic = await c.issue(target).then((raw) => toIssueDetail(raw, c.site));
      const children = await c.search(`parent = ${target} ORDER BY Rank ASC`, {
        cap: 300
      });
      const progress = epicProgress(children.issues);
      const out = [{
        kind: "group",
        label: `${epic.key} \xB7 ${epic.summary}`,
        count: children.issues.length
      }, {
        kind: "text",
        text: `${epic.status} \xB7 ${children.truncated ? "partial " : ""}${progress.doneCount}/${progress.childCount} done \xB7 ${epic.assignee ?? "unassigned"}`,
        tone: "muted"
      }, {
        kind: "group",
        label: "Children",
        count: children.issues.length
      }];
      for (const issue of applyTextFilter(children.issues, filter)) out.push({
        kind: "issue",
        issue
      });
      if (children.truncated) out.push({
        kind: "text",
        text: "Children result partial",
        tone: "warning"
      });
      if (children.issues.length === 0) out.push({
        kind: "text",
        text: "No children.",
        tone: "muted"
      });
      return out;
    }
    async function openIssue(key, refresh = false) {
      if (composer() || !/^[A-Z][A-Z0-9_]*-\d+$/.test(key) || !refresh && ticket()?.issue.key === key) return;
      const previous = snapshot();
      const request = ++generation;
      setError(void 0);
      setLoading(true);
      setStatus(`loading ${key}\u2026`);
      try {
        const c = refresh && ticket()?.site ? new JiraClient(ticket().site) : client();
        const payload = await readTicket(c, key);
        const issue = payload.issue, out = [...payload.relationships];
        if (request !== generation || disposed) return;
        if (!refresh) remember();
        setTicket(payload);
        setRows(out);
        setSelected(refresh ? previous.selected : firstSelectable(out));
        setFocus(refresh ? previous.focus : "body");
        rememberedScroll = refresh ? previous.scroll : {};
        if (refresh) {
          setHistory((stack) => stack.map((state) => state.ticket?.issue.key === key && state.ticket.site === c.site ? {
            ...state,
            ticket: payload,
            rows: out
          } : state));
          queueMicrotask(() => scrollRefs.get("body")?.scrollTo(previous.scroll.body ?? {
            x: 0,
            y: 0
          }));
        } else scrollRefs.get("body")?.scrollTo({
          x: 0,
          y: 0
        });
        setStatus(issue.key);
        retryRead = void 0;
      } catch (e) {
        if (request !== generation || disposed) return;
        setError(message(e));
        retryRead = () => {
          if (request === generation && !disposed) void openIssue(key, refresh);
        };
      } finally {
        if (request === generation && !disposed) setLoading(false);
      }
    }
    async function openChildren(key) {
      if (composer()) return;
      const request = ++generation;
      clearRetry();
      setLoading(true);
      try {
        const next = await epicChildrenRows(client(), filterState(), key);
        if (request !== generation || disposed) return;
        remember();
        setTicket(void 0);
        setDrillEpic(key);
        setView("issue");
        setGraphKey(null);
        setFocus("content");
        setRows(next);
        setSelected(firstSelectable(next));
        clearRetry();
      } catch (cause) {
        if (request !== generation || disposed) return;
        setError(message(cause));
        retryRead = () => {
          if (request === generation) void openChildren(key);
        };
      } finally {
        if (request === generation) setLoading(false);
      }
    }
    async function showGraph(refresh = false) {
      if (composer()) return;
      const key = refresh ? graphKey() : currentIssue()?.key;
      if (!key) return;
      const request = ++generation;
      clearRetry();
      setLoading(true);
      setStatus(`graph ${key}\u2026`);
      try {
        const result = await graphRows(client(), key, cfg().linkDepth);
        if (request !== generation || disposed) return;
        if (!refresh) remember();
        setGraphKey(key);
        clearRetry();
        setTicket(void 0);
        setView("issue");
        setFocus("content");
        setRows(result.rows);
        setSelected(firstSelectable(result.rows));
        setStatus(`${result.count} linked`);
      } catch (e) {
        if (request !== generation || disposed) return;
        setError(message(e));
        retryRead = () => {
          if (request === generation && !composer()) void showGraph(refresh);
        };
      } finally {
        if (request === generation && !disposed) setLoading(false);
      }
    }
    function move(delta) {
      if (focus() === "tabs") {
        if (delta > 0) setFocus("content");
        return;
      }
      if (ticket() && focus() === "body") {
        scrollRefs.get("body")?.scrollBy(delta);
        return;
      }
      if (ticket() && focus() !== "relationships") return;
      const indexes = boardView() ? groups()[column()] ?? [] : selectableIndexes();
      if (indexes.length === 0) return;
      const current = indexes.indexOf(selected());
      const next = Math.max(0, Math.min(indexes.length - 1, (current < 0 ? 0 : current) + delta));
      setSelected(indexes[next]);
      scrollRefs.get(ticket() ? "body" : boardView() ? `column-${column()}` : "list")?.scrollChildIntoView?.(`${ticket() ? "relationship" : boardView() ? "card" : "row"}-${indexes[next]}`);
    }
    function horizontal(delta) {
      if (focus() === "tabs") {
        const index = ROOT_VIEWS.indexOf(view());
        switchView(ROOT_VIEWS[(Math.max(0, index) + delta + 4) % 4]);
        setFocus("tabs");
      } else if (boardView()) {
        const labels = rows().filter((row) => row.kind === "group");
        const selectedRow = rows()[selected()];
        if (selectedRow?.kind === "issue") columnSelection.set(labels[column()]?.label, selectedRow.issue.key);
        const next = Math.max(0, Math.min(groups().length - 1, column() + delta));
        setColumn(next);
        const indexes = groups()[next] ?? [];
        const remembered = columnSelection.get(labels[next]?.label);
        setSelected(indexes.find((index) => rows()[index].issue.key === remembered) ?? indexes[0] ?? -1);
      } else if (ticket() && focus() === "body") scrollRefs.get("body")?.scrollBy({
        x: delta * 4,
        y: 0
      });
    }
    function cycleFocus(delta) {
      const regions = ticket() ? ["body", "relationships", "back", "comment"] : view() === "epics" || drillEpic() ? ["content", "tabs", "details", "back"] : ["content", "tabs", "back"];
      setFocus(regions[(Math.max(0, regions.indexOf(focus())) + delta + regions.length) % regions.length]);
    }
    function addComment() {
      const issue = ticket()?.issue;
      if (!issue || !boardInputEnabled()) return;
      const site = ticket()?.site;
      if (!site || site !== cfg().site) return;
      generation++;
      directIntent++;
      clearRetry();
      setLoading(false);
      setComposer({
        key: issue.key,
        site,
        initial: drafts.get(`${site}|${issue.key}`) ?? ""
      });
    }
    function openLink(href) {
      const safe = safeUrl(href);
      if (!safe) return;
      const url = new URL(safe), internal = /^\/browse\/([A-Z][A-Z0-9_]*-\d+)$/.exec(url.pathname);
      if (url.hostname === cfg().site && internal) void openIssue(internal[1]);
      else execFile("open", [safe], () => void 0);
    }
    async function runAction(kind) {
      const target = ticket();
      if (target?.site && target.site !== cfg().site) return;
      await runTicketAction({
        context,
        issue: currentIssue,
        client: () => target?.site ? new JiraClient(target.site) : client(),
        accountId,
        setAccountId,
        board,
        sprint,
        message,
        refresh: async () => {
          cache.clear();
          if (target && ticket()?.issue.key === target.issue.key && ticket()?.site === target.site) await openIssue(target.issue.key, true);
          else if (ticket()) return;
          else await load({
            refresh: true
          });
        }
      }, kind);
    }
    const openInBrowser = () => {
      const url = safeUrl(currentIssue()?.url);
      if (url) execFile("open", [url], () => void 0);
    };
    function copyKey() {
      const issue = currentIssue();
      if (!issue) return;
      const child = execFile("pbcopy", () => void 0);
      child.stdin?.end(issue.key);
      context.ui.toast.show({
        message: `${issue.key} copied`
      });
    }
    const {
      pickAssignee,
      pickType,
      search,
      configure
    } = filters({
      context,
      cfg,
      assignee,
      type: typeFilter,
      rows,
      setAssignee,
      setType: setTypeFilter,
      setText,
      updateSettings,
      message,
      reset: () => {
        settingsEpoch++;
        generation++;
        directIntent++;
        clearRetry();
        setTicket(void 0);
        setComposer(void 0);
        setHistory([]);
        setDrillEpic(null);
        setGraphKey(null);
        setRows([]);
        setWorkspaceRows([]);
        setColumn(0);
        setSelected(0);
        setView("mine");
        setFocus("content");
        setAccountId(null);
        setMyCount(null);
        columnSelection.clear();
        scrollRefs.clear();
        rememberedScroll = {};
        setBoard(void 0);
        setSprint(void 0);
        cache.clear();
      },
      load: (refresh) => load({
        refresh
      })
    });
    function switchView(next) {
      if (!boardInputEnabled()) return;
      if (next === "issue") {
        const issue = currentIssue();
        if (issue) return void openIssue(issue.key);
      }
      generation++;
      directIntent++;
      setHistory([]);
      setTicket(void 0);
      setColumn(0);
      setFocus("tabs");
      rememberedScroll = {};
      retryRead = void 0;
      setView(next);
      setDrillEpic(null);
      setGraphKey(null);
      void load();
    }
    function activate() {
      if (focus() === "tabs") {
        setFocus("content");
        return;
      }
      if (focus() === "back") return back();
      if (focus() === "comment") return addComment();
      if (focus() === "details") {
        const key = drillEpic() ?? currentIssue()?.key;
        if (key) void openIssue(key);
        return;
      }
      if (ticket()) {
        if (focus() !== "relationships") return;
        const row2 = rows()[selected()];
        if (row2?.kind === "issue") void openIssue(row2.issue.key);
        else if (row2?.kind === "link") openLink(row2.href);
        return;
      }
      const row = rows()[selected()];
      if (view() === "backlog" && row?.kind === "group" && row.key) return void openIssue(row.key);
      const issue = currentIssue();
      if (!issue) return;
      if (view() === "epics" && !drillEpic()) {
        return void openChildren(issue.key);
      }
      return void openIssue(issue.key);
    }
    context.ui.router.register({
      name: "jira",
      render: () => _$createComponent4(JiraApp, {})
    });
    function boardInputEnabled() {
      const route = context.ui.router.current();
      return route.type === "plugin" && route.name === "jira" && !composer() && context.keymap.mode.current() === "base";
    }
    function JiraApp() {
      const ctx = context;
      const resize = () => setWidth(context.renderer?.width ?? 80);
      context.renderer?.on?.("resize", resize);
      onCleanup2(() => {
        context.renderer?.off?.("resize", resize);
        generation++;
      });
      ctx.keymap.layer(() => ({
        mode: "base",
        priority: 40,
        enabled: boardInputEnabled,
        commands: workspaceCommands({
          move,
          horizontal,
          cycleFocus,
          addComment,
          activate,
          openInBrowser,
          copyKey,
          runAction,
          pickAssignee,
          pickType,
          search,
          showGraph,
          configure,
          back,
          switchView,
          refresh: () => retryRead ? retryRead() : ticket() ? void openIssue(ticket().issue.key, true) : graphKey() ? void showGraph(true) : void load({
            refresh: true
          })
        })
      }));
      const header = createMemo2(() => {
        const s = cfg();
        const parts = [s.projectKey];
        const b = board();
        if (b) parts.push(b.name);
        const active = sprint();
        if (active && view() === "sprint") parts.push(`${active.name} (${sprintDaysLeft(active)})`);
        parts.push(`assignee:${ASSIGNEE_LABELS[assignee()]}`);
        if (typeFilter()) parts.push(`type:${typeFilter()}`);
        if (text()) parts.push(`text:"${text()}"`);
        if (drillEpic()) parts.push(`epic:${drillEpic()}`);
        return parts.join("  \xB7  ");
      });
      const footer = createMemo2(() => {
        if (loading()) return `loading\u2026 ${status()}`;
        if (error()) return `error: ${error()}`;
        return width() < 44 && !composer() ? "Tab Esc/q" : screenHint(width(), focus(), !!ticket(), boardView(), !!composer());
      });
      return (() => {
        var _el$ = _$createElement5("box"), _el$2 = _$createElement5("box"), _el$3 = _$createElement5("text"), _el$5 = _$createElement5("text"), _el$6 = _$createElement5("box"), _el$7 = _$createElement5("text");
        _$insertNode4(_el$, _el$2);
        _$insertNode4(_el$, _el$6);
        _$setProp5(_el$, "flexDirection", "column");
        _$setProp5(_el$, "width", "100%");
        _$setProp5(_el$, "height", "100%");
        _$setProp5(_el$, "paddingLeft", 1);
        _$setProp5(_el$, "paddingRight", 1);
        _$insertNode4(_el$2, _el$3);
        _$insertNode4(_el$2, _el$5);
        _$setProp5(_el$2, "flexDirection", "row");
        _$setProp5(_el$2, "height", 1);
        _$setProp5(_el$2, "flexShrink", 0);
        _$insertNode4(_el$3, _$createTextNode3(`JIRA `));
        _$insert5(_el$5, header);
        _$insert5(_el$, _$createComponent4(ViewTabs, {
          context: ctx,
          get view() {
            return view();
          },
          get focus() {
            return focus();
          },
          get width() {
            return width();
          },
          switchView
        }), _el$6);
        _$insert5(_el$, _$createComponent4(WorkspaceViewport, {
          context: ctx,
          get rows() {
            return _$memo4(() => !!ticket())() ? workspaceRows() : rows();
          },
          get selected() {
            return selected();
          },
          get workspaceSelected() {
            return workspaceSelected();
          },
          get board() {
            return _$memo4(() => !!ticket())() ? workspaceBoard : boardView();
          },
          get column() {
            return _$memo4(() => !!ticket())() ? workspaceColumn() : column();
          },
          get width() {
            return width();
          },
          get loading() {
            return loading();
          },
          get ticket() {
            return ticket();
          },
          get composer() {
            return composer();
          },
          get focus() {
            return focus();
          },
          get detailsKey() {
            return drillEpic() ?? (view() === "epics" ? currentIssue()?.key : void 0);
          },
          enabled: boardInputEnabled,
          register: registerScroll,
          openKey: (key) => void openIssue(key),
          open: (index) => {
            setSelected(index);
            setFocus("content");
            activate();
          },
          relationship: (index) => {
            setSelected(index);
            setFocus("relationships");
            activate();
          },
          back,
          comment: addComment,
          link: openLink,
          save: (value) => {
            const state = composer();
            if (state) drafts.set(`${state.site}|${state.key}`, value);
          },
          close: () => setComposer(void 0),
          send: (value, state) => {
            return new JiraClient(state.site).addComment(state.key, value);
          },
          success: (state) => {
            drafts.delete(`${state.site}|${state.key}`);
            if (disposed || composer()?.key !== state.key || composer()?.site !== state.site) return;
            setComposer(void 0);
            setFocus("body");
            cache.clear();
            void openIssue(state.key, true);
          }
        }), _el$6);
        _$insertNode4(_el$6, _el$7);
        _$setProp5(_el$6, "flexDirection", "row");
        _$setProp5(_el$6, "height", 1);
        _$setProp5(_el$6, "flexShrink", 0);
        _$insert5(_el$6, _$createComponent4(SessionReturnControl, {
          context: ctx,
          get width() {
            return width();
          },
          get nested() {
            return history().length > 0;
          },
          get focused() {
            return focus() === "back";
          },
          back
        }), _el$7);
        _$setProp5(_el$7, "selectable", false);
        _$insert5(_el$7, () => terminalText(footer()));
        _$effect5((_p$) => {
          var _v$ = color(ctx, "accent"), _v$2 = color(ctx, "muted"), _v$3 = error() ? color(ctx, "error") : color(ctx, "muted"), _v$4 = leftClick(() => {
            if (error() && boardInputEnabled()) {
              if (retryRead) retryRead();
              else void load({
                refresh: true
              });
            }
          });
          _v$ !== _p$.e && (_p$.e = _$setProp5(_el$3, "fg", _v$, _p$.e));
          _v$2 !== _p$.t && (_p$.t = _$setProp5(_el$5, "fg", _v$2, _p$.t));
          _v$3 !== _p$.a && (_p$.a = _$setProp5(_el$7, "fg", _v$3, _p$.a));
          _v$4 !== _p$.o && (_p$.o = _$setProp5(_el$7, "onMouseUp", _v$4, _p$.o));
          return _p$;
        }, {
          e: void 0,
          t: void 0,
          a: void 0,
          o: void 0
        });
        return _el$;
      })();
    }
    registerEntry({
      context,
      composer,
      configure,
      load,
      openIssue,
      captureRoute: (route) => {
        hostRoute = route;
      },
      invalidate: () => {
        generation++;
        clearRetry();
        return ++directIntent;
      },
      generation: () => generation,
      valid: (intent, request) => intent === directIntent && request === generation && !disposed && boardInputEnabled(),
      reset: () => {
        setTicket(void 0);
        setHistory([]);
        setView("mine");
        setDrillEpic(null);
        setGraphKey(null);
        setFocus("content");
      }
    });
    const stopBadge = context.ui.slot({
      append: "home.footer.status",
      render: () => (() => {
        var _el$8 = _$createElement5("text");
        _$insert5(_el$8, (() => {
          var _c$ = _$memo4(() => myCount() === null);
          return () => _c$() ? "JIRA \u2026" : `JIRA ${myCount()}`;
        })());
        _$effect5((_$p) => _$setProp5(_el$8, "fg", color(context, "muted"), _$p));
        return _el$8;
      })()
    });
    try {
      const epoch = settingsEpoch;
      const jql = `project = ${cfg().projectKey} AND assignee = currentUser() AND resolution = Unresolved`;
      void client().search(jql, {
        cap: 100
      }).then((result) => {
        if (!disposed && epoch === settingsEpoch) setMyCount(result.issues.length);
      }).catch(() => {
        if (!disposed && epoch === settingsEpoch) setMyCount(null);
      });
    } catch {
      setMyCount(null);
    }
    return () => {
      disposed = true;
      generation++;
      stopBadge();
    };
  }
};
export {
  tui_default as default
};
