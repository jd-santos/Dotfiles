# Offgrid Review

Offgrid Review gives you a focused interface for decisions that are too complex
for a yes or no in chat. Your agent prepares the evidence, options, proposed
changes, or plan; you review and annotate them in a portable workbench, then
return machine-readable decisions for a verified apply pass.

The result is one self-contained HTML file that works offline and can move
through chat, email, shared storage, or removable media.

[Quick start](#quick-start) · [What it handles](#what-it-handles) ·
[Direct CLI use](#direct-cli-use) · [Reference](#reference)

![A planning document open in Offgrid Review's dark theme, with document contents, review progress, annotations, and decision export controls](https://raw.githubusercontent.com/jd-santos/offgrid-review/main/docs/images/planning-review-dark.png)

_One workbench handles decision batches, proposals, and complete plans._

## Quick start

Install Git and [uv](https://docs.astral.sh/uv/getting-started/installation/)
on the machine where your agent runs.

### 1. Install the agent skill from GitHub

For agent systems that load skills from `~/.agents/skills`:

```bash
git clone --depth 1 https://github.com/jd-santos/offgrid-review.git
mkdir -p ~/.agents/skills
cp -R offgrid-review/skills/offgrid-review ~/.agents/skills/
```

Reload your agent's skills if the host requires it. Other agent systems can use
[`skills/offgrid-review/SKILL.md`](https://github.com/jd-santos/offgrid-review/blob/main/skills/offgrid-review/SKILL.md)
directly.

### 2. Ask your agent to prepare a workbench

For example:

> Use Offgrid Review to prepare these proposed changes for review. Gather the
> current facts read-only, include the relevant evidence and available options,
> and leave application for a separate verified pass.

The agent gathers the source data, writes the review specification, and runs the
generator. It returns a portable HTML file rather than walking through every
question in chat.

### 3. Review and return the decisions

Open the HTML file, compare the evidence, choose every compatible action, and
add comments where needed. Use **Copy decisions** or **Download decisions** to
return the JSON to your agent.

The apply pass should re-fetch current state, reject stale inputs, and perform
only the actions recorded in that decision file.

The skill currently runs the CLI from this public Git repository. After the
first PyPI release, it will use the unversioned `uvx offgrid-review` command,
which does not require documentation updates for each package release.

## How it works

```text
agent gathers evidence and frames the questions
                      ↓
          portable HTML review workbench
                      ↓
         human decisions and annotations
                      ↓
       agent verifies state and applies changes
```

The generator is deterministic. The agent decides what evidence and questions
to include; the browser workbench captures the human response; a separate apply
pass handles mutation.

## What it handles

### Decision batches

Reconciliation, triage, classification, prioritization, and other work with many
related decisions can be grouped into one review. Each item can show evidence,
comparisons, recommendations, risk, reversibility, compatible actions, and
required rationale.

### Proposals and plans

Complete documents can combine prose, decisions, tables, flows, timelines,
dependency graphs, charts, and constrained SVG. Reviewers can comment on
individual sections and return a direction decision without reducing the plan
to a sequence of chat messages.

### Explicit handoffs

Every artifact and export carries a schema version, generator version, review
ID, and deterministic data and specification fingerprints. Browser state is
loaded only when it belongs to the current artifact.

The generated page captures decisions but cannot mutate the system being
reviewed. Anyone who receives the HTML or exported JSON can inspect its embedded
source snapshots, including fields hidden behind disclosures. Do not include
secrets or unrelated private data.

### Visuals with a text path

Every diagram and chart has a visible text alternative. Charts also retain
their source-value tables. Custom SVG passes a strict allowlist before it can
reach the generated page.

## Direct CLI use

The CLI is the deterministic compiler underneath the agent workflow. To try it
with the checked-in example:

```bash
# Skip the clone if you already installed the skill from this checkout.
git clone --depth 1 https://github.com/jd-santos/offgrid-review.git
cd offgrid-review

uvx --from . offgrid-review \
  --data skills/offgrid-review/examples/review-data.json \
  --spec skills/offgrid-review/examples/review-spec.json \
  --out review.html
```

Open `review.html` in a browser. The command expects three explicit paths:

- `--data`: the source snapshot and evidence as JSON
- `--spec`: the questions, actions, presentation, and review framing as JSON
- `--out`: the HTML workbench to create

Once you have your own data and specification, run the current release candidate
directly from GitHub:

```bash
uvx --from git+https://github.com/jd-santos/offgrid-review.git offgrid-review \
  --data path/to/review-data.json \
  --spec path/to/review-spec.json \
  --out review.html
```

The CLI can write a generic starter specification, but you still need to provide
data with matching source keys:

```bash
uvx --from git+https://github.com/jd-santos/offgrid-review.git offgrid-review \
  --write-default-spec \
  --spec review-spec.json
```

After the first PyPI release, the normal command becomes:

```bash
uvx offgrid-review \
  --data path/to/review-data.json \
  --spec path/to/review-spec.json \
  --out review.html
```

UVX uses the latest available version on its first invocation and then reuses
its cached environment. Run
`uvx --refresh-package offgrid-review offgrid-review` when you explicitly want
UV to check for a newer release. Exact pins such as `offgrid-review@0.1.0` are
reserved for reproducibility and release verification.

Offgrid Review supports Python 3.10 or later and has no third-party runtime
dependencies. Development and manual testing currently happen on macOS. CI
exercises Ubuntu, but broader Linux compatibility has not been manually
verified. Native Windows is unsupported; WSL is unverified.

## Agent skill

The reusable skill is the discovery and workflow layer. It tells an agent when
a dedicated workbench is a better fit than chat, how to gather source data
without mutating it, how to frame the questions, and how to preserve the
review/apply boundary. It invokes the same CLI available to direct users and
does not carry a second renderer implementation.

See the [usage guide](https://github.com/jd-santos/offgrid-review/blob/main/skills/offgrid-review/reference/usage.md)
for custom data and specifications, and the
[artifact contract](https://github.com/jd-santos/offgrid-review/blob/main/skills/offgrid-review/reference/artifact-contract.md)
for the complete input and decision formats.

## More screenshots

<details>
<summary>Decision batch, mobile, and contents navigation examples</summary>

### Decision batch in the light theme

![A queue review showing filters, evidence, compatible actions, risk signals, and review progress](https://raw.githubusercontent.com/jd-santos/offgrid-review/main/docs/images/queue-review-light.png)

### Mobile review

![A planning review on a narrow screen with progress, review content, a floating contents control, and a persistent action tray](https://raw.githubusercontent.com/jd-santos/offgrid-review/main/docs/images/mobile-review-dark.png)

### Mobile contents navigation

![The nonmodal document contents drawer open over a mobile planning review](https://raw.githubusercontent.com/jd-santos/offgrid-review/main/docs/images/mobile-contents-dark.png)

</details>

## Reference

- [Usage guide](https://github.com/jd-santos/offgrid-review/blob/main/skills/offgrid-review/reference/usage.md): commands, review
  specifications, interaction behavior, and file-viewer constraints
- [Artifact contract](https://github.com/jd-santos/offgrid-review/blob/main/skills/offgrid-review/reference/artifact-contract.md):
  source data, review specs, generated artifacts, annotations, and decision JSON
- [Apply-pass guide](https://github.com/jd-santos/offgrid-review/blob/main/skills/offgrid-review/reference/apply-pass.md): verification,
  mutation boundaries, error handling, and reporting
- [Product](https://github.com/jd-santos/offgrid-review/blob/main/skills/offgrid-review/PRODUCT.md): purpose, users, constraints, and
  product principles
- [Design](https://github.com/jd-santos/offgrid-review/blob/main/skills/offgrid-review/DESIGN.md): interface tokens, component rules,
  responsive behavior, and accessibility expectations
- [Release guide](https://github.com/jd-santos/offgrid-review/blob/main/docs/releasing.md): package checks and Trusted Publishing setup
- [Changelog](https://github.com/jd-santos/offgrid-review/blob/main/CHANGELOG.md): notable project changes

## Development

Create the locked development environment and run the Python regression suite:

```bash
uv sync --locked
uv run python -m unittest discover -s tests -p 'test_*.py'
```

Run the focused browser regressions separately:

```bash
uv sync --locked --group test
uv run --group test playwright install chromium
uv run --group test python -m unittest discover -s tests/browser -p 'test_*.py'
uv run python scripts/check_runtime_syntax.py
```

Build the wheel and source distribution:

```bash
uv build
```

See the [release guide](https://github.com/jd-santos/offgrid-review/blob/main/docs/releasing.md)
for versioning, local wheel checks, and PyPI Trusted Publishing setup.

Regenerate the README screenshots with a local Chrome or Chromium installation:

```bash
uv run python scripts/capture_screenshots.py
```

Pass `--chrome /path/to/chrome` when the executable is not in a standard
location.

## License

The Python generator and package aggregate are licensed under
[GPL-3.0-or-later](https://github.com/jd-santos/offgrid-review/blob/main/LICENSE).
The generated HTML runtime, styles, and reusable output templates are licensed
under [Apache-2.0](https://github.com/jd-santos/offgrid-review/blob/main/LICENSES/Apache-2.0.txt).
Each portable HTML file carries the Apache license and notice required for
redistribution.
