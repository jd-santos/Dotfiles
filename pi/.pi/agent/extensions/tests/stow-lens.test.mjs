import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const available = spawnSync("stow", ["--version"]).status === 0;

test("Stow deploys Lens config without linking runtime state", { skip: !available && "GNU Stow is unavailable" }, () => {
  const fixture = mkdtempSync(join(tmpdir(), "pi-stow-lens-"));
  try {
    const packages = join(fixture, "packages");
    const source = join(packages, "pi");
    const target = join(fixture, "home");
    mkdirSync(join(source, ".pi-lens/cache"), { recursive: true });
    mkdirSync(join(target, ".pi-lens"), { recursive: true });
    const ignore = readFileSync(new URL("../../../../.stow-local-ignore", import.meta.url), "utf8");
    const config = readFileSync(new URL("../../../../.pi-lens/config.json", import.meta.url), "utf8");
    assert.equal(JSON.parse(config).widget.visible, false);
    writeFileSync(join(source, ".stow-local-ignore"), ignore);
    writeFileSync(join(source, ".pi-lens/config.json"), config);
    writeFileSync(join(source, ".pi-lens/cache/example.json"), "{}\n");
    writeFileSync(join(source, ".pi-lens/turn-state.json"), "{}\n");
    writeFileSync(join(target, ".pi-lens/local-state.json"), "{}\n");
    const args = ["--no-folding", "--verbose", "--dir", packages, "--target", target, "pi"];
    const options = { cwd: fixture, env: { ...process.env, HOME: target }, encoding: "utf8", stdio: "pipe" };
    const simulate = () => {
      const result = spawnSync("stow", ["--simulate", ...args], options);
      assert.equal(result.status, 0, result.stderr);
      return result.stdout + result.stderr;
    };
    const correct = simulate();
    assert.match(correct, /LINK: \.pi-lens\/config\.json/);
    assert.doesNotMatch(correct, /LINK: .*example|LINK: .*turn-state|MKDIR: .*cache/);

    // Stow prepends '/' when matching path patterns. Dropping it is a regression.
    writeFileSync(join(source, ".stow-local-ignore"), ignore.replace("^/\\.pi-lens/", "^\\.pi-lens/"));
    const incorrect = simulate();
    assert.match(incorrect, /LINK: .*turn-state/);
    writeFileSync(join(source, ".stow-local-ignore"), ignore);
    execFileSync("stow", args, options);
    assert.deepEqual(readdirSync(join(target, ".pi-lens")).sort(), ["config.json", "local-state.json"]);
    assert.ok(lstatSync(join(target, ".pi-lens/config.json")).isSymbolicLink());
    assert.equal(JSON.parse(readFileSync(join(target, ".pi-lens/config.json"), "utf8")).widget.visible, false);
    assert.equal(readFileSync(join(target, ".pi-lens/local-state.json"), "utf8"), "{}\n");
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
