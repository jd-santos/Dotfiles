import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const globalRoot = execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim();
const piDir = process.env.PI_TEST_PACKAGE_DIR ?? join(globalRoot, "@earendil-works/pi-coding-agent");
let ts;
try {
	const lensRequire = createRequire(join(globalRoot, "pi-lens/package.json"));
	ts = lensRequire("typescript");
} catch { /* Runtime tests still run without Lens's optional typechecker. */ }

test("permission gate and prompt typecheck against the installed Pi SDK", { skip: !ts && "TypeScript from the installed pi-lens package is unavailable" }, () => {
	const extensionDir = fileURLToPath(new URL("../", import.meta.url));
	const options = {
		target: ts.ScriptTarget.ES2023,
		module: ts.ModuleKind.ESNext,
		moduleResolution: ts.ModuleResolutionKind.Bundler,
		strict: true, skipLibCheck: true, noEmit: true, allowImportingTsExtensions: true,
		typeRoots: [join(piDir, "node_modules/@types")], types: ["node"],
		paths: {
			"@earendil-works/pi-coding-agent": [join(piDir, "dist/index.d.ts")],
			"@earendil-works/pi-tui": [join(piDir, "node_modules/@earendil-works/pi-tui/dist/index.d.ts")],
		},
	};
	const program = ts.createProgram(["permission-gate.ts", "lib/permission-prompt.ts"].map((path) => join(extensionDir, path)), options);
	const errors = ts.getPreEmitDiagnostics(program).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
	const describe = (diagnostic) => {
		const line = diagnostic.file?.getLineAndCharacterOfPosition(diagnostic.start ?? 0).line;
		return `${diagnostic.file ? `${diagnostic.file.fileName}:${line + 1}` : "compiler"}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")}`;
	};
	assert.equal(errors.length, 0, errors.map(describe).join("\n"));
});
