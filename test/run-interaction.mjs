// Dependencies stay outside the plugin: npm install --prefix "$TEST_DEPS" ...
import { createRequire } from "node:module";
import { readFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import path, { dirname } from "node:path";

const deps =
  process.env.TEST_DEPS ?? fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(path.join(deps, "package.json"));
const { build } = require("esbuild");
const { transformAsync } = require("@babel/core");
const project = fileURLToPath(new URL("../", import.meta.url));
const production = process.argv.includes("--build");
const native = process.argv.includes("--native") || production;
const outputDirectory = path.join(deps, ".test-output");
await mkdir(outputDirectory, { recursive: true });
const outfile = path.join(
  outputDirectory,
  production ? "jira-tui.mjs" : native ? "native.mjs" : "interaction.mjs",
);
await build({
  entryPoints: [
    path.join(
      project,
      production
        ? "tui.tsx"
        : native
          ? "test/native.tsx"
          : "test/interaction.ts",
    ),
  ],
  outfile,
  bundle: true,
  external: native ? ["@opentui/*", "solid-js", "solid-js/*"] : [],
  platform: "node",
  format: "esm",
  conditions: ["browser"],
  nodePaths: [path.join(deps, "node_modules")],
  plugins: [
    {
      name: "isolated-solid-route",
      setup(build) {
        if (!production)
          build.onResolve({ filter: /(?:^|\/)lib\/jira\.ts$/ }, () => ({
            path: path.join(project, "test/interaction-jira.ts"),
          }));
        build.onResolve({ filter: /^test-renderer$/ }, () => ({
          path: path.join(project, "test/interaction-renderer.ts"),
        }));
        build.onLoad({ filter: /\.tsx$/ }, async ({ path }) => {
          const result = await transformAsync(await readFile(path, "utf8"), {
            filename: path,
            presets: [
              [
                require.resolve("babel-preset-solid"),
                {
                  generate: "universal",
                  moduleName: native ? "@opentui/solid" : "test-renderer",
                },
              ],
            ],
            parserOpts: { plugins: [["typescript", { isTSX: true }], "jsx"] },
          });
          return {
            contents: result.code,
            loader: "ts",
            resolveDir: dirname(path),
          };
        });
      },
    },
  ],
});
const result = spawnSync(
  process.execPath,
  production
    ? [
        "--conditions=browser",
        "--input-type=module",
        "-e",
        `const plugin = (await import(${JSON.stringify(outfile)})).default; if (plugin.id !== 'opencode-jira.tui' || typeof plugin.setup !== 'function') throw new Error('invalid plugin export')`,
      ]
    : ["--conditions=browser", "--test", outfile],
  { stdio: "inherit" },
);
process.exitCode = result.status ?? 1;
