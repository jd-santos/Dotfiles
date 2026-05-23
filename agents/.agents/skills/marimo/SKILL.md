---
name: marimo
description: Guides working with marimo reactive Python notebooks. Covers setup, routing, core reactivity, notebook editing, interactive data, SQL, widgets, exports, apps, scripts, and deployment. Use whenever working with marimo, writing marimo code, or when user says "marimo", "reactive notebook", or "mo.".
version: 2.0.0
author: jdwork
category: workflow
requires: []
---

# Skill: Marimo

## Description

marimo is a reactive Python notebook. Cells form a dataflow graph: when a cell changes, every cell that depends on its variables reruns. Notebooks are plain `.py` files that can also run as scripts, apps, and exports.

Use this skill for general marimo work. Load `marimo-pair` as the second skill only when you need to work inside a running notebook kernel.

## Progressive Disclosure

Keep this file loaded for routing and core rules. Read the reference file only when the task needs that detail:

| Need | Read |
| --- | --- |
| Active notebook session, live kernel work, creating/editing/running cells programmatically | Load `marimo-pair` |
| Editor behavior, reactivity debugging, stale cells, slow notebooks, shortcuts | `reference/notebook.md` |
| `mo.ui`, widgets, dataframes, SQL cells, plotting, layouts | `reference/data.md` |
| `marimo run`, exports, scripts, CLI args, scheduling, WASM, sharing | `reference/deploy.md` |

## Instructions

### 1. Pre-flight Checks

Before writing marimo code:

1. **Check whether the user wants a live notebook session.** If yes, load `marimo-pair` and use its server discovery workflow first.
2. **Verify marimo is installed** when running commands: `marimo --version`.
3. **Choose the right dependency path**: `pip install marimo`, `uv add marimo`, or sandboxed inline dependencies depending on the project.
4. **Load only the needed reference** from the table above.

### 2. Core Reactivity Rules

- Execution order is determined by variable dependencies, not cell position.
- Each global variable must be defined in exactly one cell.
- A cell reruns when a global variable it references is reassigned.
- Mutating an object from another cell is not tracked. Define and mutate in the same cell.
- Variables prefixed with `_` are cell-local and hidden from other cells.
- Deleting a cell deletes its variables from memory.

### 3. Standard Import and Output Pattern

Every notebook uses `marimo as mo`:

```python
import marimo as mo
```

The last expression in a cell is displayed:

```python
df
```

Use `mo.md()` for formatted text and inline widgets:

```python
slider = mo.ui.slider(1, 10, label="n")
mo.md(f"Pick a value: {slider}")
```

### 4. Common Patterns

#### Reactive variable wiring

```python
threshold = mo.ui.slider(0, 100, value=50, label="Threshold")
threshold
```

```python
filtered = df[df["value"] > threshold.value]
filtered
```

#### Avoid hidden state

```python
# Bad: mutation in a different cell will not trigger reactive updates
df["col"] = new_values

# Good: define the transformed object in one cell
df = raw_df.assign(col=new_values)
```

#### Keep temporary work local

```python
_temp = expensive_computation()
result = _temp.summarize()
```

### 5. Error Handling

- **Variable defined in multiple cells**: merge the conflicting cells, rename one variable, or make one name local with a leading `_`.
- **Reactive update did not trigger**: look for mutation instead of reassignment.
- **Cell is stale but not running**: lazy runtime may be enabled. Read `reference/notebook.md` if you need execution-control details.
- **Widget interaction does nothing**: the widget probably was not assigned to a global variable. Read `reference/data.md` for widget rules.
- **Deployment/export fails**: run `marimo check notebook.py` and read `reference/deploy.md`.

## Examples

### Start a notebook

```bash
marimo edit my_analysis.py --no-token
marimo tutorial intro
```

Use `--no-token` for local agent pairing so `marimo-pair` can discover the server.

### Minimal reactive example

```python
import marimo as mo
import pandas as pd
```

```python
n = mo.ui.slider(5, 50, value=20, label="Rows")
n
```

```python
sample = pd.DataFrame({"x": range(n.value)})
sample
```

## Prerequisites

- Python 3.9+
- marimo: `pip install marimo` or `uv add marimo`
- SQL cells and AI features: `pip install marimo[recommended]`
- Live agent sessions: `bash`, `curl`, and `jq` on `PATH` for `marimo-pair` scripts
