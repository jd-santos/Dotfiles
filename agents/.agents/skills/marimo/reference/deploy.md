# marimo Deployment Reference

Use this when running notebooks as apps, exporting outputs, executing notebooks as scripts, scheduling runs, or sharing notebooks.

## Pre-flight Checks

Before deploying:

1. Run `marimo check notebook.py` to catch issues that prevent script execution.
2. Preview app view from `marimo edit`.
3. Commit `layouts/` if you used the drag-and-drop grid editor.
4. Check inline dependencies if using `--sandbox`.

## Run as a Web App

`marimo run` starts a local web app with code hidden:

```bash
marimo run notebook.py
marimo run notebook.py --port 8080
marimo run notebook.py --host 0.0.0.0
```

Layouts:

- Vertical: default stacked outputs
- Grid: drag-and-drop layout, requires committed `layouts/`
- Slides: one output per slide, ordered by cell order

Run a folder as a gallery:

```bash
marimo run notebooks/
marimo run notebooks/ --watch
```

## Execute as a Script

Any marimo notebook is a Python script:

```bash
python notebook.py
```

Use script mode for side effects, scheduled jobs, and parameterized pipelines.

### CLI arguments

```python
import argparse
import sys

parser = argparse.ArgumentParser()
parser.add_argument("--date", default="2024-01-01")
args = parser.parse_args(sys.argv[1:] if __name__ == "__main__" else [])

target_date = args.date
```

Run with:

```bash
python notebook.py --date 2024-06-01
```

### GitHub Actions schedule

```yaml
name: Daily notebook run

on:
  schedule:
    - cron: "0 9 * * *"

jobs:
  run-notebook:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - uses: astral-sh/setup-uv@v7
      - run: uv run notebook.py
```

## Export

HTML:

```bash
marimo export html notebook.py -o output.html
marimo export html notebook.py -o output.html -- --date 2024-06-01
```

PDF:

```bash
marimo export pdf notebook.py -o output.pdf
marimo export pdf notebook.py -o output.pdf --as=slides --raster-server=live
```

Jupyter notebook:

```bash
marimo export ipynb notebook.py -o notebook.ipynb
```

Plain Python script:

```bash
marimo export script notebook.py -o clean_script.py
```

## WASM and Static Deployment

Export static HTML that runs in the browser:

```bash
marimo export html --include-code notebook.py -o index.html
```

Host it on GitHub Pages, Netlify, Vercel, S3, or another static file host.

WASM constraints:

- No file system writes
- No subprocess calls
- Packages must be available in Pyodide

## Sharing and Reuse

Open a remote notebook in marimo:

```bash
marimo edit https://raw.githubusercontent.com/user/repo/main/notebook.py
```

Share browser-run notebooks with molab: <https://molab.marimo.io>.

Reuse functions from a notebook:

```python
from my_notebook import my_function, MyClass
```

Only cells that define imported names run.

## Inline Dependencies

Use sandbox mode for isolated per-notebook environments:

```bash
marimo edit --sandbox notebook.py
marimo run --sandbox notebook.py
```

Add inline package requirements:

```bash
uv add --script notebook.py pandas altair
```

## Common Failures

| Problem | Cause | Fix |
| --- | --- | --- |
| App layout looks wrong | `layouts/` folder missing | Commit it beside the notebook |
| Script exits immediately | No side effects or server process | Expected for script mode |
| `marimo check` fails | Duplicate variable or cycle | Fix flagged cells before deploying |
| WASM export fails | Package unavailable in Pyodide | Check the Pyodide package list |
| CLI args fail in notebook mode | `sys.argv` differs | Guard parsing with `__name__ == "__main__"` |
| HTML export is blank | Expensive cells timed out | Use `--timeout` or pre-run the notebook |

## Examples

```bash
marimo run dashboard.py --port 8050
```

```bash
marimo export html analysis.py -o analysis.html && open analysis.html
```

```cron
0 8 * * * cd /path/to/project && uv run report.py >> logs/report.log 2>&1
```

```bash
marimo export html report.py -o report_june.html -- --month 2024-06
```
