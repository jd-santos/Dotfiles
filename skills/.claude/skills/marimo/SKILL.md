---
name: marimo
description: Guides working with marimo reactive Python notebooks. Covers setup, core concepts, and the reactive execution model. Use whenever working with marimo, writing marimo code, or when user says "marimo", "reactive notebook", or "mo.".
version: 1.1.0
author: jdwork
category: workflow
requires: []
---

# Skill: Marimo

## Description

marimo is a reactive Python notebook where running a cell automatically reruns all cells that reference its variables. Every notebook is stored as a plain `.py` file, executable as a script, and deployable as a web app. This skill covers the essentials; load a sub-skill when you need deeper guidance.

## When to Use This Skill

Load this skill for any marimo task. Then load the relevant sub-skill:

| Need | Sub-skill |
|------|-----------|
| **Working directly inside a live notebook session** (creating cells, running code, building a notebook as an artifact) | **`marimo-pair`** ← start here for active sessions |
| Cell model, reactivity rules, editor shortcuts | `marimo-notebook` |
| UI widgets, dataframes, reactive filtering, SQL | `marimo-data` |
| Running as an app, exporting, scripts, scheduling | `marimo-app` |

> **Agent working in an active marimo session?** Load `marimo-pair` immediately. It gives you shell scripts to discover running servers and execute code directly in the kernel — you can create cells, install packages, and build the notebook live without touching the file system.

## Instructions

### 1. Pre-flight Checks

Before writing marimo code:

1. **Is a marimo server already running?** → Load `marimo-pair` and run `discover-servers.sh` before anything else
2. **Verify marimo is installed**: `marimo --version` (install with `pip install marimo` or `uv add marimo`)
3. **Check for recommended extras** if using SQL or AI features: `pip install marimo[recommended]`
4. **Identify the task type**: active notebook session, data work, or deployment — load the matching sub-skill

### 2. Core Concepts

#### Reactive execution model

marimo statically analyzes cells to find which global variables each cell defines and which it references. When a cell runs, every cell that references its definitions reruns automatically.

**Key rules:**
- Each global variable must be defined in exactly one cell
- Mutations across cells are not tracked — define and mutate in the same cell
- Variables prefixed with `_` are cell-local (other cells can't see them)
- Deleting a cell deletes its variables from memory

#### The `mo` module

Every marimo notebook imports `marimo as mo`. The `mo` namespace is the main API:

```python
import marimo as mo

# Markdown with embedded Python
mo.md(f"The answer is **{answer}**")

# UI elements (see marimo-data for full coverage)
slider = mo.ui.slider(1, 100)

# Layout
mo.hstack([element_a, element_b])
mo.vstack([element_a, element_b])

# Conditional stop
mo.stop(condition, "Stopping because condition was met")
```

#### Displaying output

The last expression in a cell is its output — no `print()` or `display()` needed:

```python
# This cell's output is the dataframe viewer
df
```

Use `mo.md()` for formatted text, embed UI elements in markdown with f-strings:

```python
slider = mo.ui.slider(1, 10)
mo.md(f"Pick a value: {slider}")
```

### 3. Common Patterns

#### Reactive variable wiring

```python
# Cell 1 — defines `threshold`
threshold = mo.ui.slider(0, 100, value=50, label="Threshold")
threshold
```

```python
# Cell 2 — reruns automatically when threshold changes
filtered = df[df["value"] > threshold.value]
filtered
```

#### Avoiding hidden state

Don't mutate a variable defined in another cell:

```python
# Bad — mutation in a different cell
df["col"] = new_values  # won't trigger reactive updates

# Good — define and transform in one cell
df = raw_df.assign(col=new_values)
```

#### Local variables

```python
# _temp is invisible to other cells
_temp = expensive_computation()
result = _temp.summarize()
```

### 4. Error Handling

- **"Variable defined in multiple cells"**: marimo enforces unique globals. Merge the conflicting cells or rename one variable.
- **Reactive loop not triggering**: likely a mutation rather than a reassignment. Move mutation into the defining cell.
- **Cell marked stale but not running**: runtime may be set to lazy mode. Check notebook settings or run the cell manually.
- **Import errors**: marimo runs cells in dependency order, not top-to-bottom. Make sure imports are in their own cell and referenced before use.

## Examples

### Starting a notebook

```bash
marimo edit my_analysis.py --no-token   # open or create (--no-token enables agent discovery)
marimo tutorial intro                    # interactive intro
```

### Minimal reactive example

```python
# Cell 1
import marimo as mo
import pandas as pd
```

```python
# Cell 2 — slider widget
n = mo.ui.slider(5, 50, value=20, label="Rows")
n
```

```python
# Cell 3 — reruns when n changes
sample = pd.DataFrame({"x": range(n.value)})
sample
```

## Prerequisites

- Python 3.9+
- marimo: `pip install marimo` or `uv add marimo`
- For SQL cells and AI features: `pip install marimo[recommended]`
- For live agent sessions: `bash` + `curl` + `jq` on PATH (required by `marimo-pair` scripts)

## Sub-skills

- **marimo-pair** — live kernel access: discover servers, execute code, create/edit cells programmatically
- **marimo-notebook** — cell model, editor, keyboard shortcuts, expensive notebooks
- **marimo-data** — `mo.ui` widgets, dataframes, SQL cells, plotting
- **marimo-app** — `marimo run`, `marimo export`, scripts, WASM, scheduling
