import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { parse } from "@babel/parser";

test("compiled JavaScript uses host Solid/OpenTUI imports, not a bundled second runtime", () => {
  const code = readFileSync("dist/tui.js", "utf8");
  const ast = parse(code, { sourceType: "module" });
  const imports = ast.program.body
    .filter((node) => node.type === "ImportDeclaration")
    .map((node) => node.source.value);
  for (const runtime of ["solid-js", "@opentui/solid"])
    assert.ok(imports.includes(runtime), runtime);
  for (const name of imports)
    assert.ok(
      name.startsWith("node:") ||
        name === "solid-js" ||
        name.startsWith("solid-js/") ||
        name.startsWith("@opentui/"),
      name,
    );
  assert.doesNotMatch(
    code,
    /node_modules|react\/jsx-runtime|solid-js\/dist|\.tsx["']/,
  );
  assert.ok(imports.length > 0);
});

test("freshness rejects a stale generated entry without overwriting it", () => {
  const original = readFileSync("dist/tui.js", "utf8");
  try {
    writeFileSync("dist/tui.js", original + "\n// stale fixture\n");
    assert.throws(
      () =>
        execFileSync(process.execPath, ["scripts/compile.mjs", "--check"], {
          stdio: "pipe",
        }),
      /stale/,
    );
    assert.equal(
      readFileSync("dist/tui.js", "utf8"),
      original + "\n// stale fixture\n",
    );
  } finally {
    writeFileSync("dist/tui.js", original);
  }
});

test("locked tooling uses patched Seroval; runtime peers remain external", () => {
  const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
  const serializer = Object.entries(lock.packages).filter(([path]) =>
    path.endsWith("node_modules/seroval"),
  );
  assert.ok(serializer.length > 0);
  for (const [, pkg] of serializer) assert.equal(pkg.version, "1.6.3");
});
