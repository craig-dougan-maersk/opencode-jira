import assert from "node:assert/strict";
import { test } from "node:test";
import { createRoot, createSignal, onCleanup } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { sessionReturnTests } from "./session-return-interaction.ts";
import plugin from "../tui.tsx";
import { render, type TestNode } from "./interaction-renderer.ts";
import {
  writes,
  delayedReads,
  setDelayKey,
  setCommentFailure,
  setCommentPending,
  finishComment,
  siteWrites,
  setBaselineDelay,
  fixtures,
  issueReads,
  setFailKey,
  transitionWrites,
  backlogWrites,
  setBoardColumns,
  setTransitions,
} from "./interaction-jira.ts";

type Command = {
  id?: string;
  bind?: string;
  enabled?: boolean | (() => boolean);
  run: (...args: any[]) => unknown;
};
test("RV-01 settings invalidates originating-site detail before any comment", async () => {
  const h = harness();
  siteWrites.length = 0;
  try {
    await h.open("TEST-1");
    h.press(",");
    assert.equal(h.mode(), "modal");
    h.answer("other.invalid");
    await flush();
    assert.equal(h.mode(), "modal");
    h.answer("OTHER");
    await flush();
    assert.equal(h.mode(), "modal");
    h.answer("1");
    await flush();
    assert.doesNotMatch(h.text(), /TEST-1 · Back/);
    h.press("c");
    await flush();
    assert.equal(h.mode(), "base");
    assert.deepEqual(siteWrites, []);
  } finally {
    h.dispose();
  }
});
for (const intent of ["switch", "exit", "newer"])
  test(`RV-02 direct continuation cancelled by ${intent}`, async () => {
    const h = harness();
    let release!: () => void;
    setBaselineDelay(
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    );
    try {
      const old = h.open("TEST-1");
      await flush();
      setBaselineDelay();
      if (intent === "switch") h.press("2");
      else if (intent === "exit") h.press("escape");
      else await h.open("PARENT-1");
      await flush();
      release();
      await old;
      await flush();
      assert.doesNotMatch(h.text(), /TEST-1 · Back/);
      if (intent === "newer") assert.match(h.text(), /PARENT-1 · Back/);
    } finally {
      setBaselineDelay();
      release();
      h.dispose();
    }
  });
