# Dashboard

The Dashboard gives you a real-time overview of your test quality and execution health across all features and test packs.

---

## Metric Cards

Five summary cards appear at the top of the dashboard:

| Card | Description |
|------|-------------|
| **Tests Today** | Total tests executed in the last 24 hours with pass/fail breakdown |
| **Avg Execution** | Average duration per test run in seconds |
| **Flaky Tests** | Tests that alternated between pass and fail — review these promptly |
| **Pass Rate** | Percentage of tests passing across all runs in the last 24 hours |
| **Open Bugs** | Bug reports currently in open status, with critical/high count highlighted |

> **Note:** Tests Today, Avg Execution, Flaky Tests, and Pass Rate are aggregated from the last 24 hours of test results. Open Bugs is pulled live from your Bug Reports.

---

## Test Execution Timeline

The chart shows pass and fail counts grouped by hour over a rolling time window.

### Time Window Selector

Choose how far back to look:

- **Last 2h** — Fine-grained view of the most recent runs
- **Last 6h** — Half-day overview
- **Last 12h** — Shift-level view
- **Last 24h** — Full day

When the window crosses midnight, labels show the day name (e.g. "Mon 14:00").

---

## Filtering the Timeline

Use the two dropdowns above the time selector to scope the chart to a specific context.

### Filter by Initiative
Select an initiative to show only test results for the feature associated with that initiative. Useful during a sprint to see quality trends for a specific area of your product.

### Filter by Test Pack
Select a test pack to show only results from tests included in that pack. Use this to monitor the health of a specific regression suite or smoke test set.

> **Note:** Initiative and Test Pack filters are mutually exclusive — selecting one clears the other. Click **Clear** to remove all filters and return to the full view.

---

## Open Bugs Card

The Open Bugs count reflects bugs currently in **open** status in Bug Reports. The second line shows the combined count of **critical** and **high** severity bugs, which typically require the most urgent attention.

Click through to **Testing → Bug Reports** to see the full list and manage them.
