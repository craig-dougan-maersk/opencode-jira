import { readFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { transformAsync } from "@babel/core";

const root = fileURLToPath(new URL("../", import.meta.url));
const check = process.argv.includes("--check");
const result = await build({
  absWorkingDir: root,
  entryPoints: ["tui.tsx"],
  outfile: "dist/tui.js",
  bundle: true,
  packages: "external",
  platform: "node",
  format: "esm",
  target: "node22",
  write: false,
  metafile: true,
  plugins: [
    {
      name: "solid-universal",
      setup(builder) {
        builder.onLoad({ filter: /\.tsx$/ }, async ({ path }) => {
          const transformed = await transformAsync(
            await readFile(path, "utf8"),
            {
              filename: path,
              babelrc: false,
              configFile: false,
              presets: [
                [
                  "babel-preset-solid",
                  { generate: "universal", moduleName: "@opentui/solid" },
                ],
              ],
              parserOpts: { plugins: [["typescript", { isTSX: true }], "jsx"] },
            },
          );
          return {
            contents: transformed.code,
            loader: "ts",
            resolveDir: dirname(path),
          };
        });
      },
    },
  ],
});
for (const input of Object.keys(result.metafile.inputs)) {
  if (input.includes("node_modules"))
    throw new Error(`Bundled runtime dependency: ${input}`);
}
const output = result.outputFiles[0];
if (check) {
  if ((await readFile(output.path, "utf8")) !== output.text)
    throw new Error(
      "dist/tui.js is stale; run npm run compile and commit the output",
    );
} else {
  await mkdir(dirname(output.path), { recursive: true });
  const { writeFile } = await import("node:fs/promises");
  await writeFile(output.path, output.contents);
}
