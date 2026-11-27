import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const cliPath = require.resolve("@debugmcp/mcp-debugger/dist/cli.mjs");
const shimPath = path.join(path.dirname(cliPath), "assets", "exitcode-shim.cjs");
const jsDebugDirectory = path.join(path.dirname(cliPath), "vendor", "js-debug");
const proxyDirectory = path.join(path.dirname(cliPath), "proxy");
const [cliSource, exitCodeShimSource] = await Promise.all([
  readFile(cliPath, "utf8"),
  readFile(shimPath, "utf8"),
]);

async function readTree(directory, relativeDirectory = "") {
  const entries = await readdir(path.join(directory, relativeDirectory), {
    withFileTypes: true,
  });
  const files = [];
  for (const entry of entries) {
    const relativePath = path.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await readTree(directory, relativePath)));
    } else if (entry.isFile()) {
      const content = await readFile(path.join(directory, relativePath));
      files.push([relativePath.replaceAll("\\", "/"), content.toString("base64")]);
    }
  }
  return files;
}

const jsDebugFiles = await readTree(jsDebugDirectory);
const proxyFiles = await readTree(proxyDirectory);
const generatedDirectory = path.resolve("generated");
await mkdir(generatedDirectory, { recursive: true });
await writeFile(
  path.join(generatedDirectory, "debugger-engine.ts"),
  `export const debuggerCliSource = ${JSON.stringify(cliSource)};\nexport const exitCodeShimSource = ${JSON.stringify(exitCodeShimSource)};\nexport const jsDebugFiles = ${JSON.stringify(jsDebugFiles)} as const;\nexport const proxyFiles = ${JSON.stringify(proxyFiles)} as const;\n`,
  "utf8",
);
