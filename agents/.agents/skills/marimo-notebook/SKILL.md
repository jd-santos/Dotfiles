---
name: marimo-notebook
description: Guides working in the marimo notebook editor. Covers the reactive cell model, execution order, disabling cells, mo.stop, keyboard shortcuts, and handling expensive notebooks. Load the marimo hub skill first. Use when editing marimo notebooks, debugging reactivity, or asking about cell behavior.
version: 1.0.0
author: jdwork
category: workflow
requires: [marimo]
---

# Skill: Marimo Notebook

## Description

Deep guidance on marimo's notebook editing experience — the reactive cell model, execution rules, editor features, and patterns for working with slow or expensive cells. Load this alongside the `marimo` hub skill when working in the editor.

## Instructions

### 1. The Cell Model

#### Execution order is determined by data, not position

marimo builds a DAG from variable references. Cells run when their inputs change, not based on where they appear on the page. You can put helper functions at the bottom of the notebook.

**Implications:**
- Reorder cells freely for readability
- The dependency graph, not cell order, drives re-execution
- View the graph: open the **Dependency Graph** panel in the editor (command palette → "Graph view")

#### What triggers a rerun

A cell reruns when any global variable it *references* (but does not define) is updated. Interacting with a `mo.ui` element also counts as an update.

**Does not trigger reruns:**
- Mutations to objects (`list.append`, `dict[key] = val`, attribute assignment)
- Changes to `_`-prefixed local variables

#### Global variable uniqueness

Every global name must be defined in exactly one cell. If two cells both assign `x`, marimo will surface an error. Options:
- Merge the cells
- Rename one variable
- Make one local with `_x`

### 2. Controlling Execution

#### Disabling cells

Right-click a cell → **Disable cell** (or use the context menu icon). A disabled cell and all its dependents are blocked from running. When re-enabled, stale dependents run automatically.

Use this to freeze a slow upstream cell while iterating on downstream logic.

#### mo.stop

Stop a cell's execution conditionally at runtime:

```python
mo.stop(df.empty, mo.md("⚠️ No data loaded yet — upload a file above."))
# code below only runs when df is not empty
```

`mo.stop` is useful for guarding cells that depend on user input or optional data.

#### Lazy runtime mode

Set the runtime to **lazy** in notebook settings to prevent automatic reruns. Cells are marked stale instead of running. Useful for expensive notebooks where you want explicit control.

Configure in the notebook settings menu or via `pyproject.toml`:

```toml
[tool.marimo.runtime]
auto_instantiate = false
```

### 3. Memory and Variable Management

#### You can't reassign to free memory

Because every global is unique, you can't do `df = None` in a second cell to free the first cell's `df`. Instead:

- Encapsulate temporary work in functions or use `_` locals
- Use `del` inside the defining cell
- See the [expensive notebooks guide](https://docs.marimo.io/guides/expensive_notebooks/#manage-memory)

#### Encapsulating temporaries in functions

```python
def _():
    import matplotlib.pyplot as plt
    fig, ax = plt.subplots()
    ax.plot(data)
    return fig

_()
```

`plt`, `fig`, and `ax` stay local to the function — they don't pollute global scope.

### 4. Editor Features

#### Keyboard shortcuts (notebook editor)

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + Enter` | Run focused cell |
| `Shift + Enter` | Run cell and move to next |
| `Ctrl/Cmd + Shift + Enter` | Run all cells |
| `Ctrl/Cmd + /` | Toggle comment |
| `Ctrl/Cmd + D` | Delete cell |
| `Ctrl/Cmd + Shift + K` | Disable/enable cell |
| `Escape` | Exit edit mode (select mode) |
| `A` / `B` (select mode) | Insert cell above / below |

#### Vim keybindings

Enable vim mode in notebook settings. Supports normal/insert/visual modes with standard vim motions inside cells.

#### AI completion

marimo's editor has built-in AI completion that is aware of variables in memory. Enable in settings → AI. Supports OpenAI-compatible APIs and local models (Ollama).

#### Variable explorer

Open the variable explorer panel to inspect all global variables and their current values without running extra cells.

### 5. Package Management

marimo has built-in package management — install packages on import without leaving the notebook:

```python
# marimo will prompt to install if not found
import polars as pl
```

You can also inline package requirements in the notebook file itself so they auto-install in an isolated venv:

```bash
marimo edit --sandbox my_notebook.py
```

### 6. Error Handling

| Error | Likely cause | Fix |
|-------|-------------|-----|
| "Variable defined in multiple cells" | Two cells assign same global name | Merge cells or rename |
| Cell not running despite input change | Input is mutated, not reassigned | Move mutation into defining cell |
| Cell stuck as stale | Lazy runtime mode on | Run manually or switch to automatic |
| Circular dependency | Cell A references Cell B which references Cell A | Restructure — marimo can't run circular DAGs |
| Import error in dependent cell | Imported name used before its cell runs | Put imports in a separate upstream cell |

## Examples

### Disabling a slow data-loading cell

```python
# Cell 1 — expensive, disable while iterating on viz
raw = fetch_large_dataset()  # right-click → Disable cell
```

```python
# Cell 2 — fast, iterate freely
chart = plot(raw)
chart
```

### Guarding downstream work with mo.stop

```python
# Cell 1 — file upload widget
upload = mo.ui.file(label="Upload CSV")
upload
```

```python
# Cell 2 — only runs when a file is provided
mo.stop(not upload.value, mo.md("Upload a file to continue."))
import io
df = pd.read_csv(io.BytesIO(upload.value[0].contents))
df
```

## Prerequisites

- marimo installed (`pip install marimo`)
- Basic familiarity with the `marimo` hub skill concepts

## Cross-Reference

- **marimo** — hub skill with core concepts
- **marimo-data** — UI widgets, dataframes, SQL
- **marimo-app** — running as apps and scripts
