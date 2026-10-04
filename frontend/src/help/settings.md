# Settings

Aurora's settings are split into seven sections, all accessible from the sidebar under **Settings**.

---

## Profile

**Settings → Profile**

Configure your personal details:

| Field | Description |
|-------|-------------|
| **Name** | Your display name shown in the app |
| **Email** | Your contact email |
| **Role** | Your QA role title (e.g. QA Manager, Lead QA Engineer) |

**Launch Setup Guide** — click this button to re-run the initial setup wizard at any time. Useful for onboarding new team members or reviewing the app's key features.

---

## Features

**Settings → Features**

Create, edit, and delete Features (Products) — the organisational unit for grouping tests and initiatives. See the [Features & Products](features) guide for full details.

---

## Initiatives

**Settings → Initiatives**

Create and manage strategic initiatives with milestones, metrics, and feature links. See the [Initiatives](initiatives) guide for full details.

---

## Synthetic Settings

**Settings → Synthetic Settings**

Default values applied to all new synthetic monitors:

| Setting | Description |
|---------|-------------|
| **Default Timeout** | How long (ms) to wait before marking a check as failed |
| **Default Retry Count** | How many times to retry before recording a failure |
| **Alert Threshold** | Consecutive failures before an alert is triggered |

Individual monitors can override these defaults in their own settings.

---

## System Settings

**Settings → System**

### AI Provider

Configure which AI service powers the Test Generator:

| Provider | Required |
|----------|----------|
| **Anthropic (Claude)** | Anthropic API key |
| **OpenAI (GPT)** | OpenAI API key |
| **Azure OpenAI** | Azure endpoint URL + deployment name + API key |
| **Local LLM** | Local endpoint URL (e.g. `http://localhost:11434`) + model name; API key optional |

Select the active provider, enter your credentials, and click **Save Settings**. Only the selected provider is active at any time.

The **Local LLM** option works with any server that exposes an OpenAI-compatible API, such as Ollama or LM Studio. No internet connection is required when using a local model.

> **Security:** API keys are stored locally in your Aurora database and are never exported in backups.

### Pack Storage

Controls how generated test code is stored:

| Option | Description |
|--------|-------------|
| **Database (default)** | Test code stored inline in the SQLite database |
| **File Storage** | Test code written to disk at a configurable path |

File storage is recommended for large installations (hundreds of test specs). Configure:
- **Root Directory** — where test files are stored on disk
- **File Size Threshold** — tests larger than this (bytes) are stored as files; smaller ones stay in the database
- **Max Pack Count** — optional limit on total test specs

Use the **Browse** button to select a directory, or **Open in Finder** to inspect the current storage location.

### Continuum Integration

If you use Aurora Continuum (the cloud analytics and reporting platform), enter:
- **Continuum URL** — your Continuum instance address
- **API Key** — your integration key

Test results will be pushed to Continuum automatically after each run. Included in the Pro and Unlimited plans and in the Community Edition.

---

## Backup / Data

**Settings → Backup**

### Exporting Your Data

Click **Export** to download a complete JSON backup of your Aurora data:

- All test specs and generated code
- Test pack configurations and schedules
- Initiatives, milestones, and metrics
- Features and their settings
- Synthetic monitor configurations
- App settings (excluding API keys)

### Importing Data

Click **Import** and select a previously exported JSON file. Existing records are merged — duplicates are skipped based on ID matching.

> **Note:** API keys are never included in exports for security reasons. You will need to re-enter them after importing on a new machine.

### Sample Data

Aurora ships with a built-in sample dataset — two teams, five members, six test specs, and four months of test history — so the app looks populated from day one.

- **Load Sample Data** — adds the sample data if the app is currently empty (button is disabled if data already exists)
- **Clear Sample Data** — removes all sample teams, members, specs, results, and initiatives. Your own data (app settings, AI keys, license) is preserved.

### Data Summary

The export screen shows a summary of how many records exist in each category, so you can verify your data before exporting.

---

## AI Prompts

**Settings → AI Prompts**

Customise the system prompts used at each stage of the AI pipeline. This is an advanced setting — the defaults work well for most cases.

### Selecting a Prompt

Use the dropdown to select which prompt to edit. Prompts are grouped into two categories:

**Pipeline prompts** — used during the Probe → Plan → Generate → Run → Heal flow:

| Prompt | When it's used |
|--------|---------------|
| **Plan — with page probe** | The AI has probed the target URL and has live page structure data |
| **Plan — no probe** | Generating a plan from your description alone, without live page data |
| **Generate — runnable spec** | Main generate stage — produces a self-contained Playwright JS spec |
| **Heal** | Diagnoses a failing test and rewrites the broken step |

**Library prompts** — used by the POM/fixture/TypeScript library generation workflow:

| Prompt | When it's used |
|--------|---------------|
| **Generate — code (legacy)** | Older generate-code flow for POM-based library generation |
| **Page Object Model** | Generates a TypeScript POM class from probe data |
| **Fixture file** | Generates a Playwright `test.extend()` fixture file |
| **TypeScript spec** | Generates a `.spec.ts` file using the POM fixture |
| **Bug title generator** | Short prompt for generating concise bug report titles |

### Editing

The selected prompt is displayed in a large code editor. Edit the text directly and click **Save Changes** when done.

A **Modified** badge appears next to any prompt that differs from its factory default.

### Resetting

- **Reset this prompt** — reverts only the currently selected prompt to its default
- **Reset All** — reverts all nine prompts to their factory defaults (requires confirmation)
