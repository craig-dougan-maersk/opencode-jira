export interface WorkspaceActions {
  move(delta: number): void;
  horizontal(delta: number): void;
  cycleFocus(delta: number): void;
  addComment(): void;
  activate(): void;
  openInBrowser(): void;
  copyKey(): void;
  runAction(
    kind: "transition" | "assign" | "unassign" | "sprint",
  ): Promise<void>;
  moveToColumn(delta: number): Promise<void>;
  sendToBacklog(): Promise<void>;
  pickAssignee(): Promise<void>;
  pickType(): Promise<void>;
  search(): Promise<void>;
  showGraph(): Promise<void>;
  configure(): Promise<void>;
  refresh(): void;
  back(): void;
  switchView(view: "mine" | "sprint" | "backlog" | "epics"): void;
}
export function workspaceCommands(a: WorkspaceActions) {
  const command = (id: string, bind: string, run: () => unknown) => ({
    id: `jira.${id}`,
    bind,
    run,
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
    command("move.left", "shift+left", () => void a.moveToColumn(-1)),
    command("move.right", "shift+right", () => void a.moveToColumn(1)),
    command("backlog", "b", () => void a.sendToBacklog()),
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
    ...(["mine", "sprint", "backlog", "epics"] as const).map((view, index) =>
      command(`view.${view}`, String(index + 1), () => a.switchView(view)),
    ),
  ];
}
export const VIEWS = [
  { id: "mine", label: "My Work" },
  { id: "sprint", label: "Sprint" },
  { id: "backlog", label: "Backlog" },
  { id: "epics", label: "Epics" },
  { id: "issue", label: "Issue" },
] as const;
export const ASSIGNEE_LABELS = {
  mine: "mine",
  others: "others",
  unassigned: "unassigned",
  all: "all",
} as const;