test("RV-03 malformed marks project safely and commit exactly one history entry", async () => {
  const h = harness();
  try {
    await h.open("TEST-1");
    fixtures.malformed = true;
    h.click("PARENT-1");
    await flush();
    assert.match(h.text(), /PARENT-1 · Back/);
    h.press("escape");
    assert.match(h.text(), /TEST-1 · Back/);
    h.press("escape");
    assert.doesNotMatch(h.text(), /TEST-1 · Back/);
  } finally {
    fixtures.malformed = false;
    h.dispose();
  }
});
test("RV-04 pointer editor restores Enter newline intent after disabled Submit", async () => {
  const h = harness();
  writes.length = 0;
  try {
    await h.open("TEST-1");
    h.press("c");
    await flush();
    h.click("Submit");
    const editor = h.nodes().find((n) => n.type === "textarea")!;
    (editor.props.onMouseUp as Function)({ button: 0, stopPropagation() {} });
    h.edit("valid");
    h.press("return");
    await flush();
    assert.equal(writes.length, 0);
  } finally {
    h.dispose();
  }
});
test("RV-05 failed target Retry cannot survive Back to workspace", async () => {
  const h = harness();
  try {
    await h.open("TEST-1");
    setFailKey("PARENT-1");
    h.click("PARENT-1");
    await flush();
    h.press("escape");
    const before = issueReads.length;
    h.press("r");
    await flush();
    assert.equal(issueReads.length, before);
    assert.doesNotMatch(h.text(), /error:|FAIL-1 · Back/);
  } finally {
    setFailKey("");
    h.dispose();
  }
});
test("RV-07 failed epic children is atomic and successful partial counts labelled", async () => {
  const h = harness();
  fixtures.epics = [{ ...fixtureIssue("EPIC-1"), type: "Epic" }];
  try {
    await h.open();
    h.press("4");
    await flush();
    h.press("down");
    fixtures.childrenFail = true;
    h.press("return");
    await flush();
    assert.match(h.text(), /\[Epics\]/);
    assert.doesNotMatch(h.text(), /epic:EPIC/);
    fixtures.childrenFail = false;
    fixtures.partial = true;
    h.press("r");
    await flush();
    assert.match(h.text(), /partial.*done/);
    h.press("escape");
    assert.match(h.text(), /\[Epics\]/);
  } finally {
    fixtures.epics = undefined;
    fixtures.partial = false;
    fixtures.childrenFail = false;
    h.dispose();
  }
});
test("RV-08 confirmed mutation refreshes detail without adding history", async () => {
  const h = harness();
  try {
    await h.open("TEST-1");
    h.press("m");
    await flush();
    assert.equal(h.mode(), "modal");
    h.answer("2");
    await flush();
    assert.match(h.text(), /Resolved/);
    h.press("escape");
    assert.doesNotMatch(h.text(), /TEST-1 · Back/);
  } finally {
    fixtures.changed = false;
    h.dispose();
  }
});
test("KB-01 shift+right confirms and moves the board card to the next column", async () => {
  const h = harness();
  transitionWrites.length = 0;
  try {
    await h.open();
    assert.match(h.text(), /\[My Work\]/);
    h.press("shift+right");
    await flush();
    assert.equal(h.mode(), "modal");
    h.answer(true);
    await flush();
    assert.deepEqual(transitionWrites, [{ key: "TEST-1", id: "2" }]);
  } finally {
    transitionWrites.length = 0;
    h.dispose();
  }
});
test("KB-02 cancelled and boundary column moves never write", async () => {
  const h = harness();
  transitionWrites.length = 0;
  try {
    await h.open();
    h.press("shift+right");
    await flush();
    assert.equal(h.mode(), "modal");
    h.answer(false);
    await flush();
    assert.deepEqual(transitionWrites, []);
    h.press("shift+left");
    await flush();
    assert.equal(h.mode(), "base");
    assert.deepEqual(transitionWrites, []);
  } finally {
    transitionWrites.length = 0;
    h.dispose();
  }
});
test("KB-03 b sends the selected issue to the backlog without a dialog", async () => {
  const h = harness();
  backlogWrites.length = 0;
  try {
    await h.open();
    h.press("b");
    await flush();
    assert.equal(h.mode(), "base");
    assert.deepEqual(backlogWrites, ["TEST-1"]);
  } finally {
    backlogWrites.length = 0;
    h.dispose();
  }
});
test("KB-04 dropping a card on the next column confirms and moves it", async () => {
  const h = harness();
  transitionWrites.length = 0;
  try {
    await h.open();
    h.drag("card-1", "column-1");
    await flush();
    assert.equal(h.mode(), "modal");
    h.answer(true);
    await flush();
    assert.deepEqual(transitionWrites, [{ key: "TEST-1", id: "2" }]);
  } finally {
    transitionWrites.length = 0;
    h.dispose();
  }
});
test("KB-05 dropping on a non-adjacent column skips the one between", async () => {
  const h = harness(undefined, { width: 96, height: 30 });
  transitionWrites.length = 0;
  setBoardColumns([
    { name: "Open", statusIds: ["1"] },
    { name: "Blocked", statusIds: ["9"] },
    { name: "Build", statusIds: ["2"] },
  ]);
  setTransitions([
    { id: "9", name: "Blocked", to: { id: "9", name: "Blocked" } },
    { id: "2", name: "Resolved", to: { id: "2", name: "Build" } },
  ]);
  try {
    await h.open();
    assert.ok(h.node("column-2"), "third column is not rendered");
    h.drag("card-1", "column-2");
    await flush();
    assert.equal(h.mode(), "modal");
    h.answer(true);
    await flush();
    assert.deepEqual(transitionWrites, [{ key: "TEST-1", id: "2" }]);
  } finally {
    setBoardColumns();
    setTransitions();
    transitionWrites.length = 0;
    h.dispose();
  }
});
test("KB-06 dropping a card back on its own column never opens a dialog or writes", async () => {
  const h = harness();
  transitionWrites.length = 0;
  try {
    await h.open();
    h.drag("card-1", "column-0");
    await flush();
    assert.equal(h.mode(), "base");
    assert.deepEqual(transitionWrites, []);
  } finally {
    transitionWrites.length = 0;
    h.dispose();
  }
});
test("KB-07 a cancelled drop writes nothing", async () => {
  const h = harness();
  transitionWrites.length = 0;
  try {
    await h.open();
    h.drag("card-1", "column-1");
    await flush();
    assert.equal(h.mode(), "modal");
    h.answer(false);
    await flush();
    assert.deepEqual(transitionWrites, []);
  } finally {
    transitionWrites.length = 0;
    h.dispose();
  }
});
test("KB-08 a column the workflow cannot reach directly refuses the drop", async () => {
  const h = harness();
  transitionWrites.length = 0;
  setTransitions([
    { id: "9", name: "Blocked", to: { id: "9", name: "Blocked" } },
  ]);
  try {
    await h.open();
    h.drag("card-1", "column-1");
    await flush();
    assert.equal(h.mode(), "base");
    assert.deepEqual(transitionWrites, []);
  } finally {
    setTransitions();
    transitionWrites.length = 0;
    h.dispose();
  }
});
const fixtureIssue = (key: string) => ({
  key,
  summary: key,
  type: "Task",
  status: "Queued",
  statusId: "1",
  statusCategory: "To Do",
  assignee: null,
  assigneeId: null,
  epicKey: null,
  parentKey: null,
  points: null,
  priority: null,
  updated: "",
  url: "https://example.invalid/browse/" + key,
});
test("RV-06 stable key selection follows reorder and workflow column moves", async () => {
  const h = harness();
  try {
    fixtures.issues = [
      fixtureIssue("TEST-1"),
      { ...fixtureIssue("TEST-2"), statusId: "2" },
    ];
    await h.open();
    h.press("right");
    fixtures.issues = [
      { ...fixtureIssue("TEST-2"), statusId: "1" },
      fixtureIssue("TEST-1"),
    ];
    h.press("r");
    await flush();
    h.press("return");
    await flush();
    assert.match(h.text(), /TEST-2 · Back/);
    h.press("escape");
    h.press("down");
    h.press("return");
    await flush();
    assert.match(h.text(), /TEST-1 · Back/);
  } finally {
    fixtures.issues = undefined;
    h.dispose();
  }
});
test("RV-09 backlog epic header is a keyboard detail target", async () => {
  const h = harness();
  fixtures.issues = [{ ...fixtureIssue("BACKLOG-1"), epicKey: "EPIC-1" }];
  try {
    await h.open();
    h.press("3");
    await flush();
    h.press("down");
    h.press("up");
    h.press("return");
    await flush();
    assert.match(h.text(), /EPIC-1 · Back/);
  } finally {
    fixtures.issues = undefined;
    h.dispose();
  }
});
test("RV-10 root underlay remains immutable through ticket graph ticket Back", async () => {
  const h = harness();
  try {
    await h.open("TEST-1");
    h.press("g");
    await flush();
    assert.match(h.text(), /Dependency tree/);
    h.press("return");
    await flush();
    assert.match(h.text(), /RELATED-1 · Back/);
    assert.match(h.text(), /Columns.*TEST-1.*TEST-2/s);
    h.press("escape");
    assert.match(h.text(), /Dependency tree/);
    h.press("escape");
    assert.match(h.text(), /TEST-1 · Back/);
    h.press("escape");
    assert.doesNotMatch(h.text(), /Dependency tree/);
  } finally {
    h.dispose();
  }
});
test("RR-01 global commands cannot dismiss editing or pending composer; success clears frozen draft", async () => {
  const h = harness();
  writes.length = 0;
  setCommentPending(true);
  try {
    await h.open("TEST-1");
    h.press("c");
    await flush();
    h.edit("pending");
    await h
      .commands()
      .find((c) => c.id === "jira.settings.command")!
      .run();
    await flush();
    assert.equal(h.mode(), "jira-comment");
    h.click("Submit");
    await flush();
    await h
      .commands()
      .find((c) => c.id === "jira.settings.command")!
      .run();
    await h.open("PARENT-1");
    h.press("escape");
    h.click("Submit");
    await flush();
    assert.equal(h.mode(), "jira-comment");
    assert.ok(h.nodes().some((n) => n.type === "textarea"));
    assert.deepEqual(writes, [{ key: "TEST-1", text: "pending" }]);
    finishComment!();
    await flush();
    assert.equal(h.mode(), "base");
    assert.match(h.text(), /TEST-1 · Back/);
    assert.doesNotMatch(h.text(), /Delivery uncertain/);
    h.press("c");
    await flush();
    assert.equal(
      h.nodes().find((n) => n.type === "textarea")!.props.initialValue,
      "",
    );
    h.press("escape");
    h.press("escape");
    assert.doesNotMatch(h.text(), /TEST-1 · Back/);
    assert.equal(writes.length, 1);
  } finally {
    setCommentPending(false);
    finishComment?.();
    await flush();
    h.dispose();
  }
});
for (const pending of [false, true])
  test(`RR-02 late relationship cannot replace composer origin (${pending ? "pending success" : "editing cancel"})`, async () => {
    const h = harness();
    writes.length = 0;
    setCommentPending(pending);
    try {
      await h.open("TEST-1");
      setDelayKey("PARENT-1");
      h.click("PARENT-1");
      await flush();
      h.press("c");
      await flush();
      h.edit("frozen A");
      if (pending) {
        h.click("Submit");
        await flush();
      }
      delayedReads.get("PARENT-1")!();
      await flush();
      assert.match(h.text(), /TEST-1 · Back/);
      assert.doesNotMatch(h.text(), /PARENT-1 · Back/);
      assert.equal(h.mode(), "jira-comment");
      if (pending) {
        finishComment!();
        await flush();
        assert.deepEqual(writes, [{ key: "TEST-1", text: "frozen A" }]);
      } else {
        h.press("escape");
        await flush();
        assert.equal(writes.length, 0);
      }
      assert.equal(h.mode(), "base");
      h.press("escape");
      assert.doesNotMatch(h.text(), /TEST-1 · Back|PARENT-1 · Back/);
    } finally {
      setDelayKey("");
      delayedReads.clear();
      setCommentPending(false);
      finishComment?.();
      await flush();
      h.dispose();
    }
  });
