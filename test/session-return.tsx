import assert from "node:assert/strict";
import { test } from "node:test";
import { createSignal, onCleanup, Show } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { testRender } from "@opentui/solid";
import plugin from "../tui.tsx";

// Offline native input bridge models V2.2.0 ji()/Ui(): base default, modal owns
// Escape, named binds register once, false falls through, highest priority wins.
// This is not the installed host keymap implementation or a live CLI acceptance test.
for (const key of ["escape", "q"])
  test(`native input ${key} restores stable session route and disposes Jira layer`, async () => {
    const layers = new Set<() => any>();
    const [route, setRoute] = createStore<any>({
      type: "session",
      sessionID: "ses_native_origin",
    });
    const [mode, setMode] = createSignal("base");
    let renderRoute: any;
    const noop = () => {};
    const context: any = {
      renderer: { width: 80, height: 24, on: noop, off: noop },
      theme: { text: { base: "white", muted: "gray", accent: "cyan" } },
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
            const previous = mode();
            setMode(name);
            return () => setMode(previous);
          },
        },
        layer: (factory: () => any) => {
          layers.add(factory);
          onCleanup(() => layers.delete(factory));
        },
      },
      ui: {
        router: {
          current: () => route,
          navigate: (next: any) => setRoute(reconcile(next)),
          register: (def: any) => {
            renderRoute = def.render;
          },
        },
        slot: () => noop,
        toast: { show: noop },
        dialog: {
          select: async () => undefined,
          prompt: async () => undefined,
        },
      },
    };
    const setup = await testRender(
      () => {
        onCleanup(plugin.setup(context));
        return (
          <Show
            when={route.type === "plugin"}
            fallback={<text>Origin session</text>}
          >
            {() => renderRoute()}
          </Show>
        );
      },
      { width: 80, height: 24 },
    );
    const input = (event: any) => {
      for (const layer of [...layers]
        .map((f) => f())
        .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))) {
        if (layer.enabled && !layer.enabled()) continue;
        if (layer.mode !== "global" && (layer.mode ?? "base") !== mode())
          continue;
        const command = layer.commands.find((c: any) => c.bind === event.name);
        if (command && command.run(undefined, event) !== false) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
      }
    };
    setup.renderer.keyInput.on("keypress", input);
    try {
      await [...layers]
        .flatMap((f) => f().commands)
        .find((c) => c.id === "jira.open")
        .run();
      for (let i = 0; i < 50; i++) await Promise.resolve();
      await setup.flush();
      assert.match(setup.captureCharFrame(), /Close to session/);
      setMode("modal");
      if (key === "escape") {
        setup.mockInput.pressEscape();
        await new Promise((resolve) => setTimeout(resolve, 50));
      } else setup.mockInput.pressKey(key);
      await setup.flush();
      assert.equal(route.type, "plugin");
      setMode("base");
      if (key === "escape") {
        setup.mockInput.pressEscape();
        await new Promise((resolve) => setTimeout(resolve, 50));
      } else setup.mockInput.pressKey(key);
      await setup.flush();
      assert.equal(route.type, "session");
      assert.equal(route.sessionID, "ses_native_origin");
      assert.match(setup.captureCharFrame(), /Origin session/);
      assert.equal(
        [...layers].some((f) =>
          f().commands.some((c: any) => c.id === "jira.close.escape"),
        ),
        false,
      );
    } finally {
      setup.renderer.keyInput.off("keypress", input);
      await setup.dispose();
    }
  });
