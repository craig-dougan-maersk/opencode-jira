import type { JiraClient } from "./jira.ts";
import type { BoardConfig, Issue, ViewName } from "./types.ts";
import { groupByColumn, groupByEpic } from "./model.ts";
import type { Row } from "../ui/types.ts";
import { flattenTree, dependencyGraph } from "./graph.ts";
export async function graphRows(c: JiraClient, key: string, depth: number) {
  const result = await dependencyGraph(c, key, depth);
  const rows: Row[] = [
    {
      kind: "group",
      label: `Dependency tree · ${key}`,
      count: result.nodes.length,
    },
  ];
  if (!result.nodes.length)
    rows.push({ kind: "text", text: "No dependency links.", tone: "muted" });
  for (const node of flattenTree(result.nodes))
    rows.push({
      kind: "issue",
      issue: node.issue,
      note: `${"  ".repeat(node.depth - 1)}${node.edge}`.trim(),
    });
  if (result.truncated)
    rows.push({
      kind: "text",
      text: `Depth limit ${depth} reached.`,
      tone: "warning",
    });
  if (result.cycles.length)
    rows.push({
      kind: "text",
      text: `Cycles skipped: ${result.cycles.join(", ")}`,
      tone: "warning",
    });
  return { rows, count: result.nodes.length };
}
const BATCH = 50;
function chunks<T>(items: readonly T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  );
}
/** Failed or capped auxiliary reads remain unknown, never an invented zero. */
export async function childCounts(c: JiraClient, keys: readonly string[]) {
  const counts = new Map<string, { childCount: number; doneCount: number }>();
  for (const batch of chunks(keys, BATCH)) {
    const result = await c
      .search(`parent in (${batch.join(", ")})`, { cap: 1500 })
      .catch(() => ({ issues: [] as Issue[], truncated: true }));
    if (result.truncated) continue;
    for (const key of batch) counts.set(key, { childCount: 0, doneCount: 0 });
    for (const issue of result.issues) {
      const key = issue.parentKey ?? issue.epicKey;
      if (!key) continue;
      const entry = counts.get(key) ?? { childCount: 0, doneCount: 0 };
      counts.set(key, {
        childCount: entry.childCount + 1,
        doneCount: entry.doneCount + (issue.statusCategory === "Done" ? 1 : 0),
      });
    }
  }
  return counts;
}
export async function groupRows(
  c: JiraClient,
  issues: Issue[],
  config: BoardConfig,
  truncated: boolean,
  target: ViewName,
): Promise<Row[]> {
  const out: Row[] = [];
  if (target === "backlog") {
    const keys = [
      ...new Set(
        issues
          .map((issue) => issue.epicKey)
          .filter((key): key is string => !!key),
      ),
    ];
    const titles = new Map<string, string>();
    for (const batch of chunks(keys, BATCH)) {
      const result = await c
        .search(`key in (${batch.join(", ")})`, {
          fields: ["summary"],
          cap: 300,
        })
        .catch(() => ({ issues: [] as Issue[] }));
      for (const issue of result.issues) titles.set(issue.key, issue.summary);
    }
    for (const group of groupByEpic(issues, titles)) {
      out.push({
        kind: "group",
        label: group.epicKey
          ? `${group.epicKey} · ${titles.get(group.epicKey) ?? "title unavailable"}`
          : "No epic",
        key: group.epicKey ?? undefined,
        count: group.issues.length,
      });
      for (const issue of group.issues) out.push({ kind: "issue", issue });
    }
  } else {
    for (const group of groupByColumn(issues, config.columns)) {
      out.push({
        kind: "group",
        label: group.column,
        count: group.issues.length,
      });
      for (const issue of group.issues) out.push({ kind: "issue", issue });
    }
  }
  if (truncated)
    out.push({
      kind: "text",
      text: "Result truncated at the page cap.",
      tone: "warning",
    });
  return out;
}
