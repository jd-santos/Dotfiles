# Offgrid Review

Offgrid Review turns deterministic JSON and a review specification into one
self-contained HTML workbench. Reviewers inspect evidence, record explicit
decisions and annotations, then return structured JSON.

The generated file needs no server, build process, package install, or runtime
network access. It captures decisions but never applies them to an external
system.

[Quick start](#quick-start) · [Agent skill](#agent-skill) ·
[Core concepts](#core-concepts) · [Reference](#reference)

![A planning document open in Offgrid Review's dark theme, with document contents, review progress, annotations, and decision export controls](https://raw.githubusercontent.com/jd-santos/offgrid-review/main/docs/images/planning-review-dark.png)

_One engine handles complete documents and queue-based review._

## How it works

1. A read-only script or agent gathers deterministic source data as JSON.
2. A review specification defines the questions, evidence, actions, and document
   blocks needed for this review.
3. The generator combines both inputs into one offline HTML file.
4. A person reviews the file and downloads decision JSON.
5. A separate apply pass verifies current state before making approved changes.

```text
source data + review specification
              ↓
       offline HTML review
              ↓
         decision JSON
              ↓
      verified apply pass
```

This pattern is useful when a person needs to review more structured material
than fits comfortably in chat, but the underlying facts can be gathered before
the review begins.

## Quick start

With [uv](https://docs.astral.sh/uv/getting-started/installation/) installed,
run the command without managing a Python environment. Until the first PyPI
release, UVX can build it directly from the public repository:

```bash
uvx --from git+https://github.com/jd-santos/offgrid-review.git offgrid-review \
  --data review-data.json \
  --spec review-spec.json \
  --out review.html
```

Open `review.html` in a browser. Select one or more compatible actions, add
notes where needed, and use **Download JSON** to export the result.

Offgrid Review supports Python 3.10 or later and has no third-party runtime
dependencies. PyPI will distribute the first tagged package; UVX is the
recommended runner, not a package dependency. After the first PyPI release, the invocation shortens to `uvx offgrid-review`.
A persistent installation will also be available:

```bash
uv tool install offgrid-review
offgrid-review --version
```

<details>
<summary>Generate the checked-in queue and planning examples</summary>

```bash
git clone https://github.com/jd-santos/offgrid-review.git
cd offgrid-review

uvx --from git+https://github.com/jd-santos/offgrid-review.git offgrid-review \
  --data skills/offgrid-review/examples/review-data.json \
  --spec skills/offgrid-review/examples/review-spec.json \
  --out /tmp/offgrid-review.html

uvx --from git+https://github.com/jd-santos/offgrid-review.git offgrid-review \
  --data skills/offgrid-review/examples/review-plan-data.json \
  --spec skills/offgrid-review/examples/review-plan-spec.json \
  --out /tmp/offgrid-review-plan.html
```

</details>

Start with the [usage guide](https://github.com/jd-santos/offgrid-review/blob/main/skills/offgrid-review/reference/usage.md) when
building a new review. The
[artifact contract](https://github.com/jd-santos/offgrid-review/blob/main/skills/offgrid-review/reference/artifact-contract.md)
documents the complete data, specification, annotation, and decision formats.

## Agent skill

The reusable skill lives at
[`skills/offgrid-review`](https://github.com/jd-santos/offgrid-review/tree/main/skills/offgrid-review). It tells an agent when this
workflow fits, how to frame the data and specification, and how to preserve the
review/apply boundary. The skill invokes the same published CLI used by direct
users; it does not carry a second renderer implementation.

Agent systems that discover `skills/<name>/SKILL.md` can use the repository
directly. For systems that load skills from `~/.agents/skills`, copy or sync the
whole skill directory:

```bash
cp -R skills/offgrid-review ~/.agents/skills/offgrid-review
```

Direct `npx skills` installation is on the
[roadmap](https://github.com/jd-santos/offgrid-review/blob/main/TODO.md), but is not documented as supported yet.

## Core concepts

### One portable artifact

The data, review specification, interface, styles, and behavior are embedded in
one HTML file. It can move through chat, email, shared storage, or removable
media without bringing an application server with it.

### Review and apply stay separate

The browser page is a decision-capture surface. It cannot mutate the system
being reviewed. The [apply-pass guide](https://github.com/jd-santos/offgrid-review/blob/main/skills/offgrid-review/reference/apply-pass.md)
requires implementations to re-fetch current state, detect stale data, and act
only on explicitly approved decisions.

### Structure replaces conversational ambiguity

Actions, risk, reversibility, rationale, conflicts, completion state, and
annotations remain machine-readable. Compatible actions use multi-select by
default; single-choice questions must declare that constraint explicitly.

### Queue review and document review share an engine

Queues support reconciliation, triage, classification, and backlog work.
Semantic document blocks support prose, decisions, tables, flows, timelines,
dependency graphs, charts, and constrained SVG. Both modes share persistence,
validation, export, and apply boundaries.

### Visuals keep a text path

Every diagram and chart has a visible text alternative. Charts also retain
their source-value tables. Custom SVG passes a strict allowlist before it can
reach the generated page.

## More screenshots

<details>
<summary>Queue, mobile, and contents navigation examples</summary>

### Queue review in the light theme

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

## Roadmap

Near-term work includes recommendation provenance, stale-snapshot handling,
decision import, accessibility review, and validated `npx skills` installation.
See [TODO.md](https://github.com/jd-santos/offgrid-review/blob/main/TODO.md) for the current list.

## Development

Create the locked development environment and run the regression suite:

```bash
uv sync --locked
uv run python -m unittest discover -s tests -p 'test_*.py'
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

Offgrid Review is licensed under GPL-3.0-or-later. See [LICENSE](LICENSE).
