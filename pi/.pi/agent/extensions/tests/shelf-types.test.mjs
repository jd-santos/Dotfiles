import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const globalRoot = execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim();
const piDir = process.env.PI_TEST_PACKAGE_DIR ?? join(globalRoot, "@earendil-works/pi-coding-agent");
let ts;
for (const root of [globalRoot, join(homedir(), ".pi/agent/npm/node_modules")]) {
  try { ts = createRequire(join(root, "pi-lens/package.json"))("typescript"); break; }
  catch { /* TypeScript is optional; runtime tests do not need it. */ }
}

test("shelf layout typechecks against the installed Pi TUI", { skip: !ts && "TypeScript from pi-lens is unavailable" }, () => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const options = {
    target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true, skipLibCheck: true, noEmit: true, allowImportingTsExtensions: true,
    typeRoots: [join(piDir, "node_modules/@types")], types: ["node"],
    paths: { "@earendil-works/pi-tui": [join(piDir, "node_modules/@earendil-works/pi-tui/dist/index.d.ts")] },
  };
  const program = ts.createProgram([join(root, "lib/shelf-view.ts")], options);
  const errors = ts.getPreEmitDiagnostics(program).filter((item) => item.category === ts.DiagnosticCategory.Error);
  assert.equal(errors.length, 0, errors.map((item) => {
    const location = item.file?.getLineAndCharacterOfPosition(item.start ?? 0);
    return `${item.file?.fileName}:${(location?.line ?? 0) + 1}: ${ts.flattenDiagnosticMessageText(item.messageText, "\n")}`;
  }).join("\n"));
});
