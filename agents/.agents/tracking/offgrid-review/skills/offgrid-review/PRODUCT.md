# Product

## Platform

web

## Users

The primary user is the toolkit's owner during agent-assisted work. They
regularly need to review many proposed decisions without answering an agent
line by line. They care strongly about interaction and visual quality.

A secondary user is anyone handed a generated review file. That person should
be able to understand and complete the review without installing the toolkit
or knowing how it was generated.

## Product Purpose

Offgrid Review gives agent-assisted work a focused human interface for decisions
that are too complex for a yes or no in chat. An agent gathers evidence and
frames the available options, proposed changes, or plan; the reviewer compares,
annotates, and decides in a portable workbench; the result returns to the agent
as machine-readable JSON.

Its original purpose was data processing and tagging review. The first concrete
use case compared Obsidian notes with corresponding Todoist tasks to resolve
conflicting priorities, statuses, and other mismatches.

The same engine also supports human review of agent-prepared plans through
semantic overview, prose, table, flow, timeline, dependency graph, chart,
constrained SVG, and decision blocks. Item review and plan review use one
workbench, artifact contract, and apply boundary. Use-case subskills can
supply specialized data and framing without replacing the engine.

Success means a reviewer can give precise feedback faster and more accurately
than they could through line-by-line chat or a spreadsheet, then hand the
resulting decision artifact back to an agent without tying the workflow to a
particular platform.

## Positioning

The workbench is the human-facing part of an agent workflow. The agent prepares
the evidence and questions, a single offline HTML file carries the review, and
explicit human decisions return as JSON.

Unlike chat, it gives the reviewer a purpose-built interface for scanning,
comparing, annotating, and deciding across a batch of related work. Unlike a
spreadsheet, it can be authored around the exact question an agent needs
answered and returned directly as a machine-readable approval artifact.

The reusable value is both the generator and a consistent design language for
human review. Specific workflows should be framed through data and
specifications rather than hardcoded into the core interface.

## Operating Context

The expected workflow is:

1. A deterministic script or agent produces source data as JSON.
2. An agent writes a review specification for the current question.
3. The generator produces one static HTML file.
4. The human reviews it in a browser or file viewer, often through Telegram and
   a Hermes agent.
5. The human exports decision JSON and sends it back through chat.
6. A separate apply pass verifies current state before making approved changes.

The console must work in local browsers and constrained file viewers where
browser storage may be unavailable. The review itself must remain usable
in-session in those environments.

## Capabilities and Constraints

Current capabilities include decision batches implemented through queues,
complete document review, multi-select and explicit single-select actions,
item, action, section, and block notes, record comparisons, semantic document
blocks, generated SVG flows and graphs, charts with source tables, sanitized
custom SVG, search, filtering, keyboard navigation, accessible on-demand help,
responsive document contents, light and dark themes, responsive mobile actions,
review summaries, risk-aware pre-export checks, artifact-scoped local
persistence when available, path-aware input validation, versioned artifact
identity, and decision JSON export.

The implementation is distributed as a Python CLI. Validation, identity, queue
rendering, document rendering, SVG handling, page assembly, and the browser
runtime have separate package boundaries. The package uses only the Python
standard library at runtime. PyPI will provide distribution after the first
release, and UVX is the recommended runner. Generated consoles require no
server, network access, build process, or third-party runtime dependency.

The Python generator and aggregate package use GPL-3.0-or-later. Output-facing
runtime assets and reusable renderer templates also carry Apache-2.0 terms, and
each generated file embeds the Apache license and notice. This keeps the
portable handoff artifact separate from the generator's GPL distribution
boundary.

The generated page is a decision-capture surface. It must not mutate Todoist,
Obsidian, or any other external system. Applying decisions remains a separate,
verified step.

The general toolkit should remain adaptable through JSON data and review
specifications. Specific use cases may extend the presentation and decision
model, but should not require rewriting the generator whenever the review
question changes.

Open decisions:

- Whether a later format can support highlighted inline comments without
  weakening portability or stable annotation targets.
- Which additional structured visual types are common enough to add without
  turning the format into a general drawing language.
- When a specialized review domain has diverged enough to justify a subskill.

## Brand Commitments

The product name is Offgrid Review.

It is a general-purpose baseline toolkit, not a UI tailored only to the original
Obsidian and Todoist reconciliation workflow. Generated files should feel
considered enough to hand to another person without explanation or apology.

The product voice should be direct, concrete, and clear about what a decision
will do. It should not imply that reviewing a decision applies it.

The visual identity uses neutral work surfaces with restrained blush-pink
selection and annotation states. Deep berry carries primary controls. Muted
plum marks high-risk actions, while red remains reserved for errors and urgent
danger. Light and dark themes receive equal support.

## Evidence on Hand

- `src/offgrid_review/cli.py`: argument parsing, file handling, and public
  command behavior.
- `src/offgrid_review/validation.py`: path-aware data and specification checks.
- `src/offgrid_review/identity.py`: canonical fingerprints and artifact
  identity.
- `src/offgrid_review/rendering/`: queue, document, SVG, and page rendering.
- `src/offgrid_review/resources/`: Apache-2.0-licensed HTML, CSS, JavaScript,
  notice, and output license resources.
- `examples/review-data.json`: example deterministic input data.
- `examples/review-spec.json`: example review framing and action metadata.
- `examples/review-plan-data.json` and `examples/review-plan-spec.json`:
  complete planning-document demo.
- `reference/artifact-contract.md`: current data, specification, console, and
  decision artifact contract.
- `reference/apply-pass.md`: verified apply-pass boundary and safety rules.
- `reference/usage.md`: supported workflows, interaction behavior, and known
  file-viewer constraints.
- `DESIGN.md`: interface system, visual rules, and responsive behavior.
- `tests/test_renderer.py`: checks workbench layout, multi-select and
  single-select behavior, granular annotations, plan renderers, themes, risk
  metadata, summaries, export validation, and the interface contract.
- `tests/test_identity.py` and `tests/test_validation.py`: check deterministic
  identity, input contracts, uniqueness, limits, and failure messages.
- `tests/browser/test_workbench.py`: checks persistence, stale-state rejection,
  hostile raw-text data, mobile document review, focus return, and reflow.
- `tests/test_cli.py`: checks generation, protected starter-spec output, version
  metadata, expected errors, limits, and exit codes.

There are no user studies, external testimonials, or performance benchmarks on
hand. Future work must not invent them.

## Product Principles

1. **Make human judgment easy to express.** The interface should reduce the
   effort of reviewing many agent-prepared questions without reducing the
   quality of the answer. Compatible actions may coexist; single-choice review
   is an explicit fallback.
2. **Keep review separate from application.** A captured decision is an
   approval artifact, not an immediate mutation.
3. **Portability comes first.** A generated console should survive handoff
   through chat and open as one offline file.
4. **Keep the core general and the questions specific.** Data and specifications
   should adapt the toolkit to a review, while the generator provides stable
   behavior and design language.
5. **Prefer explicit structure over conversational ambiguity.** Actions,
   rationale, risk, completion state, and exported decisions should remain
   machine-readable and understandable to the reviewer.
6. **Keep visuals optional to understanding.** Every diagram and chart retains
   a visible text representation, and custom SVG never bypasses sanitization.

## Accessibility & Inclusion

Preserve keyboard navigation, visible focus states, assistive-technology state
exposure, live status updates, and reduced-motion support.

The console must remain understandable without relying on color alone.
Interactive controls should look interactive, informational labels should not
imitate controls, and risky or irreversible actions should be explicit before
selection.
