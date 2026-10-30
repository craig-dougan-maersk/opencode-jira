import { createEffect, For, Show } from "solid-js";
import { VIEWS } from "./keymap.ts";
import { color, leftClick, type ScrollHandle } from "./types.ts";
import type { ViewName } from "../lib/types.ts";
export function ViewTabs(props: {
  context: any;
  view: ViewName;
  focus: string;
  width: number;
  switchView(view: ViewName): void;
}) {
  let scroll: ScrollHandle | undefined;
  createEffect(() => {
    props.width;
    props.focus;
    const active = props.view === "issue" ? "mine" : props.view;
    const labels = VIEWS.filter((item) => item.id !== "issue");
    const index = labels.findIndex((item) => item.id === active);
    const offset = labels
      .slice(0, index)
      .reduce((total, item) => total + item.label.length + 2, 0);
    queueMicrotask(() =>
      scroll?.scrollTo({ x: props.width >= 44 ? 0 : offset, y: 0 }),
    );
  });
  return (
    <Show
      when={props.width >= 44}
      fallback={
        <box height={1} flexShrink={0} flexDirection="row">
          <text
            flexShrink={0}
            selectable={false}
            onMouseUp={leftClick(() => {
              const index = VIEWS.findIndex((item) => item.id === props.view);
              props.switchView(VIEWS[(Math.max(0, index) + 3) % 4].id);
            })}
          >
            ‹{" "}
          </text>
          <text
            flexShrink={0}
            selectable={false}
            onMouseUp={leftClick(() =>
              props.switchView(props.view === "issue" ? "mine" : props.view),
            )}
          >{`[${VIEWS.find((item) => item.id === props.view)?.label ?? "My Work"}]`}</text>
          <text
            flexShrink={0}
            selectable={false}
            onMouseUp={leftClick(() => {
              const index = VIEWS.findIndex((item) => item.id === props.view);
              props.switchView(VIEWS[(Math.max(0, index) + 1) % 4].id);
            })}
          >
            {" "}
            ›
          </text>
        </box>
      }
    >
      <scrollbox
        ref={(ref: ScrollHandle) => {
          scroll = ref;
        }}
        scrollX
        scrollY={false}
        height={1}
        flexShrink={0}
        contentOptions={{ flexDirection: "row", minWidth: 39 }}
      >
        <For each={VIEWS.filter((item) => item.id !== "issue")}>
          {(item) => (
            <text
              id={`tab-${item.id}`}
              width={item.label.length + 3}
              flexShrink={0}
              selectable={false}
              fg={color(
                props.context,
                item.id === props.view ? "accent" : "muted",
              )}
              onMouseUp={leftClick(() => props.switchView(item.id))}
            >
              {item.id === props.view
                ? `${props.focus === "tabs" ? "▸" : ""}[${item.label}]`
                : ` ${item.label} `}
            </text>
          )}
        </For>
      </scrollbox>
    </Show>
  );
}
export function screenHint(
  width: number,
  focus: string,
  ticket: boolean,
  board: boolean,
  composer: boolean,
) {
  if (width < 44) {
    if (composer) return "↵Newline Tab Esc";
    if (ticket)
      return focus === "relationships"
        ? "↑↓ ↵Link Tab Esc"
        : "↑↓Scroll Tab Esc";
    if (focus === "tabs") return "←→Tabs ↵ Tab Esc";
    return "↵Open Tab EscBack";
  }
  if (composer) return "Enter newline · Tab actions · Escape retains draft";
  if (ticket)
    return focus === "relationships"
      ? "↑/↓ targets · Enter follow · m status · b backlog · Tab focus · Esc Back"
      : "↑/↓ scroll · m status · b backlog · Tab focus · Esc Back · r Refresh";
  if (focus === "tabs")
    return "Tabs ←/→ · ↓/Enter content · Tab focus · Esc Back";
  if (board)
    return "←/→ col · ⇧←/→ move card · m status · b backlog · ↑/↓ move · Enter open · Tab focus · Esc Back";
  return "List · ↑/↓ move · Enter open · Tab focus · Esc Back · r Refresh";
}
export function SessionReturnControl(props: {
  context: any;
  width: number;
  nested: boolean;
  focused: boolean;
  back(): void;
}) {
  return (
    <text
      id="jira-session-back"
      fg={color(props.context, props.focused ? "accent" : "base")}
      selectable={false}
      flexShrink={0}
      onMouseUp={leftClick(props.back)}
    >
      {`${props.focused ? "▸" : ""}${props.nested ? "Back" : props.width < 44 ? "Close" : "Close to session"} `}
    </text>
  );
}
