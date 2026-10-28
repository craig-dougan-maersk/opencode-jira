import assert from "node:assert/strict";
import { test } from "node:test";
import {
  readFileSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  cpSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

const manifest = JSON.parse(readFileSync("package.json", "utf8"));
const run = (command, args, cwd = process.cwd(), env = process.env) =>
  execFileSync(command, args, {
    cwd,
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
const temporary = (name) => mkdtempSync(join(tmpdir(), name));

function preparationGuard(directory) {
  const marker = join(directory, "lifecycle-events.txt");
  const preload = join(directory, "observe-lifecycle.cjs");
  writeFileSync(
    preload,
    `
const event = process.env.npm_lifecycle_event;
if (["build", "prepare", "prepack", "preinstall", "install", "postinstall"].includes(event)) {
  require("node:fs").appendFileSync(${JSON.stringify(marker)}, event + "\\n");
}
`,
  );
  return {
    marker,
    install(args, consumer) {
      run("npm", args, consumer, {
        ...process.env,
        NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --require=${JSON.stringify(preload)}`,
      });
      assert.equal(
        existsSync(marker),
        false,
        "Git dependency preparation is forbidden",
      );
    },
  };
}

test("development and CI select the tested native-capable runtime", () => {
  assert.equal(manifest.engines.node, ">=26.12.1");
  assert.match(
    readFileSync(".github/workflows/ci.yml", "utf8"),
    /node-version: 26\.12\.1/,
  );
  assert.match(readFileSync("README.md", "utf8"), /Node 26\.12\.1/);
});

test("compiled entry exists and no Git preparation triggers are present", () => {
  assert.equal(manifest.exports["./tui"], "./dist/tui.js");
  assert.ok(existsSync("dist/tui.js"));
  for (const hook of [
    "build",
    "prepack",
    "prepare",
    "preinstall",
    "install",
    "postinstall",
    "prepublish",
    "prepublishOnly",
  ])
    assert.equal(manifest.scripts?.[hook], undefined, hook);
  assert.equal(manifest.workspaces, undefined);
});

test("packed package contains only public compiled runtime and documentation", () => {
  const destination = temporary("jira-pack-");
  const [packed] = JSON.parse(
    run("npm", [
      "pack",
      "--ignore-scripts",
      "--json",
      "--pack-destination",
      destination,
    ]),
  );
  assert.deepEqual(packed.files.map((file) => file.path).sort(), [
    "LICENSE",
    "README.md",
    "dist/tui.js",
    "package.json",
  ]);
  const code = run("tar", [
    "-xOf",
    join(destination, packed.filename),
    "package/dist/tui.js",
  ]);
  assert.ok(code.length > 0);
});

test("actual npm Git dependency install needs neither compile nor lifecycle scripts", () => {
  const directory = temporary("jira-git-install-");
  const repo = join(directory, "repo");
  const consumer = join(directory, "consumer");
  mkdirSync(repo);
  mkdirSync(consumer);
  for (const file of ["package.json", "README.md", "LICENSE", "dist"])
    cpSync(file, join(repo, file), { recursive: true });
  run("git", ["init", "--initial-branch=fixture"], repo);
  run(
    "git",
    ["add", "package.json", "README.md", "LICENSE", "dist/tui.js"],
    repo,
  );
  // An ephemeral SSH key signs the synthetic fixture without using user credentials.
  const signingKey = join(directory, "fixture-signing-key");
  run("ssh-keygen", [
    "-q",
    "-t",
    "ed25519",
    "-N",
    "",
    "-C",
    "fixture@example.invalid",
    "-f",
    signingKey,
  ]);
  run(
    "git",
    [
      "-c",
      "user.name=Packaging Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "-c",
      "gpg.format=ssh",
      "-c",
      `user.signingkey=${signingKey}`,
      "commit",
      "-S",
      "-m",
      "test: compiled Git package fixture",
    ],
    repo,
  );
  const sha = run("git", ["rev-parse", "HEAD"], repo).trim();
  const spec =
    process.env.GIT_PACKAGE_SPEC ?? `git+${pathToFileURL(repo).href}#${sha}`;
  writeFileSync(
    join(consumer, "package.json"),
    JSON.stringify({ name: "offline-consumer", private: true, type: "module" }),
  );
  // Real npm install; runtime peers belong to the host and are intentionally omitted.
  const guard = preparationGuard(directory);
  guard.install(
    [
      "install",
      "--ignore-scripts",
      "--legacy-peer-deps",
      "--no-audit",
      "--no-fund",
      spec,
    ],
    consumer,
  );
  const installed = join(consumer, "node_modules", manifest.name);
  const actual = JSON.parse(
    readFileSync(join(installed, "package.json"), "utf8"),
  );
  assert.equal(actual.exports["./tui"], "./dist/tui.js");
  assert.equal(
    readFileSync(join(installed, "dist/tui.js"), "utf8"),
    readFileSync("dist/tui.js", "utf8"),
  );
  assert.equal(existsSync(join(installed, "tui.tsx")), false);
  assert.equal(existsSync(join(installed, "node_modules")), false);
  // Supply real host runtimes, then import the installed JS directly (no compiler).
  for (const name of ["solid-js", "@opentui/core", "@opentui/solid"]) {
    const target = join(consumer, "node_modules", name);
    mkdirSync(join(target, ".."), { recursive: true });
    symlinkSync(join(process.cwd(), "node_modules", name), target, "dir");
  }
  run(
    process.execPath,
    [
      "--conditions=browser",
      "--input-type=module",
      "-e",
      `const plugin = (await import('opencode-jira/tui')).default; if (plugin.id !== 'opencode-jira.tui' || typeof plugin.setup !== 'function') throw Error('Invalid installed export')`,
    ],
    consumer,
  );
  // Scripts-enabled Git installation also must not trigger npm preparation.
  const other = join(directory, "scripts-enabled");
  mkdirSync(other);
  writeFileSync(join(other, "package.json"), '{"private":true}');
  guard.install(
    ["install", "--legacy-peer-deps", "--no-audit", "--no-fund", spec],
    other,
  );
  assert.equal(
    readFileSync(
      join(other, "node_modules", manifest.name, "dist/tui.js"),
      "utf8",
    ),
    readFileSync("dist/tui.js", "utf8"),
  );
  // Negative control: a signed Git package with prepare must be rejected by
  // the same installation guard, rather than silently succeeding.
  const negativeManifest = {
    name: "jira-prepare-negative-fixture",
    version: "1.0.0",
    files: ["unexpected-preparation"],
    scripts: {
      prepare:
        "node -e \"require('node:fs').writeFileSync('unexpected-preparation', 'executed')\"",
    },
  };
  writeFileSync(join(repo, "package.json"), JSON.stringify(negativeManifest));
  run("git", ["add", "package.json"], repo);
  run(
    "git",
    [
      "-c",
      "user.name=Packaging Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "-c",
      "gpg.format=ssh",
      "-c",
      `user.signingkey=${signingKey}`,
      "commit",
      "-S",
      "-m",
      "test: forbidden prepare negative control",
    ],
    repo,
  );
  const negativeSha = run("git", ["rev-parse", "HEAD"], repo).trim();
  const negativeSpec = `git+${pathToFileURL(repo).href}#${negativeSha}`;
  const negativeConsumer = join(directory, "negative-consumer");
  mkdirSync(negativeConsumer);
  writeFileSync(join(negativeConsumer, "package.json"), '{"private":true}');
  assert.throws(
    () =>
      guard.install(
        [
          "install",
          "--legacy-peer-deps",
          "--no-audit",
          "--no-fund",
          negativeSpec,
        ],
        negativeConsumer,
      ),
    /Git dependency preparation is forbidden/,
  );
  assert.match(readFileSync(guard.marker, "utf8"), /^prepare$/m);
  assert.equal(
    readFileSync(
      join(
        negativeConsumer,
        "node_modules",
        negativeManifest.name,
        "unexpected-preparation",
      ),
      "utf8",
    ),
    "executed",
  );
});
