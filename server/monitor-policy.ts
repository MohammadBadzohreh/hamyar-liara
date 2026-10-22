export type MonitorState = { failures: number; lastIncident: number; busy: boolean };
export function recordHealth(state: MonitorState, healthy: boolean) {
  state.failures = healthy ? 0 : state.failures + 1;
}
export function claimIncident(state: MonitorState, now: number) {
  if (state.failures < 3 || (state.lastIncident > 0 && now - state.lastIncident < 600000)) return false;
  state.lastIncident = now;
  return true;
}
