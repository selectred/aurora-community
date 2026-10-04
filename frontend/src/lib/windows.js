// Opens the dedicated Tauri "generator" window (a separate native window, not just
// a route change within the current window) — falls back to a plain route push when
// running outside Tauri (browser dev mode), where there is no separate window to show.
export async function openGeneratorWindow(router) {
  if (!window.__TAURI__) {
    router.push('/testing/generator')
    return
  }
  const { Window } = await import('@tauri-apps/api/window')
  const win = await Window.getByLabel('generator')
  if (win) {
    await win.show()
    await win.setFocus()
  }
}
