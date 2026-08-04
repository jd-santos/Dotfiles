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

Offgrid Review is a baseline human-in-the-loop review toolkit. It turns
structured JSON and an agent-authored review specification into a portable
interface for inspecting items, recording explicit decisions, and returning
those decisions to an agent as JSON.

Its original purpose was data processing and tagging review. The first concrete
use case compared Obsidian notes with corresponding Todoist tasks to resolve
conflicting priorities, statuses, and other mismatches.

The same engine also supports human review of LLM-authored plans through
semantic overview, prose, table, flow, timeline, dependency graph, chart,
constrained SVG, and decision blocks. Item review and plan review use one
workbench, artifact contract, and apply boundary. Use-case subskills can
supply specialized data and framing without replacing the engine.

Success means a reviewer can give structured feedback faster and more
accurately than they could through line-by-line chat or a spreadsheet, then hand
the resulting decision artifact back to an agent without tying the workflow to
a particular platform.

## Positioning

The workbench is a portable offline review surface: JSON goes in, a single
reviewable HTML file comes out, and explicit human decisions return as JSON.

Unlike chat, it gives the reviewer a purpose-built interface for scanning,
comparing, and deciding across many items. Unlike a spreadsheet, it can be
authored around the exact question an agent needs answered and returned
directly to the agent as a structured approval artifact.

The reusable value is both the generator and a consistent design language for
human review. Specific workflows should be framed through data and
specifications rather than hardcoded into the core interface.

## Operating Context

The expected workflow is:

1. A deterministic script or agent-prepared artifact produces structured JSON.
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

Current capabilities include queue-based and document-oriented review,
multi-select and explicit single-select actions, item/action/section/block
notes, record comparisons, semantic document blocks, generated SVG flows and
graphs, charts with source tables, sanitized custom SVG, search, filtering,
keyboard navigation, accessible on-demand help, responsive document contents,
light and dark themes, responsive mobile actions, review summaries, risk-aware
pre-export checks,
local persistence when available, and decision JSON export.

The implementation uses a Python standard-library generator with embedded
HTML, CSS, and JavaScript. Generated consoles require no server, network
access, build process, or third-party runtime dependency.

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

- `scripts/review_console.py`: dependency-free generator and current interface
  implementation.
- `scripts/review-data.example.json`: example deterministic input data.
- `scripts/review-spec.example.json`: example review framing and action
  metadata.
- `scripts/review-plan-data.example.json` and
  `scripts/review-plan-spec.example.json`: complete planning-document demo.
- `reference/artifact-contract.md`: current data, specification, console, and
  decision artifact contract.
- `reference/apply-pass.md`: verified apply-pass boundary and safety rules.
- `reference/usage.md`: supported workflows, interaction behavior, and known
  file-viewer constraints.
- `DESIGN.md`: interface system, visual rules, and responsive behavior.
- `tests/test_review_console.py`: checks workbench layout, multi-select and
  single-select behavior, granular annotations, plan renderers, themes, risk
  metadata, summaries, export validation, and the interface contract.

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
