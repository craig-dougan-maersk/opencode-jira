import { Show } from "solid-js";
import { WorkspaceContent, TicketWindow } from "./content.tsx";
import { CommentComposer, type ComposerState } from "./comment.tsx";
import type { Issue } from "../lib/types.ts";
import {
  color,
  leftClick,
  type Row,
  type ScrollHandle,
  type Ticket,
} from "./types.ts";

interface Props {
  context: any;
  rows: Row[];
  selected: number;
  workspaceSelected: number;
  board: boolean;
  column: number;
  width: number;
  loading: boolean;
  ticket?: Ticket;
  composer?: ComposerState;
  focus: string;
  detailsKey?: string;
  enabled: () => boolean;
  register: (id: string, ref: ScrollHandle) => void;
  openKey: (key: string) => void;
  open: (index: number) => void;
  dropCard?: (issue: Issue, column: number) => void;
  relationship: (index: number) => void;
  back: () => void;
  comment: () => void;
  link: (href: string) => void;
  save: (value: string) => void;
  close: () => void;
  send: (value: string, state: ComposerState) => Promise<unknown>;
  success: (state: ComposerState) => void;
}
export function WorkspaceViewport(props: Props) {
  return (
    <box flexDirection="column" flexGrow={1} minHeight={1}>
      <Show
        when={props.rows.length > 0}
        fallback={
          <text fg={color(props.context, "base")}>
            {props.loading ? "Loading…" : "No results for current filters."}
          </text>
        }
      >
        <WorkspaceContent
          context={props.context}
          rows={props.rows}
          selected={props.ticket ? props.workspaceSelected : props.selected}
          board={props.board}
          column={props.column}
          width={Math.max(1, props.width - 2)}
          enabled={() => props.enabled() && !props.ticket}
          register={props.register}
          openKey={props.openKey}
          open={props.open}
          dropCard={props.dropCard}
        />
      </Show>
      <Show when={props.detailsKey && !props.ticket}>
        <text
          fg={color(props.context, "base")}
          selectable={false}
          onMouseUp={leftClick(() => {
            if (props.enabled()) props.openKey(props.detailsKey!);
          })}
        >{`${props.focus === "details" ? "▸ " : ""}Details · ${props.detailsKey}`}</text>
      </Show>
      <Show when={props.ticket}>
        {(value) => (
          <TicketWindow
            context={props.context}
            ticket={value()}
            selected={props.selected}
            focus={props.focus}
            enabled={props.enabled}
            back={props.back}
            comment={props.comment}
            link={props.link}
            register={props.register}
            open={props.relationship}
          />
        )}
      </Show>
      <Show when={props.composer}>
        {(state) => (
          <CommentComposer
            context={props.context}
            state={state()}
            save={props.save}
            close={props.close}
            send={props.send}
            success={props.success}
          />
        )}
      </Show>
    </box>
  );
}
