import type { JiraClient } from "../lib/jira.ts";
import type { Issue, BoardConfig, SprintInfo } from "../lib/types.ts";
import {
  boardColumns,
  boardColumnForStatus,
  transitionForColumn,
  type BoardColumn,
} from "../lib/model.ts";
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

/** The board's columns, or an empty list when no board definition is loaded. */
function columnsFor(a: Options) {
  const config = a.board();
  return config ? boardColumns(config.columns) : [];
}

/**
 * Move the selected issue to an adjacent board column, transitioning it to a
 * status the column owns. Confirms before the write; a column with no direct
 * transition or an unmapped status leaves the issue untouched.
 */
export async function moveToColumn(a: Options, delta: number) {
  const issue = a.issue();
  if (!issue) {
    a.context.ui.toast.show({
      message: "No issue selected",
      variant: "warning",
    });
    return;
  }
  const columns = columnsFor(a);
  if (columns.length < 2) {
    a.context.ui.toast.show({
      message: "No board columns to move between",
      variant: "warning",
    });
    return;
  }
  const current = boardColumnForStatus(columns, issue.statusId);
  if (current < 0) {
    a.context.ui.toast.show({
      message: `${issue.key} is not on a board column`,
      variant: "warning",
    });
    return;
  }
  const target = current + delta;
  if (target < 0 || target >= columns.length) {
    a.context.ui.toast.show({
      message: `No ${delta < 0 ? "earlier" : "later"} column`,
      variant: "warning",
    });
    return;
  }
  await applyColumnMove(a, issue, columns[target]);
}

/**
 * Move a specific issue into the board column at an absolute index, as a drag
 * and drop targets a column directly rather than a neighbour. A drop onto the
 * issue's own column is a no-op; the target may be any column, not only an
 * adjacent one.
 */
export async function dropIntoColumn(
  a: Options,
  issue: Issue,
  columnIndex: number,
) {
  const columns = columnsFor(a);
  if (columns.length < 2) {
    a.context.ui.toast.show({
      message: "No board columns to move between",
      variant: "warning",
    });
    return;
  }
  if (columnIndex < 0 || columnIndex >= columns.length) return;
  if (boardColumnForStatus(columns, issue.statusId) === columnIndex) return;
  await applyColumnMove(a, issue, columns[columnIndex]);
}

/** Transition an issue to a status the target column owns, after confirming. */
async function applyColumnMove(a: Options, issue: Issue, column: BoardColumn) {
  const c = a.client();
  try {
    const match = transitionForColumn(
      (await c.transitions(issue.key)).map((transition) => ({
        id: transition.id,
        name: transition.name,
        toId: transition.to?.id,
      })),
      column,
    );
    if (!match) {
      a.context.ui.toast.show({
        message: `No transition from ${issue.status} to ${column.name}`,
        variant: "warning",
      });
      return;
    }
    const confirmed = await a.context.ui.dialog.confirm({
      title: `Move ${issue.key} to ${column.name}?`,
      message: `${issue.summary}\n${issue.status} → ${column.name} (${match.name})`,
      label: { confirm: "Move", cancel: "Cancel" },
    });
    if (!confirmed) return;
    await c.transition(issue.key, match.id);
    a.context.ui.toast.show({
      message: `${issue.key} → ${column.name}`,
      variant: "success",
    });
  } catch (e) {
    a.context.ui.toast.show({
      title: "Jira",
      message: a.message(e),
      variant: "error",
      duration: 8000,
    });
  }
  await a.refresh();
}

/** Send the selected issue to the board backlog, removing it from any sprint. */
export async function sendToBacklog(a: Options) {
  const issue = a.issue();
  if (!issue) {
    a.context.ui.toast.show({
      message: "No issue selected",
      variant: "warning",
    });
    return;
  }
  try {
    await a.client().sendToBacklog([issue.key]);
    a.context.ui.toast.show({
      message: `${issue.key} sent to backlog`,
      variant: "success",
    });
  } catch (e) {
    a.context.ui.toast.show({
      title: "Jira",
      message: a.message(e),
      variant: "error",
      duration: 8000,
    });
  }
  await a.refresh();
}
