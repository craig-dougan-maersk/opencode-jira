import type { Plugin } from "@opencode/plugin/tui";
import plugin from "../tui.tsx";

// This is the V2 contract, not @opencode-ai/plugin or the V1 SDK.
const definition: Plugin.Definition = plugin;
export function checkHost(context: Plugin.Context) {
  const settings = context.storage.store("settings", {
    initial: { site: "example.atlassian.net" },
  });
  const site: string = settings[0].site;
  context.ui.router.current();
  context.ui.router.navigate({ type: "session", sessionID: "fixture" });
  context.keymap.layer(() => ({
    mode: "global",
    commands: [{ id: "jira.fixture", run: () => {} }],
  }));
  return { definition, site };
}
