// "Spec" is a Playwright/Jest-ism (the .spec.ts file convention) that users rarely say day
// to day, so UI copy calls a generated test a "Script". Every test runs on Playwright;
// the engine argument is kept so existing call sites stay unchanged.

export function engineName(_engine) {
  return 'Playwright'
}

export function specLabel(_engine, { plural = false, lower = false } = {}) {
  const term = lower ? 'script' : 'Script'
  return plural ? `${term}s` : term
}
