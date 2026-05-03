---
name: marimo-data
description: Guides interactive data work in marimo. Covers mo.ui widgets (slider, dropdown, table, dataframe), reactive filtering, SQL cells, plotting integration, and layout elements. Load the marimo hub skill first. Use when building interactive UIs, working with dataframes, querying data, or visualizing results in marimo.
version: 1.0.0
author: jdwork
category: workflow
requires: [marimo]
---

# Skill: Marimo Data

## Description

Everything interactive and data-related in marimo: UI elements, dataframe tools, SQL cells, and plotting. Load this when building reactive UIs, wiring widgets to data, or querying/visualizing datasets.

## Instructions

### 1. UI Elements (`mo.ui`)

#### Core rule

A UI element only triggers reactive reruns when it's assigned to a **global variable**. Always assign widgets to globals before displaying them.

```python
# Correct — assigned to global
slider = mo.ui.slider(1, 100)
slider  # display as cell output
```

```python
# Wrong — anonymous element, interactions do nothing
mo.ui.slider(1, 100)  # no global assignment
```

#### Common widgets

```python
# Numeric input
slider = mo.ui.slider(start=0, stop=100, value=50, label="Threshold")
number = mo.ui.number(start=0, stop=1000, step=10)

# Text / selection
text   = mo.ui.text(placeholder="Search...", label="Query")
dropdown = mo.ui.dropdown(options=["mean", "median", "sum"], value="mean")
radio  = mo.ui.radio(options=["A", "B", "C"])
checkbox = mo.ui.checkbox(label="Include outliers")

# Data-driven selectors (from a Series)
city_filter = mo.ui.dropdown.from_series(df["city"], label="City")
age_slider  = mo.ui.slider.from_series(df["age"], label="Max age")

# File upload
upload = mo.ui.file(label="Upload CSV", filetypes=[".csv"])

# Date
date = mo.ui.date(label="Start date")
```

#### Reading values

Every widget exposes `.value`:

```python
slider.value       # current numeric value
dropdown.value     # selected option string
checkbox.value     # True / False
upload.value       # list of FileInfo objects
```

#### Embedding in markdown

```python
slider = mo.ui.slider(0, 10, label="n")
mo.md(f"Show **{slider}** items")  # widget renders inline
```

### 2. Dataframes

#### Displaying dataframes

Include the dataframe as the last expression — marimo renders an interactive viewer with pagination, sorting, and search:

```python
df  # rich viewer, not plain text
```

Use `mo.plain(df)` to opt out of the rich viewer.

#### No-code transformations

```python
# Cell 1 — wrap df in mo.ui.dataframe for a GUI transformer
transform_ui = mo.ui.dataframe(df)
transform_ui
```

```python
# Cell 2 — .value holds the transformed result
transform_ui.value
```

The GUI generates code you can copy into a cell.

#### Reactive filtering with widgets

```python
# Cell 1 — filter widgets
max_age   = mo.ui.slider.from_series(df["age"], label="Max age")
city      = mo.ui.dropdown.from_series(df["city"], label="City")
mo.hstack([max_age, city])
```

```python
# Cell 2 — reruns automatically on widget interaction
filtered = df[(df["age"] <= max_age.value) & (df["city"] == city.value)]
mo.ui.table(filtered)
```

#### Selectable tables

```python
table = mo.ui.table(df, selection="multi")  # or "single"
table
```

```python
# .value is the selected subset as a DataFrame
table.value
```

#### Dataframe panels (editor only)

When editing with `marimo edit`, dataframe outputs have toggle buttons for:

- **Row viewer** — inspect individual rows; navigate with arrow keys
- **Column explorer** — summary stats and auto-charts per column
- **Chart builder** — drag-and-drop chart builder that generates Python code

### 3. SQL Cells

marimo supports native SQL cells that execute against Python objects and return DataFrames.

Add a SQL cell from the cell type menu. Reference Python variables directly in SQL:

```sql
SELECT *
FROM df
WHERE age > {threshold.value}
LIMIT 100
```

The result is returned as a DataFrame and can be referenced in other cells like any Python variable.

Configure the default output format (pandas/polars/native) in notebook settings → Runtime → "Default SQL output".

### 4. Composite and Advanced UI

