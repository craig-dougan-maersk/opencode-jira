import { createSignal, onCleanup } from "solid-js";
import type { TextareaRenderable } from "@opentui/core";
import { color, leftClick } from "./types.ts";
import { terminalText } from "../lib/adf.ts";

export interface ComposerState {
  readonly key: string;
  readonly site: string;
  readonly initial: string;
}
interface Props {
  context: any;
  state: ComposerState;
  save: (value: string) => void;
  send: (text: string, state: ComposerState) => Promise<unknown>;
  close: () => void;
  success: (state: ComposerState) => void;
}
export function CommentComposer(props: Props) {
  const [focus, setFocus] = createSignal(0);
  const [text, setText] = createSignal(props.state.initial);
  const [pending, setPending] = createSignal(false);
  const [error, setError] = createSignal("");
  const [width, setWidth] = createSignal(props.context.renderer?.width ?? 80);
  let editor: TextareaRenderable | undefined;
  const pop = props.context.keymap.mode.push("jira-comment");
  onCleanup(pop);
  const allowed = () =>
    props.context.ui.router.current().name === "jira" &&
    props.context.keymap.mode.current() === "jira-comment";
  const valid = () =>
    !!text().trim() &&
    text().length <= 32000 &&
    terminalText(text()) === text();
  const intendFocus = (index: number) => {
    if (pending()) return;
    setFocus(index);
    if (focus() === 0) editor?.focus();
    else editor?.blur();
  };
  const cycle = (delta: number) => intendFocus((focus() + delta + 3) % 3);
  const cancel = () => {
    if (allowed() && !pending()) {
      props.save(text());
      props.close();
    }
  };
  const submit = async () => {
    if (!allowed() || pending() || !valid()) return;
    const frozen = text();
    const identity = { ...props.state };
    setPending(true);
    props.save(frozen);
    setError("");
    try {
      await props.send(frozen, identity);
      props.success(identity);
    } catch (cause) {
      const status =
        typeof cause === "object" && cause !== null && "status" in cause
          ? Number(cause.status)
          : 0;
      setError(
        status >= 400 && status < 500
          ? `Jira ${status}; comment rejected. Draft retained.`
          : "Delivery uncertain; check Jira before retrying. Draft retained.",
      );
      setPending(false);
      intendFocus(0);
    } finally {
      setPending(false);
    }
  };
  props.context.keymap.layer(() => ({
    mode: "jira-comment",
    priority: 80,
    enabled: allowed,
    commands: [
      {
        id: "jira.comment.tab",
        bind: "tab",
        run: () => {
          if (!pending()) cycle(1);
        },
      },
      {
        id: "jira.comment.shift.tab",
        bind: "shift+tab",
        run: () => {
          if (!pending()) cycle(-1);
        },
      },
      { id: "jira.comment.escape", bind: "escape", run: cancel },
      {
        id: "jira.comment.return",
        bind: "return",
        run: () => {
          if (focus() === 0) return false;
          if (focus() === 1) void submit();
          else cancel();
        },
      },
    ],
  }));
  return (
    <box
      position="absolute"
      left={0}
      top={0}
      width="100%"
      height="100%"
      border
      borderStyle="double"
      backgroundColor={props.context.theme?.background?.base}
      borderColor={color(props.context, "accent")}
      flexDirection="column"
      onSizeChange={function () {
        setWidth(this.width);
      }}
      onMouseUp={(event: { stopPropagation(): void }) =>
        event.stopPropagation()
      }
    >
      <text
        height={1}
        flexShrink={0}
        fg={color(props.context, "base")}
      >{`${props.state.key} · Comment`}</text>
      <textarea
        id="jira-comment-editor"
        onMouseDown={leftClick(() => intendFocus(0))}
        onMouseUp={leftClick(() => intendFocus(0))}
        ref={(ref: TextareaRenderable) => {
          editor = ref;
        }}
        focused={focus() === 0 && !pending()}
        flexGrow={1}
        initialValue={props.state.initial}
        textColor={color(props.context, "base")}
        focusedTextColor={color(props.context, "base")}
        backgroundColor={props.context.theme?.background?.base}
        focusedBackgroundColor={props.context.theme?.background?.base}
        keyBindings={[
          { name: "return", meta: true, action: "newline" },
          { name: "return", ctrl: true, action: "newline" },
        ]}
        onContentChange={() => {
          if (!pending()) {
            const value = editor?.plainText ?? text();
            setText(value);
            props.save(value);
          }
        }}
      />
      <text height={1} flexShrink={0} fg={color(props.context, "error")}>
        {error() ||
          (pending()
            ? "Submitting; target and body frozen…"
            : text().length > 32000
              ? "Plugin limit: 32000 characters"
              : width() < 44
                ? "↵Newline Tab Esc"
                : "Enter: newline · Tab: actions · Esc: retain draft")}
      </text>
      <box flexDirection="row" gap={1} height={1} flexShrink={0}>
        <text
          selectable={false}
          fg={color(props.context, focus() === 1 ? "accent" : "base")}
          onMouseUp={leftClick(() => {
            intendFocus(1);
            void submit();
          })}
          flexShrink={0}
        >{`${focus() === 1 ? "▸ " : ""}Submit${pending() || !valid() ? " ×" : ""}`}</text>
        <text
          selectable={false}
          fg={color(props.context, focus() === 2 ? "accent" : "base")}
          flexShrink={0}
          onMouseUp={leftClick(() => {
            intendFocus(2);
            cancel();
          })}
        >{`${focus() === 2 ? "▸ " : ""}Cancel`}</text>
      </box>
    </box>
  );
}
