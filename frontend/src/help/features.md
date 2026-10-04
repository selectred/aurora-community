# Features & Products

In Aurora, a **Feature** (or Product) represents what you are testing — a mobile app, a website, a microservice, a checkout flow, or any product area you want to track separately.

Features are the organisational anchor that links your tests, initiatives, and synthetic monitors together.

---

## Creating a Feature

1. Go to **Settings → Features**
2. Click **New Feature**
3. Enter a **Feature Name** — keep it short and descriptive (e.g. "Mobile App", "Checkout API", "User Auth")
4. Add an optional **Description** explaining what this feature covers
5. Choose a **Colour** — this appears as a colour-coded dot and avatar throughout the app
6. Click **Create**

---

## Editing a Feature

Click the **Edit** button on any feature card to update its name, description, or colour. Changes take effect immediately.

---

## Deleting a Feature

Click the trash icon on the feature card and confirm the deletion.

> **Important:** Deleting a feature removes the association between that feature and any linked tests, initiatives, or synthetic monitors — but it does not delete those records themselves. Historical test results linked to the feature remain in your history.

---

## Feature Colour

Each feature is assigned a colour that appears:

- As a coloured avatar on feature cards
- On initiative cards that are linked to the feature
- In dropdown menus throughout the app for quick visual identification

Available colours: Purple, Green, Orange, Red, Teal, Violet, Deep Orange, Slate.

---

## Pass Rate

Each feature card displays a **Pass Rate** — the percentage of associated tests that are currently passing based on their most recent run. A pass rate below 80% typically warrants investigation.

---

## Linking Features to Other Records

Features can be linked to:

- **Initiatives** — set the Feature field when creating an initiative
- **Test Packs** — optionally assign a pack to a feature for filtering purposes
- **Synthetic Monitors** — associate a monitor with a feature

This linking is what allows the Dashboard timeline filter to work — selecting an initiative on the dashboard shows results scoped to that initiative's feature.
