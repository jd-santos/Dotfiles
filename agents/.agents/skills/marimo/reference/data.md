# marimo Data Reference

Use this when building interactive UIs, working with dataframes, querying data, or visualizing results in marimo.

## UI Elements

A UI element only triggers reactive reruns when assigned to a global variable.

```python
slider = mo.ui.slider(1, 100)
slider
```

Avoid anonymous widgets when you need reactivity:

```python
mo.ui.slider(1, 100)  # interactions will not update downstream cells
```

Common widgets:

```python
slider = mo.ui.slider(start=0, stop=100, value=50, label="Threshold")
number = mo.ui.number(start=0, stop=1000, step=10)
text = mo.ui.text(placeholder="Search...", label="Query")
dropdown = mo.ui.dropdown(options=["mean", "median", "sum"], value="mean")
radio = mo.ui.radio(options=["A", "B", "C"])
checkbox = mo.ui.checkbox(label="Include outliers")
city_filter = mo.ui.dropdown.from_series(df["city"], label="City")
age_slider = mo.ui.slider.from_series(df["age"], label="Max age")
upload = mo.ui.file(label="Upload CSV", filetypes=[".csv"])
date = mo.ui.date(label="Start date")
```

Read current values with `.value`:

```python
slider.value
dropdown.value
checkbox.value
upload.value
```

Embed widgets in Markdown:

```python
slider = mo.ui.slider(0, 10, label="n")
mo.md(f"Show **{slider}** items")
```

## Dataframes

Return a dataframe as the final expression to get marimo's interactive viewer with pagination, sorting, and search:

```python
df
```

Use `mo.plain(df)` to opt out of the rich viewer.

### GUI transformations

```python
transform_ui = mo.ui.dataframe(df)
transform_ui
```

```python
transform_ui.value
```

The GUI can generate code you can copy into a cell.

### Reactive filtering

```python
max_age = mo.ui.slider.from_series(df["age"], label="Max age")
city = mo.ui.dropdown.from_series(df["city"], label="City")
mo.hstack([max_age, city])
```

```python
filtered = df[(df["age"] <= max_age.value) & (df["city"] == city.value)]
mo.ui.table(filtered)
```

### Selectable tables

```python
table = mo.ui.table(df, selection="multi")
table
```

```python
table.value
```

In `marimo edit`, dataframe outputs also expose row viewer, column explorer, and chart builder panels.

## SQL Cells

marimo SQL cells can query Python objects and return dataframes.

```sql
SELECT *
FROM df
WHERE age > {threshold.value}
LIMIT 100
```

Set the default SQL output format in notebook settings: pandas, polars, or native.

## Composite UI

Group unnamed widgets with `mo.ui.array`:

```python
widgets = mo.ui.array([mo.ui.slider(0, 10) for _ in range(3)])
widgets
```

```python
widgets.value
```

Group named widgets with `mo.ui.dictionary`:

```python
params = mo.ui.dictionary({
    "alpha": mo.ui.slider(0.0, 1.0, step=0.01, value=0.5),
    "n": mo.ui.number(1, 100, value=10),
})
params
```

```python
params.value
```

Use forms to gate updates on submit:

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
form.value
```

## Layout

```python
mo.hstack([widget_a, widget_b], gap=1)
mo.vstack([widget_a, widget_b], gap=1)
mo.ui.tabs({"Overview": overview_content, "Details": details_content})
mo.accordion({"Section title": content})
mo.callout(mo.md("Important note"), kind="warn")
```

## Plotting

### Altair

```python
import altair as alt

chart = alt.Chart(df).mark_point().encode(x="x", y="y")
interactive_chart = mo.ui.altair_chart(chart)
interactive_chart
```

```python
interactive_chart.value
```

### Plotly

```python
import plotly.express as px

fig = px.scatter(df, x="x", y="y")
interactive_fig = mo.ui.plotly(fig)
interactive_fig
```

```python
interactive_fig.value
```

For matplotlib, seaborn, and similar libraries, return the figure as the last expression.

## Common Failures

| Problem | Cause | Fix |
| --- | --- | --- |
| Widget interaction does nothing | Widget is not assigned to a global | Assign it before displaying |
| `.value` returns `None` | No default and no interaction yet | Provide `value=` where possible |
| Filter returns no rows | Defaults exclude all rows | Check defaults against the data range |
| SQL cannot find a variable | Python variable is not defined in the graph | Make sure the defining cell runs |
| Dataframe GUI options are missing | pandas or polars is missing | Install the dataframe package |

## Example Pipeline

```python
import marimo as mo
import pandas as pd

df = pd.read_csv("data.csv")
```

```python
min_score = mo.ui.slider(0, 100, value=50, label="Min score")
category = mo.ui.dropdown.from_series(df["category"], label="Category")
mo.hstack([min_score, category])
```

```python
result = df[
    (df["score"] >= min_score.value)
    & (df["category"] == category.value)
]
mo.ui.table(result)
```

```python
mo.md(f"**{len(result)}** rows matching filters")
```
