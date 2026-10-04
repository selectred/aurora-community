# Bug Reports

Bug Reports is Aurora's lightweight issue tracker for test failures. When a test fails, you can log a bug directly from the failure — capturing the error, environment, and severity in one place.

---

## What Is a Bug Report?

A bug report is a record of a test failure worth tracking. Not every failure needs a bug — transient network errors or environment blips can be dismissed. Bug Reports are for genuine defects you want to monitor, assign, and eventually resolve.

Each report includes:
- A title (AI-generated or manually written)
- Severity: **Critical**, **High**, **Medium**, or **Low**
- Status: **Open**, **In Progress**, or **Resolved**
- The failing test name and error message
- Environment, browser, and timestamp

---

## Creating a Bug Report

Bug reports can be created from any failed test result.

1. Find a failing test result in **Monitoring → Functional Tests** or **Monitoring → API Tests**
2. Click the failure to expand it
3. Click **Log Bug**
4. Aurora auto-generates a title using AI (if a provider is configured) — edit it if needed
5. Set the **Severity** and click **Create**

You can also create reports manually from **Testing → Bug Reports → New Bug**.

---

## Managing Bug Reports

### Status Workflow

Move bugs through the standard workflow:

| Status | Meaning |
|--------|---------|
| **Open** | Newly logged, not yet being worked on |
| **In Progress** | Actively being investigated or fixed |
| **Resolved** | Fix confirmed and verified |

Update the status by clicking the status badge on any bug card and selecting the new state.

### Filtering

Use the filters at the top of the Bug Reports view to narrow the list:

- **Status** — show only Open, In Progress, or Resolved bugs
- **Severity** — filter to Critical/High to focus on urgent issues
- **Search** — find bugs by title or error message text

### Sorting

Sort by date created, severity, or status using the sort dropdown.

---

## Dashboard Integration

The **Open Bugs** card on the Dashboard shows:
- Total number of bugs in **Open** status
- The combined count of **Critical** and **High** severity open bugs

This gives you an at-a-glance view of your defect backlog without leaving the overview.

---

## AI Title Generation

When an AI provider is configured, Aurora generates a concise bug title automatically from the test name and error message. Titles follow the format:

> `[Component] Short description of what failed`

For example: `[Auth Flow] Login button unresponsive after form validation error`

You can edit the generated title before saving, or overwrite it any time from the bug detail view.

---

## Bulk Actions

Select multiple bugs using the checkboxes to:
- **Bulk update status** — mark a batch as Resolved after a fix is deployed
- **Bulk delete** — remove old or irrelevant reports

---

## Resolving Bugs

When a failing test passes again after a fix:

1. Open the bug report
2. Change status to **Resolved**
3. Optionally add a note describing what changed

Resolved bugs are kept in history for audit purposes. Use the **Status** filter to hide them from the default view.
