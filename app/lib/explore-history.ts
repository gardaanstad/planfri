// The explorer keeps its own history entries next to Next.js's: opening a
// project or profile pushes one, and filters replace the current one.

/**
 * Replaces the URL but keeps this entry's state. Next.js ignores states it
 * wrote itself (and would later restore its own URL), so its marks go.
 */
export function replaceUrl(url: string) {
  const state = { ...window.history.state };
  delete state.__NA;
  delete state._N;
  window.history.replaceState(state, "", url);
}
/**
 * Runs once Next.js has written its state for the history entry stepped to,
 * which it does when the step's navigation commits (or after two seconds).
 */
export function whenNextSettled(run: () => void) {
  const state = window.history.state;
  const start = performance.now();
  const check = () => {
    if (window.history.state !== state || performance.now() - start > 2000)
      run();
    else requestAnimationFrame(check);
  };
  requestAnimationFrame(check);
}
