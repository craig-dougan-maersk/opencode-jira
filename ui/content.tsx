import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import { terminalText } from "../lib/adf.ts";
import { columnWindow } from "../lib/navigation.ts";
import type { Issue } from "../lib/types.ts";
import {
  color,
  leftClick,
  statusTone,
  categoryLabel,
  type Row,
  type ScrollHandle,
  type Ticket,
} from "./types.ts";

interface ContentProps {
  context: any;
  rows: readonly Row[];
  selected: number;
  board: boolean;
  column: number;
  width: number;
  enabled: () => boolean;
  open: (index: number) => void;
  openKey: (key: string) => void;
  /** Drop a dragged card onto the board column at this absolute index. */
  dropCard?: (issue: Issue, column: number) => void;
  register: (id: string, ref: ScrollHandle) => void;
}
export function WorkspaceContent(props: ContentProps) {
  const groups = createMemo(() => {
    const result: {
      label: string;
      items: { row: Extract<Row, { kind: "issue" }>; index: number }[];
    }[] = [];
    props.rows.forEach((row, index) => {
      if (row.kind === "group") result.push({ label: row.label, items: [] });
      if (row.kind === "issue") result.at(-1)?.items.push({ row, index });
    });
    return result;
  });
  const window = createMemo(() =>
    columnWindow(props.width, groups().length, props.column),
  );
  const visible = createMemo(() =>
    groups().slice(window().start, window().start + window().count),
  );
  const [height, setHeight] = createSignal(
    props.context.renderer?.height ?? 24,
  );
  const focused = createMemo(() => props.rows[props.selected]);
  /** The card being dragged and the column it came from, or null. */
  const [dragging, setDragging] = createSignal<{
    issue: Issue;
    column: number;
  } | null>(null);
  /** The board column currently under a dragged card, or null. */
  const [dropTarget, setDropTarget] = createSignal<number | null>(null);
  const clearDrag = () => {
    setDragging(null);
    setDropTarget(null);
  };
  return (
    <Show
      when={props.board}
      fallback={
        <scrollbox
          ref={(ref: ScrollHandle) => props.register("list", ref)}
          flexGrow={1}
          scrollY
          scrollX={false}
        >
          <For each={props.rows}>
            {(row, index) =>
              row.kind === "group" ? (
                <text
                  id={`row-${index()}`}
                  selectable={false}
                  fg={color(props.context, "accent")}
                  onMouseUp={leftClick(() => {
                    if (props.enabled() && row.key) props.openKey(row.key);
                  })}
                >{`${index() === props.selected && row.key ? "▸ " : "── "}${terminalText(row.label)} (${row.count})${row.key ? " · Details" : ""}`}</text>
              ) : row.kind === "text" ? (
                <text fg={color(props.context, row.tone ?? "muted")}>
                  {terminalText(row.text)}
                </text>
              ) : row.kind === "link" ? (
                <text fg={color(props.context, "base")}>{row.label}</text>
              ) : (
                <text
                  id={`row-${index()}`}
                  selectable={false}
                  fg={color(
                    props.context,
                    index() === props.selected ? "accent" : "base",
                  )}
                  onMouseUp={leftClick(() => {
                    if (props.enabled()) props.open(index());
                  })}
                >
                  {`${index() === props.selected ? "▸ " : "  "}${terminalText(row.issue.key)} · ${terminalText(row.issue.summary)} · ${terminalText(row.issue.status)}${row.note ? ` · ${terminalText(row.note)}` : ""}`}
                </text>
              )
            }
          </For>
        </scrollbox>
      }
    >
      <box
        flexGrow={1}
        minHeight={0}
        flexDirection="column"
        onSizeChange={function () {
          setHeight(this.height);
        }}
      >
        <Show
          when={height() <= 6}
          fallback={
            <>
              <text
                fg={color(props.context, "muted")}
              >{`${window().start > 0 ? "‹ more · " : ""}Columns ${window().start + 1}–${Math.min(groups().length, window().start + window().count)} / ${groups().length}${window().start + window().count < groups().length ? " · more ›" : ""}`}</text>
              <box flexDirection="row" flexGrow={1} gap={1}>
                <For each={visible()}>
                  {(group, ordinal) => {
                    const absolute = () => window().start + ordinal();
                    const isTarget = () =>
                      dropTarget() === absolute() &&
                      dragging()?.column !== absolute();
                    let scroll: ScrollHandle | undefined;
                    createEffect(() => {
                      const selected = props.selected;
                      if (absolute() === props.column)
                        scroll?.scrollChildIntoView?.(`card-${selected}`);
                    });
                    return (
                      <box
                        id={`column-${absolute()}`}
                        border
                        borderStyle={
                          isTarget() || absolute() === props.column
                            ? "double"
                            : "single"
                        }
                        borderColor={color(
                          props.context,
                          isTarget()
                            ? "success"
                            : absolute() === props.column
                              ? "accent"
                              : "muted",
                        )}
                        flexDirection="column"
                        width={window().width}
                        flexShrink={0}
                        onMouseOver={() =>
                          dragging() && setDropTarget(absolute())
                        }
                        onMouseOut={() =>
                          setDropTarget((value) =>
                            value === absolute() ? null : value,
                          )
                        }
                        onMouseDrop={() => {
                          const dragged = dragging();
                          if (
                            dragged &&
                            dragged.column !== absolute() &&
                            props.enabled()
                          )
                            props.dropCard?.(dragged.issue, absolute());
                          clearDrag();
                        }}
                      >
                        <text
                          fg={color(props.context, "base")}
                          selectable={false}
                          height={1}
                          flexShrink={0}
                          wrapMode="none"
                        >{`${absolute() === props.column ? "▸ " : ""}${terminalText(group.label)} (${group.items.length})`}</text>
                        <text flexShrink={0} fg={color(props.context, "base")}>
                          {[
                            ...new Set(
                              group.items.map((item) =>
                                categoryLabel(item.row.issue.statusCategory),
                              ),
                            ),
                          ].join(" / ") || "No tickets"}
                        </text>
                        <scrollbox
                          ref={(ref: ScrollHandle) => {
                            scroll = ref;
                            props.register(`column-${absolute()}`, ref);
                          }}
                          flexGrow={1}
                          scrollY
                          scrollX={false}
                        >
                          <Show
                            when={group.items.length}
                            fallback={
                              <text fg={color(props.context, "base")}>
                                No tickets
                              </text>
                            }
                          >
                            <For each={group.items}>
                              {({ row, index }) => (
                                <box
                                  id={`card-${index}`}
                                  border
                                  borderStyle={
                                    index === props.selected
                                      ? "double"
                                      : "single"
                                  }
                                  borderColor={color(
                                    props.context,
                                    statusTone(row.issue),
                                  )}
                                  flexDirection="column"
                                  flexShrink={0}
                                  onMouseDrag={() => {
                                    if (dragging()?.issue.key === row.issue.key)
                                      return;
                                    setDragging({
                                      issue: row.issue,
                                      column: absolute(),
                                    });
                                  }}
                                  onMouseDragEnd={() =>
                                    queueMicrotask(clearDrag)
                                  }
                                  onMouseUp={leftClick(() => {
                                    if (props.enabled()) props.open(index);
                                  })}
                                >
                                  <text
                                    selectable={false}
                                    fg={color(props.context, "base")}
                                  >{`${index === props.selected ? "▸ " : ""}${terminalText(row.issue.key)} · ${terminalText(row.issue.type)}`}</text>
                                  <text
                                    height={2}
                                    wrapMode="word"
                                    fg={color(props.context, "base")}
                                  >
                                    {terminalText(row.issue.summary)}
                                  </text>
                                  <text
                                    fg={color(props.context, "base")}
                                  >{`${terminalText(row.issue.status)} · ${categoryLabel(row.issue.statusCategory)} · ${terminalText(row.issue.assignee ?? "Unassigned")}${row.issue.points === null ? "" : ` · ${row.issue.points}sp`}`}</text>
                                </box>
                              )}
                            </For>
                          </Show>
                        </scrollbox>
                      </box>
                    );
                  }}
                </For>
              </box>
              <For each={props.rows.filter((row) => row.kind === "text")}>
                {(row) => (
                  <text fg={color(props.context, "base")}>
                    {terminalText((row as Extract<Row, { kind: "text" }>).text)}
                  </text>
                )}
              </For>
            </>
          }
        >
          <text
            height={1}
            flexShrink={0}
            wrapMode="none"
            fg={color(props.context, "base")}
          >
            {focused()?.kind === "issue"
              ? `▸ ${terminalText((focused() as Extract<Row, { kind: "issue" }>).issue.key)}`
              : `${terminalText(groups()[props.column]?.label ?? "Board")} · No tickets`}
          </text>
          <Show when={focused()?.kind === "issue"}>
            <text
              height={1}
              flexShrink={0}
              wrapMode="none"
              fg={color(props.context, "base")}
            >
              {terminalText(
                (focused() as Extract<Row, { kind: "issue" }>).issue.summary,
              )}
            </text>
          </Show>
          <scrollbox
            id="compact-board"
            flexGrow={1}
            flexBasis={0}
            minHeight={0}
            scrollY
            scrollX
            overflow="hidden"
            viewportOptions={{ overflow: "hidden" }}
            ref={(ref: ScrollHandle) =>
              props.register(`column-${props.column}`, ref)
            }
          >
            <text flexShrink={0} fg={color(props.context, "base")}>
              {terminalText(groups()[props.column]?.label ?? "Board")}
            </text>
            <Show when={focused()?.kind === "issue"}>
              <text
                flexShrink={0}
                fg={color(props.context, "base")}
              >{`${(focused() as Extract<Row, { kind: "issue" }>).issue.type} · ${(focused() as Extract<Row, { kind: "issue" }>).issue.status} · ${categoryLabel((focused() as Extract<Row, { kind: "issue" }>).issue.statusCategory)}`}</text>
              <text
                flexShrink={0}
                fg={color(props.context, "base")}
              >{`${(focused() as Extract<Row, { kind: "issue" }>).issue.assignee ?? "Unassigned"} · ${(focused() as Extract<Row, { kind: "issue" }>).issue.points ?? "–"}sp`}</text>
            </Show>
          </scrollbox>
        </Show>
      </box>
    </Show>
  );
}
interface TicketProps {
  context: any;
  ticket: Ticket;
  selected: number;
  focus: string;
  enabled: () => boolean;
  back: () => void;
  comment: () => void;
  open: (index: number) => void;
  link: (href: string) => void;
  register: (id: string, ref: ScrollHandle) => void;
}
export function TicketWindow(props: TicketProps) {
  let body: ScrollHandle | undefined;
  const [size, setSize] = createSignal({
    width: props.context.renderer?.width ?? 80,
    height: props.context.renderer?.height ?? 24,
  });
  const width = () => size().width;
  const height = () => size().height;
  const inset = () => (width() >= 60 && height() >= 18 ? 2 : 0);
  const compact = () => height() < 18 || width() < 60;
  createEffect(() => {
    if (props.focus === "relationships")
      body?.scrollChildIntoView?.(`relationship-${props.selected}`);
  });
  return (
    <box
      position="absolute"
      left={0}
      top={0}
      width="100%"
      height="100%"
      paddingLeft={inset()}
      paddingRight={inset()}
      paddingTop={inset() ? 1 : 0}
      paddingBottom={inset() ? 1 : 0}
      alignItems="center"
      onSizeChange={function () {
        setSize({ width: this.width, height: this.height });
      }}
      onMouseUp={(event: { stopPropagation(): void }) =>
        event.stopPropagation()
      }
    >
      <box
        width="100%"
        maxWidth={112}
        height="100%"
        border
        borderStyle="double"
        borderColor={color(props.context, "accent")}
        flexDirection="column"
        backgroundColor={props.context.theme?.background?.base}
        onMouseUp={(event: { stopPropagation(): void }) =>
          event.stopPropagation()
        }
      >
        <text
          height={1}
          flexShrink={0}
          selectable={false}
          fg={color(props.context, "accent")}
          onMouseUp={leftClick(() => {
            if (props.enabled()) props.back();
          })}
        >{`${terminalText(props.ticket.issue.key)} · ${props.focus === "back" ? "▸ " : ""}Back`}</text>
        <Show when={compact() && height() >= 8}>
          <text
            fg={color(props.context, "base")}
            height={1}
            flexShrink={0}
            wrapMode="none"
          >{`${terminalText(props.ticket.issue.type)} · ${terminalText(props.ticket.issue.status)}`}</text>
        </Show>
        <Show when={!compact()}>
          <text
            height={2}
            flexShrink={0}
            wrapMode="word"
            fg={color(props.context, "base")}
          >
            {terminalText(props.ticket.issue.summary)}
          </text>
          <text
            fg={color(props.context, "base")}
            height={1}
            flexShrink={0}
          >{`${terminalText(props.ticket.issue.type)} · ${terminalText(props.ticket.issue.status)} · ${terminalText(props.ticket.issue.assignee ?? "Unassigned")} · ${props.ticket.issue.points ?? "–"}sp · ${terminalText(props.ticket.issue.priority ?? "–")}`}</text>
        </Show>
        <scrollbox
          flexGrow={1}
          flexBasis={0}
          minHeight={0}
          overflow="hidden"
          viewportOptions={{ overflow: "hidden" }}
          scrollY
          scrollX
          ref={(ref: ScrollHandle) => {
            body = ref;
            props.register("body", ref);
          }}
        >
          <text flexShrink={0} fg={color(props.context, "base")}>
            {terminalText(props.ticket.issue.summary)}
          </text>
          <text
            fg={color(props.context, "base")}
            flexShrink={0}
          >{`${terminalText(props.ticket.issue.type)} · ${terminalText(props.ticket.issue.status)} · ${terminalText(props.ticket.issue.assignee ?? "Unassigned")} · ${props.ticket.issue.points ?? "–"}sp · ${terminalText(props.ticket.issue.priority ?? "–")}`}</text>
          <text fg={color(props.context, "accent")}>Description</text>
          <For each={props.ticket.blocks}>
            {(block) => (
              <text
                wrapMode={block.kind === "code" ? "none" : "word"}
                selectable={block.kind !== "link"}
                fg={color(
                  props.context,
                  block.kind === "link" ? "accent" : "base",
                )}
                onMouseUp={
                  block.href
                    ? leftClick(() => {
                        if (props.enabled()) props.link(block.href!);
                      })
                    : undefined
                }
              >
                {block.text}
              </text>
            )}
          </For>
          <For each={props.ticket.relationships}>
            {(row, index) =>
              row.kind === "group" ? (
                <text fg={color(props.context, "accent")}>{row.label}</text>
              ) : row.kind === "text" ? (
                <text fg={color(props.context, row.tone ?? "base")}>
                  {terminalText(row.text)}
                </text>
              ) : row.kind === "link" ? (
                <text
                  id={`relationship-${index()}`}
                  selectable={false}
                  fg={color(props.context, "accent")}
                  onMouseUp={leftClick(() => {
                    if (props.enabled()) props.link(row.href);
                  })}
                >{`${props.selected === index() && props.focus === "relationships" ? "▸ " : ""}${row.label}`}</text>
              ) : (
                <text
                  id={`relationship-${index()}`}
                  selectable={false}
                  fg={color(
                    props.context,
                    props.focus === "relationships" &&
                      props.selected === index()
                      ? "accent"
                      : "base",
                  )}
                  onMouseUp={leftClick(() => {
                    if (props.enabled()) props.open(index());
                  })}
                >
                  {`${props.focus === "relationships" && props.selected === index() ? "▸ " : ""}${terminalText(row.issue.key)} · ${terminalText(row.note ?? row.issue.type)} · ${terminalText(row.issue.summary)}`}
                </text>
              )
            }
          </For>
        </scrollbox>
        <text
          height={1}
          flexShrink={0}
          wrapMode="none"
          selectable={false}
          fg={color(props.context, "accent")}
          onMouseUp={leftClick(() => {
            if (props.enabled()) props.comment();
          })}
        >
          {width() < 24
            ? `${props.focus === "comment" ? "▸" : ""}c Comment`
            : width() < 60
              ? "Add comment [c] · Esc Back"
              : `${props.focus === "comment" ? "▸ " : ""}Add comment [c] · Tab focus · ↑/↓ scroll · Esc Back`}
        </text>
      </box>
    </box>
  );
}
