import assert from "node:assert/strict";
import { test } from "node:test";
import { projectAdf, commentAdf, safeUrl, terminalText } from "../lib/adf.ts";
import { columnWindow, pushScreen, popScreen } from "../lib/navigation.ts";
import { groupByColumn } from "../lib/model.ts";

test("ADF preserves long code, lists, tables, links and strips terminal controls", () => {
  const blocks = projectAdf({
    type: "doc",
    content: [
      {
        type: "codeBlock",
        attrs: { language: "plain" },
        content: [{ type: "text", text: "  x\n\ty" + "z".repeat(5000) }],
      },
      {
        type: "orderedList",
        attrs: { order: 3 },
        content: [
          {
            type: "listItem",
            content: [
              { type: "paragraph", content: [{ type: "text", text: "item" }] },
            ],
          },
        ],
      },
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [
              { type: "tableCell", content: [{ type: "text", text: "cell" }] },
            ],
          },
        ],
      },
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "link",
            marks: [
              { type: "link", attrs: { href: "https://example.invalid" } },
            ],
          },
        ],
      },
      { type: "media", attrs: { alt: "asset" } },
    ],
  });
  assert.ok(blocks[0].text.includes("  x\n\ty"));
  assert.ok(blocks[0].text.length > 5000);
  assert.match(blocks.map((b) => b.text).join("\n"), /3\. item/);
  assert.ok(blocks.some((b) => b.href));
  assert.ok(blocks.some((b) => b.text.includes("Unsupported: media")));
  assert.equal(terminalText("a\x00\x1b[31mb"), "ab");
  assert.equal(safeUrl("javascript:alert(1)"), undefined);
  assert.equal(safeUrl("https://user:password@example.invalid"), undefined);
});
test("multiline comment serialization keeps blank lines and whitespace", () => {
  const doc = commentAdf(" a\n\nb \n");
  assert.deepEqual(
    doc.content.map((p) => p.content?.[0]?.text ?? ""),
    [" a", "", "b ", ""],
  );
});
test("bounded hostile ADF has visible limit", () => {
  let node: unknown = { type: "text", text: "end" };
  for (let i = 0; i < 100; i++) node = { type: "blockquote", content: [node] };
  assert.match(
    projectAdf(node)
      .map((b) => b.text)
      .join(""),
    /limit/i,
  );
});
test("immutable nested screen history retains selection and offsets", () => {
  const a = { key: "A-1", selected: 4, scroll: { body: { x: 2, y: 70 } } };
  const b = { key: "B-1", selected: 2, scroll: { body: { x: 0, y: 10 } } };
  const stack = pushScreen(pushScreen([], a), b);
  const [rest, restored] = popScreen(stack);
  assert.deepEqual(restored, b);
  assert.deepEqual(popScreen(rest)[1], a);
  assert.equal(stack.length, 2);
});
test("responsive window reveals every column even on tiny terminals", () => {
  for (const width of [140, 80, 40, 20])
    for (let selected = 0; selected < 8; selected++) {
      const w = columnWindow(width, 8, selected);
      assert.ok(w.start <= selected && w.start + w.count > selected);
      assert.ok(w.width <= width);
    }
});
test("empty and arbitrary unmapped columns are retained", () => {
  assert.deepEqual(
    groupByColumn([], [{ name: "Custom", statusIds: ["123"] }]),
    [{ column: "Custom", issues: [] }],
  );
});
test("RV-03 malformed and hostile wide ADF is bounded before accumulation", () => {
  const malformed = projectAdf({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "safe",
            marks: [null, 4, { type: "link", attrs: "bad" }],
          },
        ],
      },
    ],
  });
  assert.match(malformed.map((b) => b.text).join(""), /safe/);
  const wide = projectAdf({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: Array.from({ length: 25000 }, () => ({
          type: "text",
          text: "x".repeat(1000),
          marks: Array(100).fill({ type: "strong" }),
        })),
      },
    ],
  });
  assert.ok(wide.reduce((n, b) => n + b.text.length, 0) < 202000);
  assert.match(wide.map((b) => b.text).join(""), /safety limit/);
  assert.doesNotMatch(wide.at(-1)!.text, /fallback below/);
});
test("RR-04 wide primitive children stop reading at text budget before concatenation", () => {
  let reads = 0;
  const children = Array.from({ length: 500 }, () => "x".repeat(1000));
  for (let index = 0; index < children.length; index++)
    Object.defineProperty(children, index, {
      get: () => {
        reads++;
        return "x".repeat(1000);
      },
    });
  const blocks = projectAdf({
    type: "doc",
    content: [{ type: "paragraph", content: children }],
  });
  assert.ok(reads <= 200, `budget bypass read ${reads} primitive children`);
  assert.ok(blocks.reduce((sum, block) => sum + block.text.length, 0) < 202000);
  assert.match(blocks.map((block) => block.text).join(""), /safety limit/);
});
