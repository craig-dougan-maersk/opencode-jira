import type { JiraClient } from "./jira.ts";
import { toIssueDetail } from "./model.ts";
import { projectAdf } from "./adf.ts";
import type { Issue } from "./types.ts";
import type { Row, Ticket } from "../ui/types.ts";
/** All fallible reads and untrusted projection complete before navigation commits. */
export async function readTicket(c: JiraClient, key: string): Promise<Ticket> {
  const issue = toIssueDetail(await c.issue(key), c.site);
  const children =
    issue.type === "Epic"
      ? await c
          .search(`parent = ${key} ORDER BY Rank ASC`, { cap: 300 })
          .catch(() => ({ issues: [] as Issue[], truncated: true }))
      : undefined;
  const epic =
    issue.epicKey && issue.epicKey !== key
      ? await c
          .issue(issue.epicKey)
          .then((raw) => toIssueDetail(raw, c.site))
          .catch(() => null)
      : null;
  const out: Row[] = [];
  if (issue.parent)
    out.push(
      { kind: "group", label: "Parent", count: 1 },
      { kind: "issue", issue: issue.parent, note: "parent" },
    );
  if (epic)
    out.push(
      { kind: "group", label: "Epic", count: 1 },
      { kind: "issue", issue: epic, note: "epic" },
    );
  if (issue.links.length) {
    out.push({
      kind: "group",
      label: "Links & dependencies",
      count: issue.links.length,
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
          url: `https://${c.site}/browse/${link.key}`,
        },
        note: `${link.direction} · ${link.label}`,
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
      tone: "warning",
    });
  const blocks = projectAdf(issue.descriptionAdf ?? issue.description);
  for (const block of blocks)
    if (block.href)
      out.push({ kind: "link", label: block.text, href: block.href });
  return { issue, site: c.site, blocks, relationships: out };
}