test("RR-03 successful graph clears failed relationship Retry and refresh reads current graph", async () => {
  const h = harness();
  try {
    await h.open("TEST-1");
    setFailKey("PARENT-1");
    h.click("PARENT-1");
    await flush();
    setFailKey("");
    h.press("g");
    await flush();
    assert.match(h.text(), /Dependency tree · TEST-1/);
    assert.doesNotMatch(h.text(), /error:/);
    const before = issueReads.length;
    h.press("r");
    await flush();
    assert.ok(issueReads.length > before);
    assert.equal(issueReads[before], "TEST-1");
    assert.match(h.text(), /Dependency tree · TEST-1/);
    assert.doesNotMatch(h.text(), /PARENT-1 · Back|error:/);
    h.press("escape");
    assert.match(h.text(), /TEST-1 · Back/);
  } finally {
    setFailKey("");
    h.dispose();
  }
});
type Layer = {
  mode?: string;
  priority?: number;
  enabled?: boolean | (() => boolean);
  commands: Command[];
};
const enabled = (value: Layer["enabled"]) =>
  typeof value === "function" ? value() : value !== false;
const flush = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};
globalThis.fetch = async () => {
  throw new Error("Network forbidden in interaction fixtures");
};

function harness(origin?: any, viewport?: { width: number; height: number }) {
  const layers = new Set<() => Layer>();
  const [mode, setMode] = createSignal("base");
  const [signalRoute, setSignalRoute] = createSignal({
    type: "plugin",
    name: "jira",
  });
  // V2.2.0 Route provider keeps a stable createStore proxy and reconciles navigation.
  const [hostRoute, updateRoute] = createStore(origin ?? { type: "home" });
  const route = origin ? () => hostRoute : signalRoute;
  const setRoute = origin
    ? (next: any) => updateRoute(reconcile(next))
    : setSignalRoute;
  let routeRender: () => TestNode;
  let resolveDialog: ((value: unknown) => void) | undefined;
  let hostHits = 0;
  const root: TestNode = { type: "root", props: {}, children: [] };
  const openDialog = () =>
    new Promise((resolve) => {
      resolveDialog = resolve;
      setMode("modal");
    });
  const closeDialog = () => {
    setMode("base");
    resolveDialog?.(undefined);
    resolveDialog = undefined;
  };
  const settings = {
    site: "example.atlassian.net",
    projectKey: "DEMO",
    boardId: 1,
    cacheSeconds: 60,
    linkDepth: 2,
  };
  const answer = (value: unknown) => {
    if (!resolveDialog) return;
    setMode("base");
    const resolve = resolveDialog;
    resolveDialog = undefined;
    resolve?.(value);
  };
  const context = {
    renderer: viewport,
    storage: {
      store: (_name: string, options: any) => [
        settings,
        async (mutation: any) => mutation(settings),
      ],
    },
    theme: { text: { base: "white", muted: "gray", accent: "blue" } },
    keymap: {
      mode: {
        current: mode,
        push: (name: string) => {
          const old = mode();
          setMode(name);
          return () => setMode(old);
        },
      },
      layer(factory: () => Layer) {
        layers.add(factory);
        onCleanup(() => layers.delete(factory));
      },
    },
    ui: {
      router: {
        register: (def: any) => {
          routeRender = def.render;
          return () => undefined;
        },
        current: route,
        navigate: setRoute,
      },
      dialog: { select: openDialog, prompt: openDialog, confirm: openDialog },
      toast: { show: () => undefined },
      slot: () => () => undefined,
    },
  };
  const dispose = createRoot((cleanup) => {
    plugin.setup(context);
    render(() => routeRender(), root);
    return cleanup;
  });
  // Model V2.2.0 ji(): named command bind supplies one binding automatically;
  // global has no mode constraint, omitted mode defaults to base. Highest priority wins.
  layers.add(() => ({
    mode: "global",
    priority: 0,
    commands: [
      {
        bind: "2",
        run: () => {
          hostHits++;
        },
      },
    ],
  }));
  layers.add(() => ({
    mode: "modal",
    commands: [{ bind: "escape", run: closeDialog }],
  }));
  const commands = () => [...layers].flatMap((factory) => factory().commands);
  const press = (key: string) => {
    for (const layer of [...layers]
      .map((factory) => factory())
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))) {
      if (
        !enabled(layer.enabled) ||
        (layer.mode !== "global" && (layer.mode ?? "base") !== mode())
      )
        continue;
      const command = layer.commands.find(
        (command) => command.bind === key && enabled(command.enabled),
      );
      if (command && command.run() !== false) return;
    }
  };
  const nodes = (node = root): TestNode[] => [
    node,
    ...node.children.flatMap((child) => nodes(child)),
  ];
  const text = (node = root): string =>
    (node.text ?? "") + node.children.map((child) => text(child)).join("");
  const click = (label: string) => {
    const node = nodes().find(
      (node) =>
        node.type === "text" &&
        typeof node.props.onMouseUp === "function" &&
        text(node).includes(label),
    );
    assert.ok(node, `missing ${label} tab`);
    assert.equal(
      typeof node.props.onMouseUp,
      "function",
      `${label} has no click handler`,
    );
    (node.props.onMouseUp as Function)({
      button: 0,
      stopPropagation() {},
      preventDefault() {},
    });
  };
  const node = (id: string) => nodes().find((entry) => entry.props.id === id);
  const drag = (cardId: string, columnId: string) => {
    const card = node(cardId);
    assert.ok(card, `missing card ${cardId}`);
    const column = node(columnId);
    assert.ok(column, `missing column ${columnId}`);
    assert.equal(
      typeof card.props.onMouseDrag,
      "function",
      `${cardId} is not draggable`,
    );
    assert.equal(
      typeof column.props.onMouseDrop,
      "function",
      `${columnId} is not a drop target`,
    );
    (card.props.onMouseDrag as Function)();
    (card.props.onMouseDragEnd as Function)();
    (column.props.onMouseDrop as Function)();
  };
  const open = async (key?: string) => {
    await commands()
      .find((command) => command.id === "jira.open")!
      .run(key);
    await flush();
  };
  const edit = (value: string) => {
    const node = nodes().find((n) => n.type === "textarea")!;
    (node as any).plainText = value;
    (node.props.onContentChange as Function)();
  };
  const scroll = (value: number) => {
    const node = nodes()
      .filter((n) => n.type === "scrollbox")
      .at(-1)!;
    (node as any).scrollTop = value;
  };
  return {
    open,
    press,
    click,
    drag,
    node,
    text,
    commands,
    dispose,
    route,
    mode,
    nodes,
    edit,
    scroll,
    hostHits: () => hostHits,
    answer,
  };
}

