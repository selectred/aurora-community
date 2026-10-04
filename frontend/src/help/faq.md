# Frequently Asked Questions

---

## General

### What is Aurora?

Aurora is a QA management platform for teams running Playwright-based tests. It combines AI test generation, test pack organisation, synthetic monitoring, and initiative tracking in one application, available as a desktop app or to run in Docker.

### Does Aurora require an internet connection?

Aurora runs fully locally. An internet connection is only required for:
- AI test generation (calls to Anthropic/OpenAI APIs)
- Synthetic monitoring of external URLs
- Continuum integration, if enabled

### Where is my data stored?

All data is stored in a local SQLite database — nothing is sent to external servers except the AI API calls you explicitly configure.

- **Desktop app, macOS:** `~/Library/Application Support/com.selectred.aurora/aurora.db`
- **Desktop app, Windows:** `%APPDATA%\com.selectred.aurora\aurora.db`
- **Docker:** `/data/aurora.db` inside the `aurora_data` volume

### How do I reset Aurora to factory defaults?

Delete the `aurora.db` file from the location above and restart Aurora. This triggers the setup wizard on next launch. Export your data first from **Settings → Backup** if you want to keep a copy.

---

## Test Generator

### My test fails with "Cannot navigate to invalid URL"

Your URL is missing the protocol prefix. Use `https://www.example.com`, not `www.example.com`. Aurora auto-adds `https://` in most cases, but it is best to be explicit.

### The AI generated the wrong selectors

Try regenerating with a more specific description. Name elements explicitly — "the **Submit** button", "the **Email address** input" — rather than generic terms. You can also edit the generated code directly in the spec editor.

### No AI provider is configured — what happens?

Aurora falls back to a template-based generator that creates a basic test structure, but without AI intelligence. Configure a provider under **Settings → System** for best results.

### How do I test a page that requires a login?

Describe the login steps at the start of your test:
```
1. Open the login page at https://myapp.com/login
2. Enter testuser@example.com in the Email field
3. Enter my password in the Password field
4. Click Sign In
5. [continue with the page you want to test...]
```

The AI will generate a complete test that logs in first.

### Can I edit the generated test code?

Yes — open the test spec from **Testing → Test Packs**, click **Edit**, and modify the code directly. Changes are saved immediately.

---

## Test Packs

### Can I reorder tests within a pack?

Yes — drag and drop tests within the pack editor to reorder them. The order is saved automatically.

### What happens if a test in the pack fails?

By default Aurora continues running remaining tests. You can configure a pack to stop on first failure in the pack's advanced settings.

### How do I share a test pack with another user?

Export from **Settings → Data → Export**. The recipient imports the JSON on their Aurora instance. They will need to update target URLs if they're testing a different environment.

### Can I run a pack against a different URL without editing every test?

Not directly in the current version. The cleanest approach is to use `{URL}` placeholders in your test descriptions — Aurora will substitute the base URL from the spec's URL field. Update the spec URL to point to the new environment.

---

## Synthetic Monitoring

### How often can I run a synthetic monitor?

The minimum practical interval for browser-based tests is 5 minutes. More frequent runs can cause resource contention. For simple HTTP checks, 1-minute intervals are fine.

### A synthetic test keeps failing but runs fine manually — why?

This is usually a timing issue. The synthetic runner uses strict `networkidle` waits. Try:
1. Increasing the timeout in the monitor settings
2. Adding explicit wait steps to your test description
3. Checking for environment differences (staging vs production URLs)

### Can I get email or Slack alerts when a synthetic test fails?

Alert notifications are on the roadmap for a future release. Currently, failures are visible in the Synthetic Monitoring view and recorded in test results.

### Why does a monitor show "Last checked: never"?

The monitor scheduler runs as part of the Aurora backend. Make sure the backend process is running. If it was just started, the first check will run at the next scheduled interval.

---

## Features & Initiatives

### What is the difference between a Feature and an Initiative?

A **Feature** is *what* you're testing (e.g. "Checkout Flow"). An **Initiative** is a *goal* around that feature (e.g. "Automate checkout regression suite by Q2"). One feature can have multiple initiatives.

### Can I have multiple initiatives for one feature?

Yes — create as many initiatives as you like and link them all to the same feature.

### The Dashboard filter by initiative isn't showing results — why?

The initiative filter works by scoping results to the **feature** linked to that initiative. If no feature is linked to the initiative, or if the tests were not run against that feature, no results will appear. Make sure:
1. The initiative has a Feature linked to it
2. The tests you ran were associated with that feature

---

## Settings & Configuration

### I lost my API key — where do I re-enter it?

Go to **Settings → System**, enter your new API key for the relevant provider, and click **Save Settings**.

### The setup wizard keeps appearing on every launch

The wizard triggers when no manager profile exists. Make sure you completed the Profile step (Step 1) of the wizard — enter your name and click through to the end. If it persists, check that the backend is running and accessible at `localhost:3000`.

### Can I run multiple Aurora instances for different projects?

Each Aurora installation uses a single database (see *Where is my data stored?*). Running a single instance and using Features and Initiatives to organise separate projects is the recommended approach. Separate database files for completely distinct installations are not currently supported through the UI.

### How do I update Aurora?

**Desktop app:** install the new version over the existing one (replace the `.app` on macOS or re-run the installer on Windows). Your database lives in the Application Support directory, not inside the app, so it persists.

**Docker:** fetch the new version (for example `git pull`), then run `docker compose up -d --build`. Your data is in the `aurora_data` volume, so it persists.
