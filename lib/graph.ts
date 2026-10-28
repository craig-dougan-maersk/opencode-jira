import type { JiraClient } from "./jira.ts";
import { toIssue } from "./jira.ts";
import { DEPENDENCY_LINK_TYPES, FIELD } from "./fields.ts";
import type { Issue, IssueLink } from "./types.ts";

export interface TreeNode {
  readonly issue: Issue;
  readonly edge: string;
  readonly depth: number;
  readonly children: readonly TreeNode[];
}

/**
 * Walk the parent chain upwards (Epic -> Story -> Sub-task) and the subtask
 * children downwards, so the detail view can show where an issue sits.
 */
export async function hierarchy(
  client: JiraClient,
  key: string,
  signal?: AbortSignal,
) {
  const chain: Issue[] = [];
  const seen = new Set<string>([key]);
  let current = key;
  for (let hop = 0; hop < 4; hop++) {
    const raw = await client.issue(current, signal);
    const issue = toIssue(raw, client.site);
    chain.unshift(issue);
    const parentKey = issue.parentKey ?? issue.epicKey;
    if (!parentKey || seen.has(parentKey)) break;
    seen.add(parentKey);
    current = parentKey;
  }
  const raw = await client.issue(key, signal);
  const children = (raw.fields?.subtasks ?? []).map(
    (sub: Record<string, any>) => toIssue(sub, client.site),
  );
  return { chain, children };
}

export interface LinkGraph {
  readonly nodes: readonly TreeNode[];
  readonly truncated: boolean;
  readonly cycles: readonly string[];
}

/**
 * Follow dependency links outward from a key, breadth first, cycle safe and
 * depth limited. Blocking links are kept; the caller decides how to render.
 */
export async function dependencyGraph(
  client: JiraClient,
  key: string,
  maxDepth = 2,
  signal?: AbortSignal,
): Promise<LinkGraph> {
  const visited = new Set<string>();
  const cycles: string[] = [];
  let truncated = false;

  const rootRaw = await client.issue(key, signal);
  const rootIssue = toIssue(rootRaw, client.site);

  const expand = async (
    issueKey: string,
    edge: string,
    depth: number,
  ): Promise<TreeNode> => {
    const raw = await client.issue(issueKey, signal);
    const detail = toIssue(raw, client.site);
    const links: IssueLink[] = [];
    for (const link of raw.fields?.issuelinks ?? []) {
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
        blocking: link.type?.name === "Blocks",
      });
    }
    const children: TreeNode[] = [];
    if (depth < maxDepth) {
      for (const link of links) {
        if (visited.has(link.key)) {
          cycles.push(`${issueKey} -> ${link.key}`);
          continue;
        }
        visited.add(link.key);
        children.push(await expand(link.key, link.label, depth + 1));
      }
    } else if (links.length > 0) {
      truncated = true;
    }
    return { issue: detail, edge, depth, children };
  };

  visited.add(key);
  const nodes: TreeNode[] = [];
  const links: IssueLink[] = [];
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
      blocking: link.type?.name === "Blocks",
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

/** Flatten a tree into render rows, one line per node. */
export function flattenTree(
  nodes: readonly TreeNode[],
): { issue: Issue; edge: string; depth: number }[] {
  const rows: { issue: Issue; edge: string; depth: number }[] = [];
  const walk = (list: readonly TreeNode[]) => {
    for (const node of list) {
      rows.push({ issue: node.issue, edge: node.edge, depth: node.depth });
      walk(node.children);
    }
  };
  walk(nodes);
  return rows;
}

export { FIELD };
