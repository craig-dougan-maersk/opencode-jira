import type { JiraClient } from "../lib/jira.ts";
import type { Issue, BoardConfig, SprintInfo } from "../lib/types.ts";
interface Options {
  context: any;
  issue(): Issue | undefined;
  client(): JiraClient;
  accountId(): string | null;
  setAccountId(value: string): void;
  board(): BoardConfig | undefined;
  sprint(): SprintInfo | undefined;
  refresh(): Promise<void>;
  message(error: unknown): string;
}
export async function runTicketAction(
  a: Options,
  kind: "transition" | "assign" | "unassign" | "sprint",
) {
  const issue = a.issue();
  if (!issue) {
    a.context.ui.toast.show({
      message: "No issue selected",
      variant: "warning",
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
          variant: "warning",
        });
        return;
      }
      const picked = await a.context.ui.dialog.select({
        title: `Move ${issue.key}`,
        options: transitions.map((t) => ({
          title: t.to?.name ?? t.name,
          value: t.id,
        })),
      });
      if (!picked) return;
      await c.transition(issue.key, String(picked));
      a.context.ui.toast.show({
        message: `${issue.key} moved`,
        variant: "success",
      });
    } else if (kind === "assign") {
      const me = a.accountId() ?? (await c.me());
      a.setAccountId(me);
      await c.assign(issue.key, me);
      a.context.ui.toast.show({
        message: `${issue.key} assigned to you`,
        variant: "success",
      });
    } else if (kind === "unassign") {
      const confirmed = await a.context.ui.dialog.confirm({
        title: `Unassign ${issue.key}?`,
        message: issue.summary,
        label: { confirm: "Unassign", cancel: "Cancel" },
      });
      if (!confirmed) return;
      await c.assign(issue.key, null);
      a.context.ui.toast.show({
        message: `${issue.key} unassigned`,
        variant: "success",
      });
    } else {
      const current = a.board(),
        active =
          a.sprint() ??
          (current ? await c.activeSprint(current.id) : undefined);
      if (!active) {
        a.context.ui.toast.show({
          message: "No active sprint",
          variant: "warning",
        });
        return;
      }
      const confirmed = await a.context.ui.dialog.confirm({
        title: `Add ${issue.key} to ${active.name}?`,
        message: issue.summary,
        label: { confirm: "Add", cancel: "Cancel" },
      });
      if (!confirmed) return;
      await c.addToSprint(active.id, [issue.key]);
      a.context.ui.toast.show({
        message: `${issue.key} added to ${active.name}`,
        variant: "success",
      });
    }
    await a.refresh();
  } catch (e) {
    a.context.ui.toast.show({
      title: "Jira",
      message: a.message(e),
      variant: "error",
      duration: 8000,
    });
  }
}
