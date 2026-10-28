/** Untrusted Jira content is text, never terminal markup or HTML. */
export function terminalText(text: string): string {
  return text
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, "");
}
export function safeUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || /[\x00-\x20\x7f]/.test(value)) return;
  try {
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      return;
    return url.href;
  } catch {
    return;
  }
}
export interface AdfBlock {
  readonly text: string;
  readonly kind: "prose" | "code" | "link";
  readonly href?: string;
}
type Node = {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: unknown[];
  marks?: unknown[];
};
const MAX_NODES = 20000;
const MAX_TEXT = 200000;
const MAX_DEPTH = 32;
const labelText = (value: unknown, fallback = "") =>
  typeof value === "string"
    ? terminalText(value.slice(0, 4096))
    : typeof value === "number" && Number.isFinite(value)
      ? String(value)
      : fallback;
export function projectAdf(document: unknown): readonly AdfBlock[] {
  if (typeof document === "string")
    return [
      {
        text:
          terminalText(document.slice(0, MAX_TEXT)) +
          (document.length > MAX_TEXT
            ? "\n[Document safety limit reached; open Jira for full content.]"
            : ""),
        kind: "prose",
      },
    ];
  const blocks: AdfBlock[] = [];
  let nodes = 0,
    chars = 0,
    traversedText = 0,
    limited = false;
  const bounded = (value: string) => {
    const remaining = Math.max(0, MAX_TEXT - traversedText);
    if (value.length > remaining) limited = true;
    const result = terminalText(value.slice(0, remaining));
    traversedText += result.length;
    return result;
  };
  const add = (
    text: string,
    kind: AdfBlock["kind"] = "prose",
    href?: string,
  ) => {
    if (chars >= MAX_TEXT) {
      limited = true;
      return;
    }
    const clean = terminalText(text.slice(0, MAX_TEXT));
    if (chars + clean.length > MAX_TEXT) limited = true;
    blocks.push({ text: clean.slice(0, MAX_TEXT - chars), kind, href });
    chars += clean.length;
  };
  const walk = (value: unknown, depth: number, prefix = ""): string => {
    if (
      ++nodes > MAX_NODES ||
      depth > MAX_DEPTH ||
      chars >= MAX_TEXT ||
      traversedText >= MAX_TEXT
    ) {
      limited = true;
      return "";
    }
    if (!value || typeof value !== "object")
      return typeof value === "string" ? bounded(value) : "";
    const node = value as Node;
    const attrs =
      node.attrs && typeof node.attrs === "object" && !Array.isArray(node.attrs)
        ? node.attrs
        : {};
    const children = Array.isArray(node.content) ? node.content : [];
    const each = (visit: (child: unknown, index: number) => void) => {
      for (let index = 0; index < children.length; index++) {
        if (
          nodes >= MAX_NODES ||
          traversedText >= MAX_TEXT ||
          chars >= MAX_TEXT
        ) {
          limited = true;
          break;
        }
        visit(children[index], index);
      }
    };
    const inline = () => {
      let result = "";
      each((child) => {
        result += walk(child, depth + 1, prefix);
      });
      return result.slice(0, MAX_TEXT);
    };
    switch (node.type) {
      case "text": {
        let text = bounded(typeof node.text === "string" ? node.text : "");
        for (const value of Array.isArray(node.marks) ? node.marks : []) {
          if (++nodes > MAX_NODES || traversedText >= MAX_TEXT) {
            limited = true;
            break;
          }
          if (!value || typeof value !== "object") continue;
          const mark = value as Node;
          const attrs =
            mark.attrs && typeof mark.attrs === "object" ? mark.attrs : {};
          if (mark.type === "strong") text = `**${text}**`;
          if (mark.type === "em") text = `_${text}_`;
          if (mark.type === "code") text = `\`${text}\``;
          if (mark.type === "link") {
            const href =
              typeof attrs.href === "string" && attrs.href.length <= 4096
                ? safeUrl(attrs.href)
                : undefined;
            if (href) add(`${text} → ${href}`, "link", href);
            else text += " [inert link]";
          }
        }
        return text;
      }
      case "hardBreak":
        return "\n";
      case "doc":
        inline();
        return "";
      case "paragraph":
      case "heading": {
        const label =
          node.type === "heading"
            ? `${"#".repeat(Math.max(1, Math.min(6, typeof attrs.level === "number" && Number.isFinite(attrs.level) ? attrs.level : 1)))} `
            : "";
        add(prefix + label + inline());
        return "";
      }
      case "codeBlock":
        add(
          `[Code: ${labelText(attrs.language, "plain")}]\n${inline()}`,
          "code",
        );
        return "";
      case "bulletList":
      case "orderedList":
        each((child, index) =>
          walk(
            child,
            depth + 1,
            prefix +
              (node.type === "orderedList"
                ? `${(typeof attrs.order === "number" && Number.isFinite(attrs.order) ? attrs.order : 1) + index}. `
                : "• "),
          ),
        );
        return "";
      case "listItem":
        inline();
        return "";
      case "blockquote":
        each((child) => {
          walk(child, depth + 1, prefix + "> ");
        });
        return "";
      case "table":
        add("[Table — cells stacked]");
        each((child, index) => {
          add(`Row ${index + 1}`);
          walk(child, depth + 1);
        });
        return "";
      case "tableRow":
        each((child, index) => {
          add(`  Cell ${index + 1}`);
          walk(child, depth + 1, "    ");
        });
        return "";
      case "tableHeader":
        add("[Header]");
        inline();
        return "";
      case "tableCell": {
        const text = inline();
        if (text) add(prefix + text);
        return "";
      }
      case "rule":
        add("────────");
        return "";
      default: {
        add(
          `[Unsupported: ${labelText(node.type, "malformed")}] ${labelText(attrs.alt ?? attrs.name)}`,
        );
        const text = inline();
        if (text) add(text);
        return "";
      }
    }
  };
  const text = walk(document, 0);
  if (text) add(text);
  if (limited)
    blocks.push({
      text: "[Document safety limit reached; bounded plain-text excerpt follows. Open Jira for the full document.]",
      kind: "prose",
    });
  if (limited)
    blocks.push({
      text:
        blocks
          .slice(0, 4)
          .map((block) => block.text)
          .join("\n")
          .slice(0, 1024) || "[No safe text available]",
      kind: "prose",
    });
  if (!blocks.length) add("No description.");
  return blocks;
}
export interface CommentDocument {
  readonly type: "doc";
  readonly version: 1;
  readonly content: readonly {
    readonly type: "paragraph";
    readonly content: readonly {
      readonly type: "text";
      readonly text: string;
    }[];
  }[];
}
export function commentAdf(text: string): CommentDocument {
  return {
    type: "doc",
    version: 1,
    content: text
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map((line) => ({
        type: "paragraph",
        content: line ? [{ type: "text", text: line }] : [],
      })),
  };
}
