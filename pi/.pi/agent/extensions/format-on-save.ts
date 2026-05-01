/**
 * Auto-format files after every write or edit.
 *
 * Mirrors the formatter config from the old Opencode setup.
 * Runs silently — failures are reported as warnings but don't
 * interrupt the session.
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

// Map of file extensions to [command, ...args].
// The file path is appended as the final argument.
const FORMATTERS: Record<string, [string, ...string[]]> = {
	js: ["prettier", "--write"],
	jsx: ["prettier", "--write"],
	ts: ["prettier", "--write"],
	tsx: ["prettier", "--write"],
	json: ["prettier", "--write"],
	css: ["prettier", "--write"],
	scss: ["prettier", "--write"],
	html: ["prettier", "--write"],
	md: ["prettier", "--write"],
	svelte: ["prettier", "--write"],
	py: ["ruff", "format"],
	pyi: ["ruff", "format"],
	go: ["gofmt", "-w"],
	gd: ["gdformat"],
};

function extOf(path: string): string {
	const dot = path.lastIndexOf(".");
	return dot >= 0 ? path.slice(dot + 1).toLowerCase() : "";
}

export default function (pi: ExtensionAPI) {
	pi.on("tool_result", async (event, _ctx) => {
		if (event.toolName !== "write" && event.toolName !== "edit") {
			return undefined;
		}

		const input = event.input as Record<string, unknown>;
		const path = String(input.path ?? input.file_path ?? "");

		if (!path || event.isError) {
			return undefined;
		}

		const ext = extOf(path);
		const formatter = FORMATTERS[ext];

		if (!formatter) {
			return undefined;
		}

		const [cmd, ...args] = formatter;

		try {
			await pi.exec(cmd, [...args, path]);
		} catch {
			// Formatter not installed or failed — don't interrupt the session.
			// The agent can still work; formatting is best-effort.
		}

		return undefined;
	});
}
