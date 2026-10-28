import assert from "node:assert/strict";
import { test } from "node:test";
import { testRender } from "@opentui/solid";
import { createSignal, onCleanup } from "solid-js";
import plugin from "../tui.tsx";
import { WorkspaceContent, TicketWindow } from "../ui/content.tsx";
import { CommentComposer } from "../ui/comment.tsx";
import { projectAdf } from "../lib/adf.ts";
import { assertReadable } from "./span-contrast.ts";

const noop = () => {};
const light = {
  text: {
    base: "black",
    muted: "gray",
    action: { primary: { base: "blue" } },
    feedback: { error: { base: "red" } },
  },
  background: { base: "white" },
};
const issue: any = {
  key: "LIGHT-1",
  summary: "Light summary",
  type: "Story",
  status: "Queued",
  statusCategory: "To Do",
  assignee: "Owner",
  points: 5,
  priority: "High",
};
test("DQA-07 light board headings/categories, empty states, ticket and composer have readable spans", async () => {
  const [screen, setScreen] = createSignal("board");
  let mode = "base";
  const context = {
    theme: light,
    ui: { router: { current: () => ({ name: "jira" }) } },
    keymap: {
      mode: {
        current: () => mode,
        push: (name: string) => {
          mode = name;
          return () => {
            mode = "base";
          };
        },
      },
      layer: noop,
    },
  };
  const setup = await testRender(
    () => (
      <box width="100%" height="100%" backgroundColor={light.background.base}>
        {screen() === "board" ? (
          <WorkspaceContent
            context={context}
            rows={[
              { kind: "group", label: "Queue", count: 1 },
              { kind: "issue", issue },
              { kind: "group", label: "Empty", count: 0 },
            ]}
            selected={1}
            board
            column={0}
            width={80}
            enabled={() => true}
            open={noop}
            openKey={noop}
            register={noop}
          />
        ) : screen() === "ticket" ? (
          <TicketWindow
            context={context}
            ticket={{
              issue,
              blocks: projectAdf("Light description"),
              relationships: [{ kind: "text", text: "Partial children" }],
            }}
            selected={0}
            focus="body"
            enabled={() => true}
            back={noop}
            comment={noop}
            open={noop}
            link={noop}
            register={noop}
          />
        ) : (
          <CommentComposer
            context={context}
            state={{
              key: "LIGHT-1",
              site: "example.invalid",
              initial: "Draft",
            }}
            save={noop}
            send={async () => {
              throw Error("No writes");
            }}
            close={noop}
            success={noop}
          />
        )}
      </box>
    ),
    { width: 80, height: 24 },
  );
  try {
    await setup.flush();
    assertReadable(setup.captureSpans(), [
      "Queue",
      "To do",
      "Empty",
      "No tickets",
    ]);
    setScreen("ticket");
    await setup.flush();
    assertReadable(setup.captureSpans(), [
      "LIGHT-1",
      "Light summary",
      "Story",
      "Light description",
      "Partial children",
    ]);
    setScreen("composer");
    await setup.flush();
    assertReadable(setup.captureSpans(), [
      "LIGHT-1",
      "Draft",
      "Submit",
      "Cancel",
    ]);
  } finally {
    await setup.dispose();
  }
});
test("DQA-08 full 20x8 route shows selected key/name in My Work and Sprint, metadata scrolls", async () => {
  const layers: any[] = [];
  let routeRender: any;
  const [mode, setMode] = createSignal("base");
  const context: any = {
    renderer: { width: 20, height: 8, on: noop, off: noop },
    theme: light,
    storage: {
      store: (_: any, options: any) => [
        { ...options.initial, boardId: 1 },
        async () => {},
      ],
    },
    keymap: {
      mode: {
        current: mode,
        push: (name: string) => {
          setMode(name);
          return () => setMode("base");
        },
      },
      layer: (factory: any) => layers.push(factory),
    },
    ui: {
      router: {
        current: () => ({ type: "plugin", name: "jira" }),
        register: (def: any) => {
          routeRender = def.render;
        },
        navigate: noop,
      },
      slot: () => noop,
      toast: { show: noop },
      dialog: { select: async () => undefined, prompt: async () => undefined },
    },
  };
  const setup = await testRender(
    () => {
      onCleanup(plugin.setup(context));
      return (
        <box width="100%" height="100%" backgroundColor={light.background.base}>
          {routeRender()}
        </box>
      );
    },
    { width: 20, height: 8 },
  );
  const command = (id: string) =>
    layers.flatMap((factory) => factory().commands).find((c) => c.id === id);
  const settle = async () => {
    for (let i = 0; i < 50; i++) await Promise.resolve();
    await setup.flush();
  };
  try {
    await command("jira.open").run();
    await settle();
    assert.match(setup.captureCharFrame(), /▸ TEST-1/);
    assert.match(setup.captureCharFrame(), /Fixture/);
    command("jira.down").run();
    await settle();
    assert.match(setup.captureCharFrame(), /▸ TEST-2/);
    const column = setup.renderer.root.findDescendantById(
      "compact-board",
    ) as any;
    assert.ok(column);
    column.scrollTo(10000);
    await setup.flush();
    assert.match(setup.captureCharFrame(), /Open/);
    assert.match(setup.captureCharFrame(), /Test User/);
    command("jira.view.sprint").run();
    await settle();
    assert.match(setup.captureCharFrame(), /▸ SPRINT-1/);
    assert.match(setup.captureCharFrame(), /Fixture/);
    assertReadable(setup.captureSpans(), ["SPRINT-1"]);
  } finally {
    await setup.dispose();
  }
});