test("rendered Sprint tab responds to a click and loads sprint rows", async () => {
  const h = harness();
  try {
    await h.open();
    h.click("Sprint");
    await flush();
    assert.match(h.text(), /\[Sprint\]/);
    assert.match(h.text(), /SPRINT-1/);
  } finally {
    h.dispose();
  }
});

test("1–4 switch the mounted route without host key collision or duplicate bindings", async () => {
  const h = harness();
  try {
    await h.open();
    for (const [key, label] of [
      ["2", "Sprint"],
      ["3", "Backlog"],
      ["4", "Epics"],
      ["1", "My Work"],
    ]) {
      h.press(key);
      await flush();
      assert.ok(h.text().includes(`[${label}]`));
    }
    assert.equal(h.hostHits(), 0);
    const bindings = h
      .commands()
      .filter((c) => c.id?.startsWith("jira.") && c.bind)
      .map((c) => c.bind);
    assert.equal(new Set(bindings).size, bindings.length);
  } finally {
    h.dispose();
  }
});

for (const [key, label] of [
  ["t", "Type"],
  ["a", "Assignee"],
  [",", "Settings"],
  ["/", "Search"],
]) {
  test(`${label} Escape closes only the dialog; all board shortcuts are suspended`, async () => {
    const h = harness();
    try {
      await h.open();
      h.press("j");
      const before = h.text();
      assert.match(before, /▸ TEST-2/);
      h.press(key);
      assert.equal(h.mode(), "modal");
      for (const boardKey of [
        "1",
        "2",
        "3",
        "4",
        "j",
        "k",
        "q",
        "r",
        "m",
        "i",
        "u",
        "s",
        "/",
        ",",
        "a",
        "t",
        "return",
        "backspace",
      ])
        h.press(boardKey);
      h.click("Sprint");
      assert.equal(h.text(), before);
      h.press("escape");
      await flush();
      assert.equal(h.mode(), "base");
      assert.equal(h.route().type, "plugin");
      assert.equal(h.text(), before);
      h.press("escape");
      assert.equal(h.route().type, "home");
    } finally {
      h.dispose();
    }
  });
}

