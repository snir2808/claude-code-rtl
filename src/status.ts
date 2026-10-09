export interface StatusBarState {
  text: string;
  tooltip: string;
}

export function getStatusBarState(label: string, enabled: boolean): StatusBarState {
  return enabled
    ? {
        text: `$(check) ${label}`,
        tooltip: `BiDi ${label} for Claude Code is on — click to turn off`,
      }
    : {
        text: `$(circle-slash) ${label}`,
        tooltip: `BiDi ${label} for Claude Code is off — click to turn on`,
      };
}
