import assert from "node:assert/strict";
import { test } from "node:test";
import {
  writes,
  setCommentPending,
  finishComment,
} from "./interaction-jira.ts";

export function sessionReturnTests(
  harness: (origin?: any) => any,
  flush: () => Promise<void>,
) {
  for (const exit of ["escape", "q", "pointer", "keyboard"])
    test(`session return via ${exit} snapshots V2 stable route proxy`, async () => {
      const h = harness({ type: "session", sessionID: "ses_origin" });
      try {
        const stable = h.route();
        await h.open();
        assert.equal(h.route(), stable);
        assert.equal(h.route().type, "plugin");
        await h.open();
        if (exit === "pointer") h.click("Close to session");
        else if (exit === "keyboard") {
          h.press("shift+tab");
          h.press("return");
        } else h.press(exit);
        assert.equal(h.route().type, "session");
        assert.equal(h.route().sessionID, "ses_origin");
      } finally {
        h.dispose();
      }
    });
  test("V2 route proxy modal/composer/history Escape ownership retains origin and pending locks", async () => {
    const h = harness({ type: "session", sessionID: "ses_nested" });
    writes.length = 0;
    try {
      await h.open("TEST-1");
      h.click("PARENT-1");
      await flush();
      h.press("t");
      h.press("escape");
      await flush();
      assert.match(h.text(), /PARENT-1 · Back/);
      h.press("c");
      await flush();
      h.edit("retained");
      h.press("q");
      h.click("Back");
      assert.equal(h.mode(), "jira-comment");
      h.press("escape");
      await flush();
      assert.match(h.text(), /PARENT-1 · Back/);
      h.press("c");
      await flush();
      assert.equal(
        h.nodes().find((n: any) => n.type === "textarea").props.initialValue,
        "retained",
      );
      setCommentPending(true);
      h.edit("pending");
      h.click("Submit");
      await flush();
      for (const key of ["escape", "q", "backspace"]) h.press(key);
      h.click("Back");
      assert.equal(h.mode(), "jira-comment");
      finishComment!();
      await flush();
      h.press("escape");
      assert.match(h.text(), /TEST-1 · Back/);
      h.press("escape");
      assert.equal(h.route().type, "plugin");
      h.press("escape");
      assert.equal(h.route().type, "session");
      assert.equal(h.route().sessionID, "ses_nested");
      assert.equal(writes.length, 1);
    } finally {
      setCommentPending(false);
      finishComment?.();
      await flush();
      h.dispose();
    }
  });
  test("V2 stable home origin falls back to home, not a captured Jira proxy", async () => {
    const h = harness({ type: "home" });
    try {
      await h.open();
      h.press("escape");
      assert.equal(h.route().type, "home");
    } finally {
      h.dispose();
    }
  });
}
