import assert from "node:assert/strict";
import { test } from "node:test";
import { testRender } from "@opentui/solid";
import { createSignal } from "solid-js";
import { TicketWindow, WorkspaceContent } from "../ui/content.tsx";
import { CommentComposer } from "../ui/comment.tsx";
import { projectAdf } from "../lib/adf.ts";
import type { IssueDetail } from "../lib/types.ts";
import { ViewTabs, screenHint } from "../ui/chrome.tsx";
import "./native-review.tsx";
import "./session-return.tsx";

globalThis.fetch = async () => {
  throw new Error("Network forbidden in renderer fixtures");
};
const theme = {
  text: {
    base: "white",
    muted: "gray",
    accent: "cyan",
    success: "green",
    warning: "yellow",
    error: "red",
  },
  background: { base: "black" },
};
const issue: IssueDetail = {
  key: "FIXTURE-1",
  summary: "Unicode 界 ticket",
  type: "Task",
  status: "Custom",
  statusId: "1",
  statusCategory: "To Do",
  assignee: null,
  assigneeId: null,
  epicKey: null,
  parentKey: null,
  points: null,
  priority: null,
  updated: "",
  url: "https://example.invalid/browse/FIXTURE-1",
  description: null,
  links: [],
  subtasks: [],
  parent: null,
  epic: null,
};
for (const [width, height] of [
  [140, 40],
  [80, 24],
  [40, 12],
  [20, 8],
])
  test(`DQA-01..06 native tabs compact controls metadata ${width}x${height}`, async () => {
    const [view, setView] = createSignal<any>("mine");
    const [screen, setScreen] = createSignal("tabs");
    const context = {
      theme,
      renderer: { width, height },
      keymap: {
        mode: { current: () => "jira-comment", push: () => () => {} },
        layer: () => {},
      },
      ui: { router: { current: () => ({ name: "jira" }) } },
    };
    const setup = await testRender(
      () => (
        <box width="100%" height="100%">
          {screen() === "tabs" ? (
            <ViewTabs
              context={context}
              view={view()}
              focus="tabs"
              width={width}
              switchView={setView}
            />
          ) : screen() === "ticket" ? (
            <TicketWindow
              context={context}
              ticket={{ issue, blocks: projectAdf("body"), relationships: [] }}
              selected={0}
              focus="body"
              enabled={() => true}
              back={() => {}}
              comment={() => {}}
              open={() => {}}
              link={() => {}}
              register={() => {}}
            />
          ) : (
            <CommentComposer
              context={context}
              state={{ site: "example.invalid", key: "FIXTURE-1", initial: "" }}
              save={() => {}}
              send={async () => {
                throw Error("forbidden");
              }}
              close={() => {}}
              success={() => {}}
            />
          )}
        </box>
      ),
      { width, height },
    );
    try {
      await setup.flush();
      if (width >= 80)
        for (const name of ["My Work", "Sprint", "Backlog", "Epics"])
          assert.ok(setup.captureCharFrame().includes(name));
      setView("epics");
      await setup.flush();
      assert.match(setup.captureCharFrame(), /Epics/);
      setScreen("ticket");
      await setup.flush();
      const frame = setup.captureCharFrame();
      assert.match(frame, /FIXTURE-1/);
      if (width >= 80) {
        assert.match(frame, /Task/);
        assert.match(frame, /Custom/);
        assert.match(frame, /Unicode/);
      }
      setScreen("composer");
      await setup.flush();
      assert.match(setup.captureCharFrame(), /Submit/);
      assert.match(setup.captureCharFrame(), /Cancel/);
      assert.doesNotMatch(
        screenHint(width, "body", true, false, false),
        /columns/,
      );
      assert.doesNotMatch(
        screenHint(width, "content", false, false, false),
        /columns/,
      );
    } finally {
      await setup.dispose();
    }
  });