#### Grouping multiple widgets

```python
# mo.ui.array — group related widgets; access by index
widgets = mo.ui.array([mo.ui.slider(0, 10) for _ in range(3)])
widgets
```

```python
# Cell 2 — .value is a list of current values
widgets.value  # e.g., [3, 7, 1]
```

```python
# mo.ui.dictionary — group with named keys
params = mo.ui.dictionary({
    "alpha": mo.ui.slider(0.0, 1.0, step=0.01, value=0.5),
    "n": mo.ui.number(1, 100, value=10),
})
params
```

```python
params.value  # {"alpha": 0.5, "n": 10}
```

#### Forms — gate updates on submit

```python
form = mo.ui.form(
    mo.md("""
    **Search parameters**

    Query: {query}

    Max results: {limit}
    """).batch(
        query=mo.ui.text(placeholder="Search..."),
        limit=mo.ui.slider(1, 100, value=20),
    )
)
form
```

```python
# Only updates when the form is submitted
form.value  # {"query": "...", "limit": 20}
```

### 5. Layout

```python
# Horizontal / vertical stacks
mo.hstack([widget_a, widget_b], gap=1)
mo.vstack([widget_a, widget_b], gap=1)

# Tabs
mo.ui.tabs({
    "Overview": overview_content,
    "Details": details_content,
})

# Accordion (collapsible)
mo.accordion({"Section title": content})

# Callouts
mo.callout(mo.md("Important note"), kind="warn")  # info, success, warn, danger
```

### 6. Plotting Integration

#### Altair (selectable charts)

```python
import altair as alt

chart = alt.Chart(df).mark_point().encode(x="x", y="y")
interactive_chart = mo.ui.altair_chart(chart)
interactive_chart
```

```python
# .value is the selected rows as a DataFrame
interactive_chart.value
```

#### Plotly (selectable)

```python
import plotly.express as px

fig = px.scatter(df, x="x", y="y")
interactive_fig = mo.ui.plotly(fig)
interactive_fig
```

```python
interactive_fig.value  # selected data as DataFrame
```

#### Other plotting libraries

For matplotlib, seaborn, etc., just output the figure as the last expression — marimo renders it directly.

### 7. Error Handling

| Problem | Cause | Fix |
|---------|-------|-----|
| Interacting with widget does nothing | Not assigned to a global | Assign to a variable before displaying |
| `.value` returns None | Widget hasn't been interacted with | Provide a default `value=` in the constructor |
| Filter returns empty dataframe | Widget default value excludes all rows | Check default values against actual data range |
| SQL cell can't find variable | Python variable not yet defined | Make sure the defining cell runs first |
| `mo.ui.dataframe` GUI options missing | Package `pandas`/`polars` not installed | Install the appropriate package |

## Examples

### Full reactive filter pipeline

```python
# Cell 1
import marimo as mo
import pandas as pd

df = pd.read_csv("data.csv")
```

```python
# Cell 2 — filter controls
min_score = mo.ui.slider(0, 100, value=50, label="Min score")
category  = mo.ui.dropdown.from_series(df["category"], label="Category")
mo.hstack([min_score, category])
```

```python
# Cell 3 — filtered view, reruns on any widget change
result = df[
    (df["score"] >= min_score.value) &
    (df["category"] == category.value)
]
mo.ui.table(result)
```

```python
# Cell 4 — summary stats update too
mo.md(f"**{len(result)}** rows matching filters")
```

### Selectable chart → downstream table

```python
chart = mo.ui.altair_chart(
    alt.Chart(df).mark_circle().encode(x="x:Q", y="y:Q", color="label:N")
)
chart
```

```python
# Only shows selected points
chart.value if len(chart.value) else mo.md("Click points to select them.")
```

## Prerequisites

- marimo installed (`pip install marimo`)
- For SQL cells and AI: `pip install marimo[recommended]`
- For Altair charts: `pip install altair` (+ `vegafusion` for large datasets)
- For Plotly: `pip install plotly`
- pandas or polars for dataframe work

## Cross-Reference

- **marimo** — hub skill with core concepts and reactive model
- **marimo-notebook** — cell model, editor shortcuts, execution control
- **marimo-app** — deploying interactive notebooks as apps
