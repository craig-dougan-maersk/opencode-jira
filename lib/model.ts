import { FIELD } from "./fields.ts";
import { toIssue, truncate } from "./jira.ts";
import type {
  AssigneeFilter,
  Column,
  FilterState,
  Issue,
  IssueDetail,
  IssueLink,
  ViewName,
} from "./types.ts";

const UNRESOLVED = "resolution = Unresolved";

function quote(value: string) {
  return `"${value.replace(/["\\]/g, "\\$&")}"`;
}

/**
 * A board filter is a complete JQL string, ORDER BY included. Drop the clause
 * so it can be composed with the view's own conditions.
 */
export function stripOrder(jql: string | undefined): string {
  if (!jql) return "";
  return jql.replace(/\s+ORDER\s+BY\s+[\s\S]*$/i, "").trim();
}

/** The JQL that a given view runs, before any text/type filters are applied. */
export function buildJql(input: {
  view: ViewName;
  projectKey: string;
  boardJql?: string;
  assignee: AssigneeFilter;
  filter: FilterState;
  sprintId?: number;
  epicKey?: string;
}): string {
  const scope =
    stripOrder(input.boardJql) || `project = ${quote(input.projectKey)}`;
  const clauses: string[] = [];

  switch (input.view) {
    case "mine":
      clauses.push(scope, UNRESOLVED);
      break;
    case "sprint":
      clauses.push(
        input.sprintId ? `sprint = ${input.sprintId}` : scope,
        UNRESOLVED,
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
        UNRESOLVED,
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

  const order =
    input.view === "mine" ? "ORDER BY updated DESC" : "ORDER BY Rank ASC";
  return `${clauses.filter(Boolean).join(" AND ")} ${order}`;
}

export function assigneeClause(filter: AssigneeFilter): string {
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

/** Apply an assignee filter in memory, for endpoints that cannot take JQL. */
export function applyAssigneeFilter(
  issues: readonly Issue[],
  filter: AssigneeFilter,
  me: string | null,
): Issue[] {
  if (filter === "all") return [...issues];
  return issues.filter((issue) => {
    if (filter === "unassigned") return !issue.assigneeId;
    if (filter === "mine") return !!me && issue.assigneeId === me;
    return !!issue.assigneeId && issue.assigneeId !== me;
  });
}

export function applyTextFilter(
  issues: readonly Issue[],
  filter: FilterState,
): Issue[] {
  const text = filter.text.trim().toLowerCase();
  return issues.filter((issue) => {
    if (filter.type && issue.type !== filter.type) return false;
    if (!text) return true;
    return (
      issue.key.toLowerCase().includes(text) ||
      issue.summary.toLowerCase().includes(text) ||
      (issue.assignee ?? "").toLowerCase().includes(text) ||
      issue.status.toLowerCase().includes(text)
    );
  });
}

export interface ColumnGroup {
  readonly column: string;
  readonly issues: readonly Issue[];
}

/** Place each issue in the board column that owns its status. */
export function groupByColumn(
  issues: readonly Issue[],
  columns: readonly Column[],
): ColumnGroup[] {
  const byStatus = new Map<string, string>();
  for (const column of columns)
    for (const statusId of column.statusIds)
      byStatus.set(statusId, column.name);

  // The board definition can repeat a column name (empty columns and split
  // "In Review" entries); keep first-seen order and merge by name.
  const order: string[] = [];
  for (const column of columns)
    if (!order.includes(column.name)) order.push(column.name);

  const buckets = new Map<string, Issue[]>();
  for (const issue of issues) {
    const column = byStatus.get(issue.statusId) ?? "Unmapped";
    const bucket = buckets.get(column);
    if (bucket) bucket.push(issue);
    else buckets.set(column, [issue]);
  }
  const names = [
    ...order,
    ...[...buckets.keys()].filter((name) => !order.includes(name)),
  ];
  return names.map((name) => ({
    column: name,
    issues: buckets.get(name) ?? [],
  }));
}

export interface EpicGroup {
  readonly epicKey: string | null;
  readonly epicSummary: string;
  readonly issues: readonly Issue[];
}

/** Group issues by epic link, keeping the incoming order inside each group. */
export function groupByEpic(
  issues: readonly Issue[],
  epicTitles: ReadonlyMap<string, string>,
): EpicGroup[] {
  const groups = new Map<string, Issue[]>();
  for (const issue of issues) {
    const key = issue.epicKey ?? "";
    const bucket = groups.get(key);
    if (bucket) bucket.push(issue);
    else groups.set(key, [issue]);
  }
  const named: EpicGroup[] = [];
  const orphans: Issue[] = groups.get("") ?? [];
  for (const [key, bucket] of groups) {
    if (!key) continue;
    named.push({
      epicKey: key,
      epicSummary: epicTitles.get(key) ?? key,
      issues: bucket,
    });
  }
  named.sort((a, b) => a.epicSummary.localeCompare(b.epicSummary));
  if (orphans.length)
    named.push({ epicKey: null, epicSummary: "No epic", issues: orphans });
  return named;
}

export function toIssueDetail(
  raw: { key: string; fields: Record<string, any> },
  site: string,
): IssueDetail {
  const base = toIssue(raw, site);
  const fields = raw.fields ?? {};
  const links: IssueLink[] = [];
  for (const link of fields.issuelinks ?? []) {
    if (link.outwardIssue) {
      links.push({
        type: link.type?.name ?? "Link",
        direction: "outward",
        label: link.type?.outward ?? link.type?.name ?? "links to",
        key: link.outwardIssue.key,
        summary: link.outwardIssue.fields?.summary ?? "",
        status: link.outwardIssue.fields?.status?.name ?? "",
        blocking: link.type?.name === "Blocks",
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
        blocking: link.type?.name === "Blocks",
      });
    }
  }
  return {
    ...base,
    description: flattenDescription(fields.description),
    descriptionAdf: fields.description,
    links,
    subtasks: (fields.subtasks ?? []).map((sub: Record<string, any>) =>
      toIssue(sub, site),
    ),
    parent: fields.parent
      ? toIssue(
          { key: fields.parent.key, fields: fields.parent.fields ?? {} },
          site,
        )
      : null,
    epic: null,
  };
}

/** Atlassian document format to plain text, best effort. */
export function flattenDescription(node: unknown): string | null {
  if (!node) return null;
  if (typeof node === "string") return truncate(node, 4000);
  const parts: string[] = [];
  let remaining = 4000,
    budget = 20000;
  const walk = (current: any, depth = 0) => {
    if (budget-- <= 0 || depth > 32 || remaining <= 0) return;
    if (!current || typeof current !== "object") return;
    if (current.type === "text" && typeof current.text === "string") {
      const text = current.text.slice(0, remaining);
      parts.push(text);
      remaining -= text.length;
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
  const text = parts
    .join("")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text ? truncate(text, 4000) : null;
}

export function epicProgress(children: readonly Issue[]) {
  const done = children.filter(
    (child) => child.statusCategory === "Done",
  ).length;
  return { childCount: children.length, doneCount: done };
}

export function age(iso: string): string {
  if (!iso) return "";
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  if (Number.isNaN(days)) return "";
  if (days <= 0) return "today";
  if (days === 1) return "1d";
  if (days < 30) return `${days}d`;
  return `${Math.floor(days / 30)}mo`;
}

export function sprintDaysLeft(sprint: { endDate?: string }): string {
  if (!sprint.endDate) return "";
  const days = Math.ceil(
    (Date.parse(sprint.endDate) - Date.now()) / 86_400_000,
  );
  if (Number.isNaN(days)) return "";
  if (days < 0) return `${Math.abs(days)}d over`;
  if (days === 0) return "ends today";
  return `${days}d left`;
}

export { FIELD };
