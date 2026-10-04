# Performance Tests

Aurora is where performance tests are written and made stable. You build a k6 script, wrap it in a scenario with a load profile and pass/fail thresholds, and run it here with up to 20 virtual users. Once a scenario passes reliably, push it to Continuum, which runs it at full scale.

---

## Scripts

A script is a k6 test of one user journey. Open **Performance Tests** in the sidebar, then **New script**:

- **Blank HTTP script** — requests at the protocol level. Light, so you can run many users.
- **Blank browser script** — each user drives a real headless Chromium and reports web vitals. Heavy: keep the user count low.
- **Import a HAR file** — record the journey in your browser's dev tools (Network tab → *Save all as HAR with content*) and import it. Aurora drops static files, analytics and other sites, reads tokens and ids from earlier responses instead of replaying them, and turns passwords and tokens into variables.
- **From a recording** — record the journey in the Test Generator, choose **Create k6 load test**, then **Save to Performance**.

### Variables

Scripts read settings with `__ENV.NAME`, for example `BASE_URL`. Mark a variable as **secret** (the lock button) for passwords and tokens: the value is encrypted on this machine, used for runs here, and never sent to Continuum. Continuum receives the variable name only, and you set the value there.

### Smoke run

**Run once** runs the script with one user for one iteration. Use it after every change: it shows failed checks by group, and the k6 output.

---

## Scenarios

A scenario is a script plus:

- **Load profile**
  - **Ramp in stages** — users ramp up and down through stages; the usual load test. The *Load test*, *Stress* and *Spike* buttons fill in common shapes.
  - **Steady users** — a fixed number of users for a fixed time.
  - **Steady arrival rate** — journeys start at a fixed rate, whatever the response times.
- **Thresholds** — the run fails if the 95th percentile or average response time goes over the limit, or the error rate goes over the percentage you set.
- **Think time** — the pause between pages (`THINK_TIME`), overriding the script's default.

The preview shows users over time. Local runs are limited to 20 users and 60 minutes; lower the limits in **Settings → Performance** on a less powerful machine.

---

## Runs

**Run** queues the scenario. Runs go one at a time on this machine. While a run is going you see active users, completed journeys and progress, and you can stop it.

When it finishes you get:

- request count, throughput, average, median, 95th percentile and slowest response, error rate and peak users
- charts of response times and errors, and users and throughput over the run
- each threshold, passed or failed
- the k6 console output and the exact script that ran

### Baselines and regressions

Mark a good run as the **baseline**. Later runs with the same load are compared with it, and a run is flagged **Regressed** when it is more than 10% slower or its error rate rises by more than 1 point. Change these tolerances in **Settings → Performance**.

---

## Pushing to Continuum

When a scenario is stable, choose **Push to Continuum**. Continuum receives the script, the variable names (secret values withheld), the load profile and the thresholds, as a scenario with its default workload. Pushing again updates it. Continuum must be connected in **Settings → Continuum**.

---

## Monitoring

**Monitoring → Performance** shows the 95th percentile and error rate of every scenario over time, the latest result per scenario, pass rate, regressions and recent runs.
