/* global console, process */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const outputPath = path.join(
  projectRoot,
  "src/lib/zapscript/commandNames.json",
);

const modelsPath = process.argv[2];
if (!modelsPath) {
  console.error(
    "Usage: node scripts/sync-zapscript-commands.mjs <path to go-zapscript models.go>",
  );
  process.exit(1);
}

const source = fs.readFileSync(modelsPath, "utf8");
const constantPattern = /^\s*ZapScriptCmd\w+\s*=\s*"([^"]+)"(.*)$/gm;
const current = [];
const deprecated = [];
for (const [, name, trailing] of source.matchAll(constantPattern)) {
  (/\/\/\s*DEPRECATED/.test(trailing) ? deprecated : current).push(name);
}
if (current.length === 0) {
  throw new Error(`No ZapScriptCmd constants found in ${modelsPath}`);
}

// A Go module cache checkout names its directory go-zapscript@<version>; a
// plain clone carries no version, so the recorded one is kept.
const versionMatch = /@(v\d[^/\\]*)/.exec(path.resolve(modelsPath));
let version = versionMatch?.[1];
if (!version && fs.existsSync(outputPath)) {
  version = JSON.parse(fs.readFileSync(outputPath, "utf8")).version;
}

const output = {
  version: version ?? "unknown",
  current: current.sort(),
  deprecated: deprecated.sort(),
};
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(
  `Wrote ${current.length} current and ${deprecated.length} deprecated commands (${output.version}) to ${path.relative(projectRoot, outputPath)}`,
);
