import { execFile } from "node:child_process";
import { createMemo, createSignal, onCleanup } from "solid-js";
import { JiraClient, JiraError } from "./lib/jira.ts";
import {
  applyAssigneeFilter,
  applyTextFilter,
  buildJql,
  epicProgress,
  sprintDaysLeft,
  toIssueDetail,
} from "./lib/model.ts";
import type {
  AssigneeFilter,
  BoardConfig,
  FilterState,
  Issue,
  SprintInfo,
  ViewName,
} from "./lib/types.ts";
import { safeUrl, terminalText } from "./lib/adf.ts";
import {
  ROOT_VIEWS,
  pushScreen,
  popScreen,
  type FocusRegion,
} from "./lib/navigation.ts";
import { WorkspaceViewport } from "./ui/workspace.tsx";
import type { ComposerState } from "./ui/comment.tsx";
import {
  color,
  leftClick,
  type Row,
  type Scrolls,
  type ScrollHandle,
  type Ticket,
} from "./ui/types.ts";
import { childCounts, groupRows, graphRows } from "./lib/workspace-data.ts";
import { workspaceCommands, ASSIGNEE_LABELS } from "./ui/keymap.ts";
import { ViewTabs, screenHint, SessionReturnControl } from "./ui/chrome.tsx";
import { filters } from "./ui/filters.ts";
import { runTicketAction, moveToColumn, sendToBacklog } from "./ui/actions.ts";
import { readTicket } from "./lib/ticket.ts";
import { registerEntry } from "./ui/entry.ts";
function message(error: unknown): string {
  if (
    error instanceof JiraError &&
    error.message === "No active sprint on this board"
  )
    return error.message;
  if (error instanceof JiraError && error.message.startsWith("No boards found"))
    return "No boards available for this project.";
  if (error instanceof JiraError)
    return `Jira ${error.status || "unavailable"}; retry or check board access/configuration.`;
  return "Request failed; content may be stale. Retry or check Jira access/configuration.";
}
export default {
  id: "opencode-jira.tui",
  setup(context: any) {
    const stored = context.storage.store("settings", {
      initial: {
        site: "example.atlassian.net",
        projectKey: "DEMO",
        boardId: null as number | null,
        cacheSeconds: 60,
        linkDepth: 2,
      },
    });
    const updateSettings = stored[1];
    // Preserve proxy/accessor compatibility.
    const cfg = (): any =>
      typeof stored[0] === "function"
        ? (stored[0] as any)()
        : (stored[0] as any);
    const [view, setView] = createSignal<ViewName>("mine");
    const [assignee, setAssignee] = createSignal<AssigneeFilter>("mine");
    const [text, setText] = createSignal("");
    const [typeFilter, setTypeFilter] = createSignal<string | null>(null);
    const [rows, setRows] = createSignal<Row[]>([]);
    const [selected, setSelected] = createSignal(0);
    const [loading, setLoading] = createSignal(false);
    const [status, setStatus] = createSignal("");
    const [error, setError] = createSignal<string | undefined>(undefined);
    const [board, setBoard] = createSignal<BoardConfig | undefined>(undefined);
    const [sprint, setSprint] = createSignal<SprintInfo | undefined>(undefined);
    const [drillEpic, setDrillEpic] = createSignal<string | null>(null);
    const [graphKey, setGraphKey] = createSignal<string | null>(null);
    const [accountId, setAccountId] = createSignal<string | null>(null);
    const [myCount, setMyCount] = createSignal<number | null>(null);
    const [focus, setFocus] = createSignal<FocusRegion>("content");
    const [column, setColumn] = createSignal(0);
    const [ticket, setTicket] = createSignal<Ticket | undefined>();
    const [composer, setComposer] = createSignal<ComposerState | undefined>();
    const [width, setWidth] = createSignal(context.renderer?.width ?? 80);
    const [history, setHistory] = createSignal<readonly Snapshot[]>([]);
    const [workspaceRows, setWorkspaceRows] = createSignal<Row[]>([]);
    const [workspaceSelected, setWorkspaceSelected] = createSignal(0);
    const [workspaceColumn, setWorkspaceColumn] = createSignal(0);
    const drafts = new Map<string, string>();
    const scrollRefs = new Map<string, ScrollHandle>();
    let rememberedScroll: Scrolls = {};
    let generation = 0;
    let disposed = false;
    let hostRoute: any = { type: "home" };
    let retryRead: (() => void) | undefined;
    const columnSelection = new Map<string, string>();
    let workspaceBoard = true;
    let settingsEpoch = 0;
    let directIntent = 0;
    const clearRetry = () => {
      retryRead = undefined;
      setError(undefined);
    };
    interface Snapshot {
      view: ViewName;
      rows: Row[];
      selected: number;
      column: number;
      focus: FocusRegion;
      ticket: Ticket | undefined;
      drillEpic: string | null;
      graphKey: string | null;
      scroll: Scrolls;
      filter: FilterState;
    }
    const snapshot = (): Snapshot => ({
      view: view(),
      rows: rows(),
      selected: selected(),
      column: column(),
      focus: focus(),
      ticket: ticket(),
      drillEpic: drillEpic(),
      graphKey: graphKey(),
      filter: filterState(),
      scroll: Object.fromEntries(
        [...scrollRefs].map(([id, ref]) => [
          id,
          { x: ref.scrollLeft, y: ref.scrollTop },
        ]),
      ),
    });
    const remember = () => {
      setHistory((stack) => pushScreen(stack, snapshot()));
      if (!ticket() && ROOT_VIEWS.includes(view() as any) && !drillEpic()) {
        workspaceBoard = boardView();
        setWorkspaceRows(rows());
        setWorkspaceSelected(selected());
        setWorkspaceColumn(column());
      }
    };
    function restore(state: Snapshot) {
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
        if (!disposed)
          for (const [id, position] of Object.entries(state.scroll))
            scrollRefs.get(id)?.scrollTo(position);
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
    const registerScroll = (id: string, ref: ScrollHandle) => {
      scrollRefs.set(id, ref);
      if (rememberedScroll[id]) ref.scrollTo(rememberedScroll[id]);
    };
    const boardView = () =>
      !ticket() && !drillEpic() && (view() === "mine" || view() === "sprint");
    const groups = createMemo(() => {
      const out: number[][] = [];
      rows().forEach((row, index) => {
        if (row.kind === "group") out.push([]);
        else if (row.kind === "issue") out.at(-1)?.push(index);
      });
      return out;
    });
    const cache = new Map<string, { at: number; rows: Row[] }>();
    const client = () => new JiraClient(cfg().site);
    const filterState = (): FilterState => ({
      assignee: assignee(),
      text: text(),
      type: typeFilter(),
    });
    const selectableIndexes = createMemo(() =>
      rows().reduce<number[]>(
        (acc, row, index) =>
          row.kind === "issue" ||
          row.kind === "link" ||
          (view() === "backlog" && row.kind === "group" && row.key)
            ? [...acc, index]
            : acc,
        [],
      ),
    );
    const currentIssue = createMemo(() => {
      if (ticket()) return ticket()!.issue;
      const row = rows()[selected()];
      return row && row.kind === "issue" ? row.issue : undefined;
    });
    function firstSelectable(list: Row[]) {
      const index = list.findIndex((row) => row.kind === "issue");
      return index < 0 ? 0 : index;
    }
    function alignSelection(next: Row[]) {
      const prior = currentIssue()?.key;
      const columns: { label: string; header: number; indexes: number[] }[] =
        [];
      next.forEach((row, index) => {
        if (row.kind === "group")
          columns.push({ label: row.label, header: index, indexes: [] });
        else if (row.kind === "issue") columns.at(-1)?.indexes.push(index);
      });
      let active = Math.max(0, Math.min(column(), columns.length - 1));
      const retained = next.findIndex(
        (row) => row.kind === "issue" && row.issue.key === prior,
      );
      if (boardView() && retained >= 0)
        active = Math.max(
          0,
          columns.findIndex((group) => group.indexes.includes(retained)),
        );
      const group = columns[active];
      const remembered = group && columnSelection.get(group.label);
      const index =
        retained >= 0
          ? retained
          : (group?.indexes.find(
              (index) => (next[index] as any).issue.key === remembered,
            ) ??
            (boardView() ? (group?.indexes[0] ?? -1) : firstSelectable(next)));
      for (const [label, key] of columnSelection)
        if (!next.some((row) => row.kind === "issue" && row.issue.key === key))
          columnSelection.delete(label);
      setRows(next);
      setColumn(active);
      setSelected(index);
    }
    async function resolveBoard(c: JiraClient): Promise<BoardConfig> {
      const configured = cfg().boardId;
      if (configured) return c.boardConfig(configured);
      const boards = await c.boards(cfg().projectKey);
      if (boards.length === 0)
        throw new JiraError(
          0,
          `No boards found for project ${cfg().projectKey}`,
        );
      const preferred = boards.find((b) => b.type === "scrum") ?? boards[0];
      await updateSettings((draft: any) => {
        draft.boardId = preferred.id;
      });
      return c.boardConfig(preferred.id);
    }
    async function load(options: { refresh?: boolean } = {}) {
      if (ticket() || composer()) return;
      const request = ++generation;
      const target = view();
      setError(undefined);
      setLoading(true);
      setStatus("loading…");
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
        if (
          !options.refresh &&
          hit &&
          Date.now() - hit.at < s.cacheSeconds * 1000
        ) {
          alignSelection(hit.rows);
          setStatus("cached");
          return;
        }
        let next: Row[] = [];
        if (target === "mine" || target === "sprint" || target === "backlog") {
          let issues: Issue[];
          let truncated = false;
          if (target === "sprint") {
            const active = sprint() ?? (await c.activeSprint(config.id));
            if (request !== generation || disposed) return;
            setSprint(active);
            if (!active)
              throw new JiraError(0, "No active sprint on this board");
            issues = await c.sprintIssues(config.id, active.id);
            issues = applyAssigneeFilter(
              applyTextFilter(issues, filter),
              filter.assignee,
              accountId(),
            );
          } else if (target === "backlog") {
            const result = await c.backlog(config.id);
            issues = applyAssigneeFilter(
              applyTextFilter(result.issues, filter),
              filter.assignee,
              accountId(),
            );
            truncated = result.truncated;
          } else {
            const jql = buildJql({
              view: "mine",
              projectKey: s.projectKey,
              boardJql: config.filterJql,
              assignee: filter.assignee,
              filter,
            });
            const result = await c.search(jql, { cap: 400 });
            issues = result.issues;
            truncated = result.truncated;
          }
          next = await groupRows(c, issues, config, truncated, target);
        } else if (target === "epics") {
          const jql = buildJql({
            view: "epics",
            projectKey: s.projectKey,
            assignee: filter.assignee,
            filter,
          });
          const result = await c.search(jql, { cap: 400 });
          const epics = applyTextFilter(result.issues, filter);
          const counts = await childCounts(
            c,
            epics.map((epic) => epic.key),
          );
          for (const category of [
            ...new Set(epics.map((epic) => epic.statusCategory)),
          ]) {
            const items = epics.filter(
              (epic) => epic.statusCategory === category,
            );
            next.push({ kind: "group", label: category, count: items.length });
            for (const epic of items) {
              const progress = counts.get(epic.key);
              next.push({
                kind: "issue",
                issue: epic,
                note: progress
                  ? `${progress.doneCount}/${progress.childCount} done`
                  : "unknown/partial child count",
              });
            }
          }
          if (result.truncated)
            next.push({
              kind: "text",
              text: "Epics result partial",
              tone: "warning",
            });
        } else {
          next = await epicChildrenRows(c, filter);
        }
        if (request !== generation || disposed) return;
        cache.set(key, { at: Date.now(), rows: next });
        alignSelection(next);
        setStatus(
          `${next.filter((row) => row.kind === "issue").length} issues`,
        );
      } catch (e) {
        if (request !== generation || disposed) return;
        setError(message(e));
        setStatus("error");
      } finally {
        if (request === generation && !disposed) setLoading(false);
      }
    }
    async function epicChildrenRows(
      c: JiraClient,
      filter: FilterState,
      target = drillEpic(),
    ): Promise<Row[]> {
      if (!target) {
        return [
          {
            kind: "text",
            text: "Select an epic in the Epics view and press enter.",
            tone: "muted",
          },
        ];
      }
      const epic = await c
        .issue(target)
        .then((raw) => toIssueDetail(raw, c.site));
      const children = await c.search(`parent = ${target} ORDER BY Rank ASC`, {
        cap: 300,
      });
      const progress = epicProgress(children.issues);
      const out: Row[] = [
        {
          kind: "group",
          label: `${epic.key} · ${epic.summary}`,
          count: children.issues.length,
        },
        {
          kind: "text",
          text: `${epic.status} · ${children.truncated ? "partial " : ""}${progress.doneCount}/${progress.childCount} done · ${epic.assignee ?? "unassigned"}`,
          tone: "muted",
        },
        { kind: "group", label: "Children", count: children.issues.length },
      ];
      for (const issue of applyTextFilter(children.issues, filter))
        out.push({ kind: "issue", issue });
      if (children.truncated)
        out.push({
          kind: "text",
          text: "Children result partial",
          tone: "warning",
        });
      if (children.issues.length === 0)
        out.push({ kind: "text", text: "No children.", tone: "muted" });
      return out;
    }
    async function openIssue(key: string, refresh = false) {
      if (
        composer() ||
        !/^[A-Z][A-Z0-9_]*-\d+$/.test(key) ||
        (!refresh && ticket()?.issue.key === key)
      )
        return;
      const previous = snapshot();
      const request = ++generation;
      setError(undefined);
      setLoading(true);
      setStatus(`loading ${key}…`);
      try {
        const c =
          refresh && ticket()?.site
            ? new JiraClient(ticket()!.site!)
            : client();
        const payload = await readTicket(c, key);
        const issue = payload.issue,
          out = [...payload.relationships];
        if (request !== generation || disposed) return;
        if (!refresh) remember();
        setTicket(payload);
        setRows(out);
        setSelected(refresh ? previous.selected : firstSelectable(out));
        setFocus(refresh ? previous.focus : "body");
        rememberedScroll = refresh ? previous.scroll : {};
        if (refresh) {
          setHistory((stack) =>
            stack.map((state) =>
              state.ticket?.issue.key === key && state.ticket.site === c.site
                ? { ...state, ticket: payload, rows: out }
                : state,
            ),
          );
          queueMicrotask(() =>
            scrollRefs
              .get("body")
              ?.scrollTo(previous.scroll.body ?? { x: 0, y: 0 }),
          );
        } else scrollRefs.get("body")?.scrollTo({ x: 0, y: 0 });
        setStatus(issue.key);
        retryRead = undefined;
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
    async function openChildren(key: string) {
      if (composer()) return;
      const request = ++generation;
      clearRetry();
      setLoading(true);
      try {
        const next = await epicChildrenRows(client(), filterState(), key);
        if (request !== generation || disposed) return;
        remember();
        setTicket(undefined);
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
      setStatus(`graph ${key}…`);
      try {
        const result = await graphRows(client(), key, cfg().linkDepth);
        if (request !== generation || disposed) return;
        if (!refresh) remember();
        setGraphKey(key);
        clearRetry();
        setTicket(undefined);
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

    function move(delta: number) {
      if (focus() === "tabs") {
        if (delta > 0) setFocus("content");
        return;
      }
      if (ticket() && focus() === "body") {
        scrollRefs.get("body")?.scrollBy(delta);
        return;
      }
      if (ticket() && focus() !== "relationships") return;
      const indexes = boardView()
        ? (groups()[column()] ?? [])
        : selectableIndexes();
      if (indexes.length === 0) return;
      const current = indexes.indexOf(selected());
      const next = Math.max(
        0,
        Math.min(indexes.length - 1, (current < 0 ? 0 : current) + delta),
      );
      setSelected(indexes[next]);
      scrollRefs
        .get(ticket() ? "body" : boardView() ? `column-${column()}` : "list")
        ?.scrollChildIntoView?.(
          `${ticket() ? "relationship" : boardView() ? "card" : "row"}-${indexes[next]}`,
        );
    }

    function horizontal(delta: number) {
      if (focus() === "tabs") {
        const index = ROOT_VIEWS.indexOf(view() as (typeof ROOT_VIEWS)[number]);
        switchView(ROOT_VIEWS[(Math.max(0, index) + delta + 4) % 4]);
        setFocus("tabs");
      } else if (boardView()) {
        const labels = rows().filter((row) => row.kind === "group") as Extract<
          Row,
          { kind: "group" }
        >[];
        const selectedRow = rows()[selected()];
        if (selectedRow?.kind === "issue")
          columnSelection.set(labels[column()]?.label, selectedRow.issue.key);
        const next = Math.max(
          0,
          Math.min(groups().length - 1, column() + delta),
        );
        setColumn(next);
        const indexes = groups()[next] ?? [];
        const remembered = columnSelection.get(labels[next]?.label);
        setSelected(
          indexes.find(
            (index) => (rows()[index] as any).issue.key === remembered,
          ) ??
            indexes[0] ??
            -1,
        );
      } else if (ticket() && focus() === "body")
        scrollRefs.get("body")?.scrollBy({ x: delta * 4, y: 0 });
    }
    function cycleFocus(delta: number) {
      const regions: FocusRegion[] = ticket()
        ? ["body", "relationships", "back", "comment"]
        : view() === "epics" || drillEpic()
          ? ["content", "tabs", "details", "back"]
          : ["content", "tabs", "back"];
      setFocus(
        regions[
          (Math.max(0, regions.indexOf(focus())) + delta + regions.length) %
            regions.length
        ],
      );
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
        initial: drafts.get(`${site}|${issue.key}`) ?? "",
      });
    }
    function openLink(href: string) {
      const safe = safeUrl(href);
      if (!safe) return;
      const url = new URL(safe),
        internal = /^\/browse\/([A-Z][A-Z0-9_]*-\d+)$/.exec(url.pathname);
      if (url.hostname === cfg().site && internal) void openIssue(internal[1]);
      else execFile("open", [safe], () => undefined);
    }

    /** Shared action context. Captures the current ticket so a late refresh
     *  targets the same issue and site that the action wrote to. */
    const actionOptions = () => {
      const target = ticket();
      return {
        context,
        issue: currentIssue,
        client: () => (target?.site ? new JiraClient(target.site) : client()),
        accountId,
        setAccountId,
        board,
        sprint,
        message,
        refresh: async () => {
          cache.clear();
          if (
            target &&
            ticket()?.issue.key === target.issue.key &&
            ticket()?.site === target.site
          )
            await openIssue(target.issue.key, true);
          else if (ticket()) return;
          else await load({ refresh: true });
        },
      };
    };

    async function runAction(
      kind: "transition" | "assign" | "unassign" | "sprint",
    ) {
      const target = ticket();
      if (target?.site && target.site !== cfg().site) return;
      await runTicketAction(actionOptions(), kind);
    }

    async function moveColumn(delta: number) {
      if (!boardView()) {
        context.ui.toast.show({
          message: "Switch to My Work or Sprint to move cards between columns",
          variant: "warning",
        });
        return;
      }
      const target = ticket();
      if (target?.site && target.site !== cfg().site) return;
      await moveToColumn(actionOptions(), delta);
    }

    async function archiveToBacklog() {
      const target = ticket();
      if (target?.site && target.site !== cfg().site) return;
      await sendToBacklog(actionOptions());
    }

    const openInBrowser = () => {
      const url = safeUrl(currentIssue()?.url);
      if (url) execFile("open", [url], () => undefined);
    };
    function copyKey() {
      const issue = currentIssue();
      if (!issue) return;
      const child = execFile("pbcopy", () => undefined);
      child.stdin?.end(issue.key);
      context.ui.toast.show({ message: `${issue.key} copied` });
    }

    const { pickAssignee, pickType, search, configure } = filters({
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
        setTicket(undefined);
        setComposer(undefined);
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
        setBoard(undefined);
        setSprint(undefined);
        cache.clear();
      },
      load: (refresh) => load({ refresh }),
    });

    function switchView(next: ViewName) {
      if (!boardInputEnabled()) return;
      if (next === "issue") {
        const issue = currentIssue();
        if (issue) return void openIssue(issue.key);
      }
      generation++;
      directIntent++;
      setHistory([]);
      setTicket(undefined);
      setColumn(0);
      setFocus("tabs");
      rememberedScroll = {};
      retryRead = undefined;
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
        const row = rows()[selected()];
        if (row?.kind === "issue") void openIssue(row.issue.key);
        else if (row?.kind === "link") openLink(row.href);
        return;
      }
      const row = rows()[selected()];
      if (view() === "backlog" && row?.kind === "group" && row.key)
        return void openIssue(row.key);
      const issue = currentIssue();
      if (!issue) return;
      if (view() === "epics" && !drillEpic()) {
        return void openChildren(issue.key);
      }
      return void openIssue(issue.key);
    }

    context.ui.router.register({ name: "jira", render: () => <JiraApp /> });
    function boardInputEnabled() {
      const route = context.ui.router.current();
      return (
        route.type === "plugin" &&
        route.name === "jira" &&
        !composer() &&
        context.keymap.mode.current() === "base"
      );
    }

    function JiraApp() {
      const ctx = context;
      const resize = () => setWidth(context.renderer?.width ?? 80);
      context.renderer?.on?.("resize", resize);
      onCleanup(() => {
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
          moveToColumn: moveColumn,
          sendToBacklog: archiveToBacklog,
          pickAssignee,
          pickType,
          search,
          showGraph,
          configure,
          back,
          switchView,
          refresh: () =>
            retryRead
              ? retryRead()
              : ticket()
                ? void openIssue(ticket()!.issue.key, true)
                : graphKey()
                  ? void showGraph(true)
                  : void load({ refresh: true }),
        }),
      }));

      const header = createMemo(() => {
        const s = cfg();
        const parts = [s.projectKey];
        const b = board();
        if (b) parts.push(b.name);
        const active = sprint();
        if (active && view() === "sprint")
          parts.push(`${active.name} (${sprintDaysLeft(active)})`);
        parts.push(`assignee:${ASSIGNEE_LABELS[assignee()]}`);
        if (typeFilter()) parts.push(`type:${typeFilter()}`);
        if (text()) parts.push(`text:"${text()}"`);
        if (drillEpic()) parts.push(`epic:${drillEpic()}`);
        return parts.join("  ·  ");
      });

      const footer = createMemo(() => {
        if (loading()) return `loading… ${status()}`;
        if (error()) return `error: ${error()}`;
        return width() < 44 && !composer()
          ? "Tab Esc/q"
          : screenHint(width(), focus(), !!ticket(), boardView(), !!composer());
      });

      return (
        <box
          flexDirection="column"
          width="100%"
          height="100%"
          paddingLeft={1}
          paddingRight={1}
        >
          <box flexDirection="row" height={1} flexShrink={0}>
            <text fg={color(ctx, "accent")}>JIRA </text>
            <text fg={color(ctx, "muted")}>{header()}</text>
          </box>
          <ViewTabs
            context={ctx}
            view={view()}
            focus={focus()}
            width={width()}
            switchView={switchView}
          />
          <WorkspaceViewport
            context={ctx}
            rows={ticket() ? workspaceRows() : rows()}
            selected={selected()}
            workspaceSelected={workspaceSelected()}
            board={ticket() ? workspaceBoard : boardView()}
            column={ticket() ? workspaceColumn() : column()}
            width={width()}
            loading={loading()}
            ticket={ticket()}
            composer={composer()}
            focus={focus()}
            detailsKey={
              drillEpic() ??
              (view() === "epics" ? currentIssue()?.key : undefined)
            }
            enabled={boardInputEnabled}
            register={registerScroll}
            openKey={(key) => void openIssue(key)}
            open={(index) => {
              setSelected(index);
              setFocus("content");
              activate();
            }}
            relationship={(index) => {
              setSelected(index);
              setFocus("relationships");
              activate();
            }}
            back={back}
            comment={addComment}
            link={openLink}
            save={(value) => {
              const state = composer();
              if (state) drafts.set(`${state.site}|${state.key}`, value);
            }}
            close={() => setComposer(undefined)}
            send={(value, state) => {
              return new JiraClient(state.site).addComment(state.key, value);
            }}
            success={(state) => {
              drafts.delete(`${state.site}|${state.key}`);
              if (
                disposed ||
                composer()?.key !== state.key ||
                composer()?.site !== state.site
              )
                return;
              setComposer(undefined);
              setFocus("body");
              cache.clear();
              void openIssue(state.key, true);
            }}
          />
          <box flexDirection="row" height={1} flexShrink={0}>
            <SessionReturnControl
              context={ctx}
              width={width()}
              nested={history().length > 0}
              focused={focus() === "back"}
              back={back}
            />
            <text
              fg={error() ? color(ctx, "error") : color(ctx, "muted")}
              selectable={false}
              onMouseUp={leftClick(() => {
                if (error() && boardInputEnabled()) {
                  if (retryRead) retryRead();
                  else void load({ refresh: true });
                }
              })}
            >
              {terminalText(footer())}
            </text>
          </box>
        </box>
      );
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
      valid: (intent, request) =>
        intent === directIntent &&
        request === generation &&
        !disposed &&
        boardInputEnabled(),
      reset: () => {
        setTicket(undefined);
        setHistory([]);
        setView("mine");
        setDrillEpic(null);
        setGraphKey(null);
        setFocus("content");
      },
    });

    const stopBadge = context.ui.slot({
      append: "home.footer.status",
      render: () => (
        <text fg={color(context, "muted")}>
          {myCount() === null ? "JIRA …" : `JIRA ${myCount()}`}
        </text>
      ),
    });

    try {
      const epoch = settingsEpoch;
      const jql = `project = ${cfg().projectKey} AND assignee = currentUser() AND resolution = Unresolved`;
      void client()
        .search(jql, { cap: 100 })
        .then((result) => {
          if (!disposed && epoch === settingsEpoch)
            setMyCount(result.issues.length);
        })
        .catch(() => {
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
  },
};
