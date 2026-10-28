export function registerEntry(a: {
  context: any;
  composer(): unknown;
  captureRoute(route: any): void;
  invalidate(): number;
  valid(intent: number, generation: number): boolean;
  generation(): number;
  reset(): void;
  load(): Promise<void>;
  openIssue(key: string): Promise<void>;
  configure(): Promise<void>;
}) {
  a.context.keymap.layer(() => ({
    mode: "global",
    commands: [
      {
        id: "jira.open",
        title: "Jira board",
        description:
          "My tickets, the active sprint, the backlog, epics and dependencies",
        group: "Jira",
        palette: true,
        slash: { name: "jira", arguments: true },
        run: async (input?: string) => {
          if (a.composer()) return;
          const route = a.context.ui.router.current();
          // V2 router.current() is a stable reactive store, not an immutable route.
          // Copy before navigate() reconciles that same proxy into the Jira route.
          if (route.type !== "plugin" || route.name !== "jira")
            a.captureRoute({
              ...route,
              ...(route.data ? { data: { ...route.data } } : {}),
            });
          const intent = a.invalidate();
          a.reset();
          a.context.ui.router.navigate({
            type: "plugin",
            name: "jira",
            data: {},
          });
          const key = (input ?? "").trim().toUpperCase();
          const baseline = a.load(),
            generation = a.generation();
          if (/^[A-Z]+-\d+$/.test(key)) {
            await baseline;
            if (a.valid(intent, generation)) void a.openIssue(key);
          }
        },
      },
      {
        id: "jira.settings.command",
        title: "Jira: settings",
        group: "Jira",
        palette: true,
        run: () => {
          if (!a.composer()) void a.configure();
        },
      },
    ],
  }));
}
