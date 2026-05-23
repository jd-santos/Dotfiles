# marimo Notebook Reference

Use this when editing marimo notebooks, debugging reactivity, handling stale cells, or working with expensive notebooks.

## Cell Model

marimo builds a DAG from variable references. Cells run when their inputs change, not based on where they appear in the file.

Implications:

- Reorder cells for readability.
- Put helper functions anywhere.
- Use the Dependency Graph panel when the execution order is unclear.

A cell reruns when a global variable it references is updated. Interacting with a `mo.ui` element also counts as an update if the widget is assigned to a global.

Does not trigger reruns:

- `list.append`, dict updates, attribute assignment, and other mutations
- Changes to `_`-prefixed local variables

Every global name must be defined in one cell. If two cells assign `x`, merge the cells, rename one variable, or make one local with `_x`.

## Controlling Execution

### Disable cells

Disable a cell from the context menu. A disabled cell and its dependents are blocked from running. Re-enable it when you want stale dependents to run again.

Use this to freeze slow data-loading cells while iterating downstream.

### `mo.stop`

Stop a cell conditionally at runtime:

```python
mo.stop(df.empty, mo.md("No data loaded yet. Upload a file above."))
# code below only runs when df is not empty
```

Use `mo.stop` to guard cells that depend on user input, uploads, or optional data.

### Lazy runtime mode

Lazy runtime marks cells stale instead of running them automatically. Use it for expensive notebooks where explicit execution is safer.

Configure in notebook settings or `pyproject.toml`:

```toml
[tool.marimo.runtime]
auto_instantiate = false
```

## Memory and Variable Management

Because globals are unique, you cannot free `df` by assigning `df = None` in another cell. Instead:

- Encapsulate temporary work in functions or `_` locals.
- Use `del` inside the cell that defines the object.
- Keep large intermediates local when possible.

Example:

```python
def _():
    import matplotlib.pyplot as plt
    fig, ax = plt.subplots()
    ax.plot(data)
    return fig

_()
```

`plt`, `fig`, and `ax` stay local to the function.

## Editor Features

| Shortcut | Action |
| --- | --- |
| `Ctrl/Cmd + Enter` | Run focused cell |
| `Shift + Enter` | Run cell and move to next |
| `Ctrl/Cmd + Shift + Enter` | Run all cells |
| `Ctrl/Cmd + /` | Toggle comment |
| `Ctrl/Cmd + D` | Delete cell |
| `Ctrl/Cmd + Shift + K` | Disable or enable cell |
| `Escape` | Exit edit mode |
| `A` / `B` in select mode | Insert cell above or below |

Other useful editor features:

- Vim mode in notebook settings
- AI completion in settings, including OpenAI-compatible APIs and Ollama
- Variable explorer for inspecting globals without extra cells
- Dependency Graph panel for debugging reruns

## Package Management

marimo can prompt to install missing imports while editing:

```python
import polars as pl
```

For self-contained notebooks, use sandbox mode:

```bash
marimo edit --sandbox notebook.py
```

## Common Failures

| Problem | Likely cause | Fix |
| --- | --- | --- |
| Variable defined in multiple cells | Two cells assign the same global | Merge cells, rename one variable, or use `_local` |
| Cell not running after input change | Input object was mutated | Reassign in the defining cell |
| Cell stuck as stale | Lazy runtime mode is on | Run manually or switch to automatic |
| Circular dependency | Cells reference each other | Restructure the DAG |
| Import error in dependent cell | Import not defined upstream in the graph | Put imports in a referenced upstream cell |

## Examples

### Disable a slow data-loading cell

```python
raw = fetch_large_dataset()
```

Disable that cell while iterating on a fast downstream chart:

```python
chart = plot(raw)
chart
```

### Guard downstream work with `mo.stop`

```python
upload = mo.ui.file(label="Upload CSV")
upload
```

```python
mo.stop(not upload.value, mo.md("Upload a file to continue."))
import io

df = pd.read_csv(io.BytesIO(upload.value[0].contents))
df
```
