# Offgrid Review

Build structured review workbenches as single offline HTML files. Deterministic
JSON and a review specification go in; explicit decisions and annotations come
back as JSON.

Generated reviews need no server, build process, third-party package, or runtime
network access. They support queue-based review, complete planning documents,
semantic diagrams, granular comments, responsive navigation, and separate
verified apply passes.

## Quick start

Generate the queue example:

```bash
python3 skills/offgrid-review/scripts/review_console.py \
  --data skills/offgrid-review/scripts/review-data.example.json \
  --spec skills/offgrid-review/scripts/review-spec.example.json \
  --out /tmp/offgrid-review.html
```

Generate the planning-document example:

```bash
python3 skills/offgrid-review/scripts/review_console.py \
  --data skills/offgrid-review/scripts/review-plan-data.example.json \
  --spec skills/offgrid-review/scripts/review-plan-spec.example.json \
  --out /tmp/offgrid-review-plan.html
```

Open the generated file in a browser, complete the review, and download the
decision JSON. Applying those decisions is always a separate step.

## Agent skill

The reusable skill lives at [`skills/offgrid-review`](skills/offgrid-review).
It includes the generator, examples, tests, artifact contract, usage guide, and
safe apply-pass guidance.

The repository layout is discoverable by agent skill installers that support
`skills/<name>/SKILL.md`. Offgrid Review currently uses a reviewed tracked-skill
workflow; direct `npx skills` installation remains a documented follow-up.

## Development

The generator uses only the Python standard library.

```bash
python3 -m unittest discover \
  -s skills/offgrid-review/tests \
  -p 'test_*.py'
```

See [`skills/offgrid-review/PRODUCT.md`](skills/offgrid-review/PRODUCT.md) for
product boundaries and [`skills/offgrid-review/DESIGN.md`](skills/offgrid-review/DESIGN.md)
for the interface system.

## License

Offgrid Review is licensed under GPL-3.0-or-later. See [LICENSE](LICENSE).
