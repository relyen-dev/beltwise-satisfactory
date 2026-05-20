export type WorkbenchPanelId =
  | 'plan'
  | 'objectives'
  | 'recipes'
  | 'inputs'
  | 'resources'
  | 'machines'
  | 'display';

export type WorkbenchFocusMode = 'open-plan' | 'focus-graph';

export interface WorkbenchFocusRequest {
  projectId: string;
  mode: WorkbenchFocusMode;
  sequence: number;
}
