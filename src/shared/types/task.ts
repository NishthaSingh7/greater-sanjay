import type { AgentAction } from './actions';

export type LoopStatus =
  | 'idle'
  | 'planning'
  | 'running'
  | 'capturing'
  | 'analyzing'
  | 'executing'
  | 'complete'
  | 'timed_out'
  | 'error'
  | 'stopped';

export type PlanStepStatus = 'pending' | 'in_progress' | 'done';

export interface TaskPlanStep {
  id: number;
  description: string;
  status: PlanStepStatus;
}

export interface TaskPlan {
  goal: string;
  steps: TaskPlanStep[];
  source: 'llm' | 'fallback';
}

export interface ScreenshotMeta {
  imageWidth: number;
  imageHeight: number;
  displayWidth: number;
  displayHeight: number;
  scaleFactor: number;
}

export interface ScreenshotPayload extends ScreenshotMeta {
  dataUrl: string;
  label?: 'before' | 'after' | 'verified' | 'live';
  iteration?: number;
  capturedAt?: number;
}

export interface ActionLogEntry {
  iteration: number;
  timestamp: number;
  action: AgentAction;
  result: 'success' | 'error' | 'dispatched' | 'unverified';
  message?: string;
}

export interface LoopState {
  status: LoopStatus;
  task: string;
  plan?: TaskPlan;
  iteration: number;
  maxIterations: number;
  taskTimeoutMs: number;
  elapsedMs?: number;
  actionHistory: ActionLogEntry[];
  error?: string;
}

export interface AppSettings {
  ollamaEndpoint: string;
  /** Vision model for screenshots */
  model: string;
  /** Text model for planning */
  reasoningModel: string;
  visualTokenBudget: number;
  maxIterations: number;
  /** Task time limit in milliseconds (default 60s) */
  taskTimeoutMs: number;
  keepAppVisible: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  ollamaEndpoint: 'http://127.0.0.1:11434',
  model: 'qwen2.5vl:7b',
  reasoningModel: 'deepseek-r1:8b',
  visualTokenBudget: 280,
  maxIterations: 35,
  taskTimeoutMs: 60_000,
  keepAppVisible: true,
};

export interface PermissionStatus {
  accessibility: boolean;
  screenRecording: boolean;
}