for (const [width, height] of [
  [140, 40],
  [80, 24],
  [40, 12],
  [20, 8],
]) {
  test(`native board geometry every column reachable ${width}x${height}`, async () => {
    const [column, setColumn] = createSignal(0);
    const rows = ["Custom", "Empty", "Unmapped", "Done"].flatMap(
      (label, index): any[] => [
        { kind: "group", label, count: index === 1 ? 0 : 1 },
        ...(index === 1
          ? []
          : [
              {
                kind: "issue",
                issue: { ...issue, key: `FIXTURE-${index + 1}` },
              },
            ]),
      ],
    );
    const setup = await testRender(
      () => (
        <box width="100%" height="100%">
          <WorkspaceContent
            context={{ theme }}
            rows={rows}
            selected={1}
            board
            column={column()}
            width={width}
            enabled={() => true}
            open={() => {}}
            openKey={() => {}}
            register={() => {}}
          />
        </box>
      ),
      { width, height },
    );
    try {
      for (let index = 0; index < 4; index++) {
        setColumn(index);
        await setup.flush();
        assert.ok(
          setup
            .captureCharFrame()
            .includes(["Custom", "Empty", "Unmapped", "Done"][index]),
        );
      }
    } finally {
      await setup.dispose();
    }
  });
  test(`native card and long-description scroll fixture ${width}x${height}`, async () => {
    const refs = new Map<string, any>();
    const setup = await testRender(
      () => (
        <box width="100%" height="100%">
          <TicketWindow
            context={{ theme }}
            ticket={{
              issue,
              blocks: projectAdf(
                "start\n" +
                  "long description\n".repeat(100) +
                  "END OF DESCRIPTION",
              ),
              relationships: [],
            }}
            selected={0}
            focus="body"
            enabled={() => true}
            back={() => {}}
            comment={() => {}}
            open={() => {}}
            link={() => {}}
            register={(id, ref) => refs.set(id, ref)}
          />
        </box>
      ),
      { width, height },
    );
    try {
      await setup.flush();
      assert.match(setup.captureCharFrame(), /FIXTURE-1/);
      refs.get("body").scrollTo(10000);
      await setup.flush();
      assert.match(setup.captureCharFrame(), /END OF/);
      assert.ok(refs.get("body").scrollTop > 0);
    } finally {
      await setup.dispose();
    }
  });
}
test("native dragging a card to another column drops on that column, never its own", async () => {
  const dropped: { key: string; column: number }[] = [];
  const rows = [
    { kind: "group", label: "Open", count: 1 },
    { kind: "issue", issue: { ...issue, key: "FIXTURE-1", statusId: "1" } },
    { kind: "group", label: "Blocked", count: 0 },
    { kind: "group", label: "Done", count: 0 },
  ];
  const setup = await testRender(
    () => (
      <box width="100%" height="100%">
        <WorkspaceContent
          context={{ theme }}
          rows={rows}
          selected={1}
          board
          column={0}
          width={96}
          enabled={() => true}
          open={() => {}}
          openKey={() => {}}
          dropCard={(droppedIssue: any, column: number) =>
            dropped.push({ key: droppedIssue.key, column })
          }
          register={() => {}}
        />
      </box>
    ),
    { width: 96, height: 24, useMouse: true, enableMouseMovement: true },
  );
  try {
    await setup.flush();
    const card = setup.renderer.root.findDescendantById("card-1") as any;
    const home = setup.renderer.root.findDescendantById("column-0") as any;
    const target = setup.renderer.root.findDescendantById("column-2") as any;
    assert.ok(card && home && target, "board geometry missing");
    await setup.mockMouse.drag(card.x + 2, card.y + 1, home.x + 3, home.y + 5);
    await setup.flush();
    assert.deepEqual(
      dropped,
      [],
      "a drop onto the card's own column must not move it",
    );
    await setup.mockMouse.drag(
      card.x + 2,
      card.y + 1,
      target.x + 3,
      target.y + 5,
    );
    await setup.flush();
    assert.deepEqual(dropped, [{ key: "FIXTURE-1", column: 2 }]);
  } finally {
    await setup.dispose();
  }
});
test("native textarea Enter, paste and Meta/Ctrl Enter never write; explicit Submit writes once", async () => {
  let factory: any;
  let mode = "base",
    writes = 0,
    draft = "",
    closed = false;
  const context = {
    theme,
    ui: { router: { current: () => ({ name: "jira" }) } },
    keymap: {
      mode: {
        current: () => mode,
        push: (value: string) => {
          mode = value;
          return () => {
            mode = "base";
          };
        },
      },
      layer: (value: any) => {
        factory = value;
      },
    },
  };
  const setup = await testRender(
    () => (
      <CommentComposer
        context={context}
        state={{ site: "example.invalid", key: "FIXTURE-1", initial: "" }}
        save={(value) => {
          draft = value;
        }}
        send={async () => {
          writes++;
        }}
        close={() => {
          closed = true;
        }}
        success={() => {
          closed = true;
        }}
      />
    ),
    { width: 80, height: 24, kittyKeyboard: true },
  );
  try {
    await setup.flush();
    const frame = setup.captureCharFrame().split("\n");
    const submitLine = frame.findIndex((line) => line.includes("Submit"));
    await setup.mockMouse.click(2, submitLine);
    const editor = setup.renderer.root.findDescendantById(
      "jira-comment-editor",
    ) as any;
    assert.ok(editor);
    await setup.mockMouse.click(editor.x + 1, editor.y + 1);
    await setup.flush();
    assert.equal(
      factory()
        .commands.find((c: any) => c.bind === "return")
        .run(),
      false,
    );
    await setup.mockInput.typeText("first");
    setup.mockInput.pressEnter();
    await setup.mockInput.pasteBracketedText("second\nthird");
    setup.mockInput.pressEnter({ meta: true });
    setup.mockInput.pressEnter({ ctrl: true });
    await setup.flush();
    assert.equal(writes, 0);
    assert.match(draft, /first\nsecond\nthird/);
    factory()
      .commands.find((c: any) => c.bind === "tab")
      .run();
    factory()
      .commands.find((c: any) => c.bind === "return")
      .run();
    factory()
      .commands.find((c: any) => c.bind === "return")
      .run();
    await setup.flush();
    assert.equal(writes, 1);
    assert.equal(closed, true);
  } finally {
    await setup.dispose();
  }
});

for (const variant of ["light", "monochrome"])
  test(`native ${variant} theme keeps text-only identity and actions`, async () => {
    const [current, setCurrent] = createSignal(theme);
    const setup = await testRender(
      () => (
        <TicketWindow
          context={{
            get theme() {
              return current();
            },
          }}
          ticket={{
            issue,
            blocks: projectAdf("Description fixture"),
            relationships: [],
          }}
          selected={0}
          focus="back"
          enabled={() => true}
          back={() => {}}
          comment={() => {}}
          open={() => {}}
          link={() => {}}
          register={() => {}}
        />
      ),
      { width: 40, height: 12 },
    );
    try {
      await setup.flush();
      setCurrent({
        text: {
          base: variant === "light" ? "black" : "white",
          muted: "gray",
          accent: variant === "light" ? "blue" : "white",
          success: "white",
          warning: "white",
          error: "white",
        },
        background: { base: variant === "light" ? "white" : "black" },
      });
      await setup.flush();
      assert.match(setup.captureCharFrame(), /FIXTURE-1 · ▸ Back/);
      assert.match(setup.captureCharFrame(), /Add comment/);
    } finally {
      await setup.dispose();
    }
  });
