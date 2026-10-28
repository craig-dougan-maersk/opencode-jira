import assert from "node:assert/strict";
import { test } from "node:test";
import { JiraClient } from "../lib/jira.ts";

// Fake credentials prevent fallback reads; fake fetch forbids real traffic.
process.env.JIRA_EMAIL = "fixture@example.invalid";
process.env.JIRA_API_TOKEN = "fixture-only-not-a-secret";
for (const status of [201, 400, 429, 503, 0]) {
  test(`comment POST has exactly one attempt for ${status || "transport failure"}`, async () => {
    const calls: { url: string; method: string; body: any }[] = [];
    globalThis.fetch = async (url, options) => {
      assert.equal(new URL(String(url)).hostname, "example.invalid");
      calls.push({
        url: String(url),
        method: options!.method!,
        body: JSON.parse(String(options!.body)),
      });
      if (!status) throw new Error("fixture transport failure");
      return new Response(JSON.stringify({ id: "fixture" }), { status });
    };
    const client = new JiraClient("example.invalid");
    const request = client.addComment("FIXTURE-1", " a\n\nb \n");
    if (status === 201) assert.equal((await request).id, "fixture");
    else await assert.rejects(request);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, "POST");
    assert.deepEqual(
      calls[0].body.body.content.map((p: any) => p.content[0]?.text ?? ""),
      [" a", "", "b ", ""],
    );
  });
}
test("invalid comment or key never reaches fetch", async () => {
  globalThis.fetch = async () => {
    assert.fail("invalid input reached network");
  };
  const client = new JiraClient("example.invalid");
  for (const [key, text] of [
    ["../BAD", "text"],
    ["FIXTURE-1", " "],
    ["FIXTURE-1", "x".repeat(32001)],
    ["FIXTURE-1", "\x00"],
  ])
    await assert.rejects(client.addComment(key, text));
});
