# Synthetic Monitoring

Synthetic Monitoring runs your Playwright tests on a schedule — like a robot that continuously checks your application and alerts you the moment something breaks. Catch failures before your users do.

---

## What Is Synthetic Monitoring?

Instead of waiting for a user to report a problem, synthetic monitoring proactively runs your test scripts at regular intervals and records the results. Each run checks that:

- The page or endpoint responds
- Key user journeys complete successfully
- Response times are within acceptable limits
- Screenshots on failure give you instant visibility into what went wrong

---

## Setting Up a Monitor

1. Go to **Synthetic Monitoring** in the sidebar
2. Click **New Monitor**
3. Enter the **Name** and target **URL**
4. Set a **check frequency** using a cron expression
5. Optionally attach an existing test script
6. Set a **timeout** (how long to wait before marking the check as failed)
7. Toggle **Enabled** and click **Create**

---

## From Test Pack to Synthetic Monitor

The recommended path for creating reliable synthetic monitors:

1. **Write** a test description in the Test Generator
2. **Generate** the test script with AI
3. **Add** it to a Test Pack
4. **Run manually** a few times to confirm it passes consistently
5. **Promote** to a Synthetic Monitor once stable

This workflow ensures your synthetic monitors are reliable and don't produce false alarms from flaky tests.

---

## Schedule Expressions

Synthetic monitors use cron syntax for scheduling:

| Expression | Schedule |
|------------|----------|
| `*/5 * * * *` | Every 5 minutes |
| `*/15 * * * *` | Every 15 minutes |
| `0 * * * *` | Every hour |
| `0 */6 * * *` | Every 6 hours |
| `0 9 * * 1-5` | Weekdays at 9am |
| `0 6 * * *` | Daily at 6am |

> **Minimum recommended interval:** 5 minutes for browser-based tests. More frequent checks can cause resource contention on your machine.

---

## Understanding Monitor Results

Each monitor card shows:

| Field | Description |
|-------|-------------|
| **Status** | Up (passing) or Down (failing) |
| **Last Checked** | When the most recent check ran |
| **Response Time** | How long the page took to load |
| **Pass Rate** | Historical reliability as a percentage |
| **Uptime** | Percentage of checks that passed |

---

## Screenshots on Failure

When a synthetic test fails, Aurora captures a screenshot at the point of failure. View it in the monitor detail panel to immediately understand what broke — a missing element, an error message, a redirect to an unexpected page.

---

## Retry on Failure

Configure **retry count** in the monitor settings to avoid false positives from transient network issues. With a retry count of 2, the monitor will attempt the check 3 times total before recording a failure.

Set a global default under **Settings → Synthetic Settings**.

---

## Trends

The Synthetic Monitoring view includes a **Trends** chart showing pass rates and response times over time. Use this to spot gradual degradation — a test that was taking 2 seconds last week and is now taking 8 seconds is a warning sign, even if it's still passing.
