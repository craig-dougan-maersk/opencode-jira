import { JiraClient } from "../lib/jira.ts";
import type { AssigneeFilter, JiraSettings } from "../lib/types.ts";
import type { Row } from "./types.ts";
interface Options {
  context: any;
  cfg(): JiraSettings;
  assignee(): AssigneeFilter;
  type(): string | null;
  rows(): Row[];
  setAssignee(value: AssigneeFilter): void;
  setType(value: string | null): void;
  setText(value: string): void;
  updateSettings(mutation: (draft: JiraSettings) => void): Promise<void>;
  reset(): void;
  load(refresh?: boolean): Promise<void>;
  message(error: unknown): string;
}
export function filters(a: Options) {
  const pickAssignee = async () => {
    const order: AssigneeFilter[] = ["mine", "others", "unassigned", "all"];
    const picked = await a.context.ui.dialog.select({
      title: "Assignee filter",
      current: a.assignee(),
      options: order.map((value) => ({ title: value, value })),
    });
    if (!picked) return;
    a.setAssignee(picked as AssigneeFilter);
    await a.load();
  };
  const pickType = async () => {
    const types = [
      ...new Set(
        a
          .rows()
          .flatMap((row) => (row.kind === "issue" ? [row.issue.type] : [])),
      ),
    ].sort();
    const picked = await a.context.ui.dialog.select({
      title: "Issue type",
      current: a.type() ?? "any",
      options: [
        { title: "any", value: "any" },
        ...types.map((value) => ({ title: value, value })),
      ],
    });
    if (!picked) return;
    a.setType(picked === "any" ? null : String(picked));
    await a.load();
  };
  const search = async () => {
    const query = await a.context.ui.dialog.prompt({
      title: "Filter text",
      placeholder: "summary, key or assignee",
    });
    if (query === undefined) return;
    a.setText(query);
    await a.load();
  };
  const configure = async () => {
    const s = a.cfg();
    const site = await a.context.ui.dialog.prompt({
      title: "Atlassian site",
      placeholder: s.site,
    });
    if (site === undefined) return;
    const project = await a.context.ui.dialog.prompt({
      title: "Project key",
      placeholder: s.projectKey,
    });
    if (project === undefined) return;
    let boardId: number | null = s.boardId;
    try {
      const boards = await new JiraClient(site || s.site).boards(
        project || s.projectKey,
      );
      const picked = await a.context.ui.dialog.select({
        title: "Board",
        current: String(boardId ?? ""),
        options: boards.map((b) => ({
          title: `${b.name} (${b.type})`,
          value: String(b.id),
        })),
      });
      if (picked) boardId = Number(picked);
    } catch (e) {
      a.context.ui.toast.show({
        message: `Could not list boards: ${a.message(e)}`,
        variant: "warning",
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
      variant: "success",
    });
  };
  return { pickAssignee, pickType, search, configure };
}
