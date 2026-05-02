---
name: marimo-app
description: Guides deploying marimo notebooks as apps, scripts, and exports. Covers marimo run, marimo export (HTML/PDF/IPYNB), WASM static deployment, script execution, CLI arguments, scheduled runs, and sharing via molab. Use when deploying marimo, sharing a notebook, exporting output, or running as a web app.
version: 1.0.0
author: jdwork
category: automation
requires: [marimo]
---

# Skill: Marimo App

## Description

Everything downstream of `marimo edit` — running notebooks as interactive web apps, exporting to static formats, executing as scripts, scheduling runs, and sharing. Load this when the goal is deployment, sharing, or automation rather than active editing.

## Instructions

### 1. Pre-flight Checks

Before deploying:

1. **Lint the notebook**: `marimo check notebook.py` — catches issues that prevent script execution
2. **Preview the app view**: while in `marimo edit`, click the preview button (bottom-right) to see how the app will look
3. **Commit the `layouts/` folder** if you've used the drag-and-drop grid editor — the layout metadata lives there and is needed to reconstruct the app view
4. **Check inline dependencies** if using `--sandbox` mode — make sure all imports are resolvable

### 2. Running as a Web App

`marimo run` starts a local web server, hides code, and presents outputs as an interactive app:

```bash
marimo run notebook.py              # default: vertical layout
marimo run notebook.py --port 8080  # custom port
marimo run notebook.py --host 0.0.0.0  # bind to all interfaces (for remote access)
```

**Layouts available:**
- **Vertical** (default): cell outputs stacked top-to-bottom, code hidden
- **Grid**: drag-and-drop layout built in the editor (requires committed `layouts/` folder)
- **Slides**: slideshow mode, one output per slide, order follows cell order

To switch layouts, use the dropdown in the app preview inside `marimo edit`.

**Gallery mode** — run a folder of notebooks as a card gallery:

```bash
marimo run notebooks/               # shows one card per notebook
marimo run notebooks/ --watch       # live-refresh gallery as files change
```

### 3. Executing as a Script

Any marimo notebook runs as a plain Python script:

```bash
python notebook.py
marimo run notebook.py  # same, but as a web app
```

**Script-mode use cases:**
- Side effects: writing files, pushing to databases, sending emails
- Scheduled jobs (cron, Airflow, Prefect, GitHub Actions)
- Parameterized pipelines via CLI args

#### CLI arguments

Use `argparse` or `simple-parsing` to accept parameters:

```python
# Cell — argument parsing
import argparse
import sys

parser = argparse.ArgumentParser()
parser.add_argument("--date", default="2024-01-01")
args = parser.parse_args(sys.argv[1:] if __name__ == "__main__" else [])

target_date = args.date
```

Then run with:

```bash
python notebook.py --date 2024-06-01
```

#### GitHub Actions schedule

```yaml
name: Daily notebook run

on:
  schedule:
    - cron: '0 9 * * *'

jobs:
  run-notebook:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      - uses: astral-sh/setup-uv@v7
      - run: uv run notebook.py
```

### 4. Exporting

#### HTML (save notebook outputs as a static page)

```bash
marimo export html notebook.py -o output.html

# Pass CLI args to the notebook during export
marimo export html notebook.py -o output.html -- --date 2024-06-01
```

#### PDF

```bash
marimo export pdf notebook.py -o output.pdf

# Slides-style PDF
marimo export pdf notebook.py -o output.pdf --as=slides --raster-server=live
```

#### Jupyter notebook (ipynb)

```bash
marimo export ipynb notebook.py -o notebook.ipynb
```

#### Script (pure Python, no marimo runtime)

```bash
marimo export script notebook.py -o clean_script.py
```

### 5. WASM / Static Deployment

marimo can compile notebooks to WebAssembly, producing a self-contained static site that runs entirely in the browser — no server required.

```bash
marimo export html --include-code notebook.py -o index.html
```

Host the output on any static file host (GitHub Pages, Netlify, Vercel, S3).

**Constraints in WASM mode:**
- No file system writes
- No subprocess calls
- Packages must be available in Pyodide

Share WASM notebooks via [molab](https://molab.marimo.io) — a free hosted service for marimo notebooks (similar to Google Colab).

### 6. Sharing and Reusing

#### molab

Upload or link to a marimo notebook on molab for instant shareable URLs. Notebooks run in WASM in the browser.

```bash
# Open a remote notebook directly in marimo edit
marimo edit https://raw.githubusercontent.com/user/repo/main/notebook.py
```

#### Reusing functions from notebooks

marimo notebooks are importable as Python modules:

```python
# In another script or notebook
from my_notebook import my_function, MyClass
```

Only cells that define the imported names run. See the [reusing functions guide](https://docs.marimo.io/guides/reusing_functions/).

### 7. Inline Dependencies (Sandboxed Execution)

marimo can serialize package requirements directly in the notebook file and auto-install them in an isolated venv:

```bash
# Edit with sandbox — packages are isolated per notebook
marimo edit --sandbox notebook.py

# Run with sandbox
marimo run --sandbox notebook.py
```

To add a package requirement inline:

```bash
uv add --script notebook.py pandas altair
```

This makes notebooks fully self-contained and reproducible without a shared environment.

### 8. Error Handling

| Problem | Cause | Fix |
|---------|-------|-----|
| App layout looks wrong | `layouts/` folder missing | Commit the `layouts/` folder alongside the notebook |
| Script exits immediately | No side effects, nothing to keep alive | Expected — script mode runs cells once and exits |
| `marimo check` fails | Variable defined multiple times or cycle | Fix flagged cells before deploying |
| WASM export fails for a package | Package not available in Pyodide | Check [Pyodide package list](https://pyodide.org/en/stable/usage/packages-in-pyodide.html) |
| CLI args not parsed in notebook mode | `sys.argv` differs in notebook vs script | Guard with `if __name__ == "__main__"` or use marimo's arg passing |
| Export HTML is blank | Expensive cells timed out during export | Use `--timeout` flag or pre-run the notebook |

## Examples

### Run as app locally

```bash
marimo run dashboard.py --port 8050
```

### Export and open HTML

```bash
marimo export html analysis.py -o analysis.html && open analysis.html
```

### Scheduled script via cron

```bash
# Run notebook daily at 8am, output saved to logs/
0 8 * * * cd /path/to/project && uv run report.py >> logs/report.log 2>&1
```

### Parameterized export

```bash
# Export with a custom date argument
marimo export html report.py -o report_june.html -- --month 2024-06
```

## Prerequisites

- marimo installed (`pip install marimo`)
- For sandboxed runs: `uv` installed (`pip install uv`)
- For PDF export: a headless browser (marimo handles this automatically)
- For WASM: a static hosting provider or molab account

## Cross-Reference

- **marimo** — hub skill with core concepts
- **marimo-notebook** — editor workflow, cell model, reactivity
- **marimo-data** — UI widgets, interactive dataframes, SQL
