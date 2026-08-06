# Releasing the Python package

The release workflow builds and publishes Offgrid Review through PyPI Trusted
Publishing. It does not store a PyPI token in GitHub.

## One-time setup

1. Create a protected GitHub environment named `pypi` in
   `jd-santos/offgrid-review`. Requiring approval before deployment keeps
   publication as an explicit action.
2. In PyPI's publishing settings, add a pending Trusted Publisher with:
   - PyPI project name: `offgrid-review`
   - GitHub owner: `jd-santos`
   - Repository: `offgrid-review`
   - Workflow: `release.yml`
   - Environment: `pypi`
3. Confirm that the pending publisher appears before creating the first GitHub
   release.

TestPyPI uses a separate account and publisher configuration. Use it when a
registry-level rehearsal is needed. Local wheel and source-distribution tests
remain mandatory either way.

## Prepare a release

1. Update `project.version` in `pyproject.toml`.
2. Run `uv lock` so `uv.lock` records the same version.
3. Move relevant entries from `Unreleased` into a matching changelog release.
4. Replace temporary Git-source commands in the README, skill, and usage guide
   with the unversioned `uvx offgrid-review` command. Keep exact version pins
   only in release verification examples.
5. Run the supported-Python and browser tests, then build:

   ```bash
   uv run --python 3.10 python -m unittest discover -s tests -p 'test_*.py' -q
   uv run --python 3.14 python -m unittest discover -s tests -p 'test_*.py' -q
   uv sync --locked --group test
   uv run --group test playwright install chromium
   uv run --group test python -m unittest discover -s tests/browser -p 'test_*.py' -q
   uv run python scripts/check_runtime_syntax.py
   rm -rf dist
   uv build
   ```

6. Confirm the wheel contains the GPL license, Apache-2.0 license, notice, and
   generated-runtime package resources. Generate one queue and one planning
   artifact and confirm both embed the Apache license and notice.
7. Smoke-test the wheel in an isolated UVX environment:

   ```bash
   wheel="$(find dist -name '*.whl' -print -quit)"
   cache="$(mktemp -d)"
   UV_CACHE_DIR="$cache" uvx --from "$wheel" offgrid-review --version
   ```

8. Review and push the release commit.

## Publish

Create a GitHub release whose tag is `v` followed by the exact package version,
such as `v0.1.0`. Publishing the GitHub release starts
`.github/workflows/release.yml`.

The workflow:

1. Checks that the tag and package versions match.
2. Runs the test suite.
3. Builds the wheel and source distribution.
4. Passes only those built files to a separate `pypi` environment job.
5. Requests a short-lived OIDC identity and publishes with
   `uv publish --trusted-publishing always`.

After the workflow succeeds, verify the public command from outside the source
checkout:

```bash
uvx --refresh offgrid-review@0.1.0 --version
```

Do not create another file for the same package version. PyPI releases are
immutable, so any correction requires a new version.
