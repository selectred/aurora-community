# Test Packs

Test Packs are curated collections of test scripts, designed to be run as a batch. Organise related tests into packs — smoke tests, regression suites, feature-specific sets — and run them with a single click.

---

## Creating a Test Pack

1. Go to **Testing → Test Packs**
2. Click **New Pack**
3. Give the pack a descriptive name (e.g. "Smoke Tests", "Login & Auth Suite", "Checkout Regression")
4. Add an optional description
5. Click **Create**

---

## Adding Tests to a Pack

After creating a pack, add individual test specs from your library:

1. Open the pack
2. Click **Add Tests**
3. Select one or more specs from your library
4. Click **Add Selected**

Tests within a pack can be reordered by dragging and dropping.

---

## Running a Pack

Click the **Run** button on any pack to execute all tests in sequence. Results appear in real-time:

| Status | Meaning |
|--------|---------|
| 🟢 Green | Test passed |
| 🔴 Red | Test failed — error message shown inline |
| ⚪ Grey | Test not yet run in this session |

By default, Aurora continues running remaining tests even if one fails. You can configure a pack to stop on first failure in the pack settings.

---

## Scheduling a Pack

Each pack can run on an automatic schedule using a cron expression. Common examples:

| Expression | Schedule |
|------------|----------|
| `*/15 * * * *` | Every 15 minutes |
| `0 * * * *` | Every hour |
| `0 9 * * 1-5` | Weekdays at 9am |
| `0 0 * * *` | Daily at midnight |

Set the schedule in the pack settings and toggle **Enabled** to activate it.

---

## Promoting to Synthetic Monitoring

When a pack runs reliably, you can promote individual tests to **Synthetic Monitoring** — this creates an always-on monitor that runs the test on a schedule and records failures.

The recommended workflow:
1. Generate a test in the Test Generator
2. Add it to a pack and run it manually a few times
3. Confirm the test passes consistently
4. Promote to a Synthetic Monitor

---

## Pack Storage

By default, generated test code is stored inside the Aurora database. For larger installations, you can configure **file-based storage** under **Settings → System → Pack Storage**:

- Set a root directory where test files will be written to disk
- Set a file size threshold — tests larger than this are stored as files automatically
- Useful when your test library grows to hundreds of specs

---

## Exporting & Importing Packs

Export a pack from **Settings → Data → Export**. The export includes all test specs and their generated code. Import on another Aurora instance to share your test suite.

> **Note:** The recipient will need to adjust the target URL in each spec if they're testing a different environment.

---

## Pack Lifecycle Hooks

Advanced packs can have a **Setup** and **Teardown** script that runs before and after the pack executes. These are useful for seeding test data, logging in a shared test user, or cleaning up after the run.

Configure these in the pack's advanced settings.