test("board shortcuts are disabled when the host route changes", async () => {
  const h = harness();
  try {
    await h.open();
    const before = h.text();
    h.press("q");
    h.press("3");
    await flush();
    assert.equal(h.text(), before);
  } finally {
    h.dispose();
  }
});

test("left/right is scoped to focused tabs, never content", async () => {
  const h = harness();
  try {
    await h.open();
    h.press("right");
    await flush();
    assert.match(h.text(), /\[My Work\]/);
    h.press("tab");
    h.press("right");
    await flush();
    assert.match(h.text(), /\[Sprint\]/);
    h.press("down");
    h.press("left");
    await flush();
    assert.match(h.text(), /\[Sprint\]/);
  } finally {
    h.dispose();
  }
});
test("nested ticket pointer navigation and Escape restores displayed key and body offset", async () => {
  const h = harness();
  try {
    await h.open();
    h.press("return");
    await flush();
    assert.match(h.text(), /TEST-1 · Back/);
    h.scroll(30);
    h.click("PARENT-1");
    await flush();
    assert.match(h.text(), /PARENT-1 · Back/);
    h.press("escape");
    assert.match(h.text(), /TEST-1 · Back/);
    await flush();
    assert.equal(
      (
        h
          .nodes()
          .filter((n) => n.type === "scrollbox")
          .at(-1) as any
      ).scrollTop,
      30,
    );
    h.press("escape");
    assert.doesNotMatch(h.text(), /TEST-1 · Back/);
    assert.equal(h.route().type, "plugin");
    h.press("escape");
    assert.equal(h.route().type, "home");
  } finally {
    h.dispose();
  }
});
test("direct ticket has baseline; relationship focus never changes comment mutation target", async () => {
  const h = harness();
  writes.length = 0;
  try {
    await h.open("TEST-1");
    h.press("tab");
    h.press("down");
    h.press("c");
    await flush();
    assert.equal(h.mode(), "jira-comment");
    h.edit("first\n\n second");
    for (const key of [
      "return",
      "ctrl+return",
      "meta+return",
      "1",
      "2",
      "q",
      "m",
      "i",
      "r",
      "left",
      "right",
    ])
      h.press(key);
    assert.equal(writes.length, 0);
    h.press("tab");
    h.press("return");
    h.press("return");
    await flush();
    assert.deepEqual(writes, [{ key: "TEST-1", text: "first\n\n second" }]);
    assert.equal(h.mode(), "base");
    h.press("escape");
    assert.match(h.text(), /\[My Work\]/);
    h.press("escape");
    assert.equal(h.route().type, "home");
  } finally {
    h.dispose();
  }
});
test("cancel and uncertain failure retain exact issue-scoped draft without auto retry", async () => {
  const h = harness();
  writes.length = 0;
  setCommentFailure(true);
  try {
    await h.open("TEST-1");
    h.press("c");
    await flush();
    h.edit("keep\n draft");
    h.press("escape");
    await flush();
    h.press("c");
    await flush();
    assert.equal(
      h.nodes().find((n) => n.type === "textarea")!.props.initialValue,
      "keep\n draft",
    );
    h.edit("keep\n draft");
    h.click("Submit");
    await flush();
    assert.match(h.text(), /Delivery uncertain/);
    assert.equal(writes.length, 1);
    h.press("return");
    await flush();
    assert.equal(writes.length, 1);
    h.press("escape");
    await flush();
    h.press("c");
    await flush();
    assert.equal(
      h.nodes().find((n) => n.type === "textarea")!.props.initialValue,
      "keep\n draft",
    );
  } finally {
    setCommentFailure(false);
    h.dispose();
  }
});
test("late ticket read cannot overwrite a newer root view; navigation performs no writes", async () => {
  const h = harness();
  writes.length = 0;
  setDelayKey("TEST-1");
  try {
    await h.open();
    h.press("return");
    await flush();
    h.click("Sprint");
    await flush();
    delayedReads.get("TEST-1")!();
    await flush();
    assert.match(h.text(), /\[Sprint\]/);
    assert.doesNotMatch(h.text(), /TEST-1 · Back/);
    assert.equal(writes.length, 0);
  } finally {
    setDelayKey("");
    delayedReads.clear();
    h.dispose();
  }
});
test("failed relationship read keeps previous ticket with Retry", async () => {
  const h = harness();
  try {
    await h.open("FAIL-1");
    assert.match(h.text(), /\[My Work\]/);
    assert.match(h.text(), /retry/i);
  } finally {
    h.dispose();
  }
});
test("pending submission freezes body/target, ignores duplicate click, Escape and tab activation", async () => {
  const h = harness();
  writes.length = 0;
  setCommentPending(true);
  try {
    await h.open("TEST-1");
    h.press("c");
    await flush();
    h.edit("frozen\nbody");
    h.click("Submit");
    await flush();
    h.edit("changed");
    h.click("Submit");
    h.press("escape");
    h.click("Sprint");
    await flush();
    assert.equal(h.mode(), "jira-comment");
    assert.deepEqual(writes, [{ key: "TEST-1", text: "frozen\nbody" }]);
    finishComment!();
    await flush();
    assert.equal(h.mode(), "base");
    assert.match(h.text(), /TEST-1 · Back/);
  } finally {
    setCommentPending(false);
    h.dispose();
  }
});
sessionReturnTests(harness, flush);
