# Test Generator

The Test Generator turns plain-English descriptions into runnable Playwright test scripts. Describe what you want to test, provide a URL, and Aurora writes the code — with or without an AI provider configured.

---

## Two Ways to Generate Tests

Aurora has **two generation modes** depending on whether an AI provider is configured under **Settings → System**.

---

### With AI (Recommended)

When an AI provider (Anthropic Claude, OpenAI GPT, Azure OpenAI, or a local LLM) is configured:

**What happens at the "Plan" step:**
The AI reads your description and produces an intelligent, structured test plan. It understands context — if you say "log in and check the dashboard", it infers you need a navigation step, form interactions, a submit action, and a success verification. It generates 2–5 meaningful test scenarios tailored to your use case.

**What happens at the "Generate" step:**
The AI converts the plan into complete, production-quality Playwright code. It writes:
- Proper element selectors (role-based, label-based, and text-based)
- Appropriate `waitFor` calls so tests don't fail on slow pages
- Realistic assertions matched to what you described
- Correct handling for forms, navigation, and dynamic content

**Result:** A working test script that typically runs first time with no manual editing needed.

---

### Without AI (Template Mode)

When no AI provider is configured, Aurora uses a built-in **template-based fallback**:

**What happens at the "Plan" step:**
Aurora detects keywords in your description (login, checkout, cart, etc.) and returns a fixed template plan for that keyword category. For anything not recognised, it returns a generic "Page Load + Navigation" template. The plan is not tailored to your specific description.

**What happens at the "Generate" step:**
Aurora produces a **stub script** — a placeholder that navigates to the URL and has a passing title assertion, but does **not** implement the test steps. The plan is embedded as comments with `// TODO:` markers. You must manually write the actual test logic.

**Result:**
```js
// TODO: Implement test steps from plan
// Plan:
// ## Test 1: Successful Login
// - Navigate to login page
// - Fill valid email in email field
// ...
await expect(page).toHaveTitle(/.*/);
```

> This stub will show as **ready** and will pass when run (because the title assertion is permissive), but it does not actually test your application. You need to replace the TODO block with real Playwright steps.

---

## Comparison Table

| Capability | With AI | Without AI |
|-----------|---------|------------|
| **Plan quality** | Tailored to your description | Generic keyword-matched template |
| **Test scenarios** | 2–5 specific, meaningful scenarios | 2 fixed scenarios per keyword category |
| **Generated code** | Complete, runnable Playwright test | Placeholder stub with TODO comments |
| **Selectors** | Smart role/label/text-based selectors | Not generated — requires manual coding |
| **Assertions** | Context-aware, matched to your intent | Generic title assertion only |
| **Ready to run** | Usually yes, first time | No — requires manual implementation |
| **Test Packs "Generate" button** | Template-based (same as without AI) | Template-based |
| **Auto-heal on failure** | Yes — AI rewrites failing steps | No |

---

## The "Generate" Button in Test Packs

> **Important:** The **Generate** button on individual tests inside Test Packs is **always template-based**, regardless of whether an AI provider is configured.

It works differently from the Test Generator terminal:
- It reads the **markdown spec** you wrote (the bullet-point steps)
- It converts keywords to Playwright code using pattern matching:
  - `Navigate to X` → `page.goto('X')`
  - `Click the Y button` → `page.click('text=Y')`
  - `Fill "value" in Z field` → `page.fill('[name=z], textarea', 'value')`
  - `Verify text is visible` → `expect(page.locator('text=...')).toBeVisible()`
- It does **not** call the AI — even with a key configured

This means: **the more precisely you write your markdown spec**, the better the generated code. Follow the step format exactly for best results.

**The Test Generator terminal (with AI)** produces far superior code from a higher-level description. Use that workflow when starting fresh. Use the Test Packs "Generate" button to re-generate code from an edited spec.

---

## Setting Up an AI Provider

Go to **Settings → System → AI Provider**, select your provider, enter your API key, and click **Save**. The Test Generator terminal will immediately use AI on the next run.

| Provider | Where to get a key |
|----------|-------------------|
| **Anthropic (Claude)** | [console.anthropic.com](https://console.anthropic.com) |
| **OpenAI (GPT)** | [platform.openai.com](https://platform.openai.com) |
| **Azure OpenAI** | Your Azure portal |
| **Local LLM** | No key needed for most local servers (e.g. Ollama, LM Studio) — enter your local endpoint URL |

---

## Writing Good Descriptions (for AI mode)

The quality of AI-generated tests reflects the clarity of your description.

### Be step-by-step

```
1. Open the login page
2. Enter my email address in the Email field
3. Enter my password in the Password field
4. Click the Sign In button
5. Verify that the dashboard page loads
```

### Name elements explicitly

Rather than "fill in the form", say "type in the **Email** input field" or "click the **Submit** button". Explicit element names result in better selectors.

### State the expected outcome

Always end with what success looks like:
- "Verify that the URL changes to `/dashboard`"
- "Check that the page title contains 'Welcome'"
- "Confirm that a success message appears"

---

## URL Requirements

Your URL must include the protocol:

| ✅ Works | ❌ Does not work |
|---------|----------------|
| `https://www.example.com` | `www.example.com` |
| `https://staging.myapp.com/login` | `myapp.com/login` |
| `http://localhost:8080` | `localhost:8080` |

> Aurora automatically adds `https://` if you omit the protocol — but use `http://` explicitly for localhost addresses.

---

## After Generation

The generated test is saved automatically as a **Test Spec** with status `ready`. From there you can:

- **Run it immediately** from the Test Generator view
- **Open it in Test Packs** to add it to a pack, edit the code, or re-generate
- **Promote to Synthetic Monitoring** once it passes consistently

---

## Auto-Healing (AI only)

If a generated test fails, Aurora can **auto-heal** it — the AI analyses the error and rewrites the failing step with more robust selectors or corrected logic. This requires an AI provider to be configured.

You can trigger healing manually from the Bug Reports view or the test spec detail panel.
