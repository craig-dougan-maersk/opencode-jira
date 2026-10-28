import type { Issue, IssueDetail } from "../lib/types.ts";
import type { AdfBlock } from "../lib/adf.ts";
export type Tone =
  | "base"
  | "muted"
  | "warning"
  | "error"
  | "success"
  | "accent";
export type Row =
  | { kind: "group"; label: string; count: number; key?: string }
  | { kind: "issue"; issue: Issue; note?: string }
  | { kind: "text"; text: string; tone?: Tone }
  | { kind: "link"; label: string; href: string };
export interface Ticket {
  readonly site?: string;
  readonly issue: IssueDetail;
  readonly blocks: readonly AdfBlock[];
  readonly relationships: readonly Row[];
}
export interface ScrollHandle {
  scrollTop: number;
  scrollLeft: number;
  scrollBy(delta: number | { x: number; y: number }): void;
  scrollTo(position: { x: number; y: number }): void;
  scrollChildIntoView?(id: string): void;
  focus?(): void;
}
export type Scrolls = Record<string, { x: number; y: number }>;
/** A typed semantic adapter. No literal-color fallback; base is the V2 guarantee. */
interface ThemeAdapter {
  readonly text?: Partial<Record<Tone | "subtle", any>> & {
    readonly action?: { readonly primary?: { readonly base: any } };
    readonly feedback?: Partial<
      Record<"warning" | "error" | "success", { readonly base: any }>
    >;
  };
}
export function color(context: { readonly theme?: ThemeAdapter }, tone: Tone) {
  const text = context.theme?.text ?? {};
  if (tone === "accent")
    return text.action?.primary?.base ?? text.accent ?? text.base;
  if (tone === "warning" || tone === "error" || tone === "success")
    return text.feedback?.[tone]?.base ?? text[tone] ?? text.base;
  return (
    text[tone] ?? (tone === "muted" ? text.subtle : undefined) ?? text.base
  );
}
export function statusTone(issue: Issue): Tone {
  if (issue.status.toLowerCase().includes("block")) return "error";
  if (issue.statusCategory === "Done") return "success";
  if (issue.statusCategory === "In Progress") return "warning";
  return "base";
}
export function categoryLabel(category: string) {
  return category === "Done"
    ? "Done"
    : category === "In Progress"
      ? "In progress"
      : category === "To Do"
        ? "To do"
        : category || "Unknown category";
}
export function leftClick(action: () => void) {
  return (event: {
    button: number;
    isDragging?: boolean;
    stopPropagation(): void;
  }) => {
    if (event.button !== 0 || event.isDragging) return;
    event.stopPropagation();
    action();
  };
}
