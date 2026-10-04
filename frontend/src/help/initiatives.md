# Initiatives

Initiatives are strategic goals that give your QA work direction and visibility. Link an initiative to a feature, set a target date, and track progress as you build out your test coverage.

---

## What Is an Initiative?

An initiative might be:
- "Automate checkout regression suite by end of Q2"
- "Achieve 80% API test coverage for v2 release"
- "Full smoke test suite for mobile app launch"

Initiatives have a priority, status, target date, milestones, and metrics. They show stakeholders the scope and progress of your automation work.

---

## Creating an Initiative

1. Go to **Settings → Initiatives**
2. Click **New Initiative**
3. Fill in the required fields:
   - **Name** — the goal in one line
   - **Description** — scope, context, or acceptance criteria
   - **Priority** — Low, Medium, High, or Critical
   - **Status** — Planning, In Progress, On Track, At Risk, Completed, or Cancelled
   - **Target Completion Date** (required)
4. Optionally link a **Feature**, set a target quarter, and add tags
5. Click **Create Initiative**

---

## Tracking Progress

Each initiative has a **Progress** percentage (0–100%) that you update manually as work completes. The progress bar changes colour based on the value:

| Range | Colour | Meaning |
|-------|--------|---------|
| 80–100% | 🟢 Green | On track or nearly done |
| 50–79% | 🔵 Blue | Good progress |
| 0–49% | 🟠 Orange | Early stage or at risk |

---

## Milestones

Break your initiative into milestones for finer-grained tracking:

1. In the initiative form, scroll to **Milestones**
2. Click **+ Add Milestone**
3. Set a name, target date, and status

Milestone statuses:

| Status | Icon |
|--------|------|
| Pending | ○ |
| In Progress | → |
| Completed | ✓ |
| Delayed | (shown in red) |

Up to 4 milestones are shown on the initiative card in the list view. If you have more, a **+N more** badge appears.

---

## Metrics

Each initiative tracks five coverage metrics:

| Metric | Description |
|--------|-------------|
| **Tests Automated** | How many tests have been automated for this initiative |
| **Coverage Target** | The % coverage you're aiming for |
| **Coverage Current** | Current coverage achieved |
| **Tests Created** | Number of test specs created |
| **Tests Remaining** | How many tests are still to be created |

Update these manually as you make progress.

---

## Priority Levels

| Priority | Use When |
|----------|----------|
| **Low** | Nice to have, no deadline pressure |
| **Medium** | Standard sprint or quarter work |
| **High** | Stakeholder-visible, deadline driven |
| **Critical** | Production risk, requires immediate action |

---

## Linking to the Dashboard

When you link an initiative to a Feature, you can filter the Dashboard timeline by that initiative. This shows only test results from tests associated with that feature — useful during a sprint to track quality trends in real time.

---

## Status Definitions

| Status | Meaning |
|--------|---------|
| Planning | Not yet started |
| In Progress | Actively being worked on |
| On Track | In progress and meeting targets |
| At Risk | Behind schedule or blocked |
| Completed | Goal achieved |
| Cancelled | No longer being pursued |
