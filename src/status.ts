export interface StatusBarState {
  text: string;
  tooltip: string;
}

export function getStatusBarState(enabled: boolean): StatusBarState {
  return enabled
    ? {
        text: '$(check) RTL',
        tooltip: 'BiDi RTL for Claude Code is on — click to turn off',
      }
    : {
        text: '$(circle-slash) RTL',
        tooltip: 'BiDi RTL for Claude Code is off — click to turn on',
      };
}
