import type { AgentAction } from './actions';
import type {
  AppSettings,
  LoopState,
  PermissionStatus,
  ScreenshotPayload,
} from './task';

export const IPC_CHANNELS = {
  LOOP_START: 'loop:start',
  LOOP_STOP: 'loop:stop',
  LOOP_GET_STATE: 'loop:getState',
  LOOP_STATUS: 'loop:status',
  LOOP_SCREENSHOT: 'loop:screenshot',
  LOOP_ACTION: 'loop:action',
  LOOP_COMPLETE: 'loop:complete',
  LOOP_ERROR: 'loop:error',

  PERMISSIONS_GET: 'permissions:get',
  PERMISSIONS_OPEN_ACCESSIBILITY: 'permissions:openAccessibility',
  PERMISSIONS_OPEN_SCREEN: 'permissions:openScreen',

  SETTINGS_GET: 'settings:get',
  SETTINGS_SAVE: 'settings:save',

  SCREENSHOT_CAPTURE: 'screenshot:capture',
} as const;

export interface StartTaskPayload {
  task: string;
  maxIterations?: number;
}

export interface LoopActionEvent {
  iteration: number;
  action: AgentAction;
  result: 'success' | 'error' | 'dispatched' | 'unverified';
  message?: string;
}

export interface LoopCompleteEvent {
  reason: string;
  iterations: number;
  /** True when the task goal was verified on screen */
  success?: boolean;
}

export interface LoopErrorEvent {
  message: string;
  iteration?: number;
}

export type IpcInvokeMap = {
  [IPC_CHANNELS.LOOP_START]: (payload: StartTaskPayload) => Promise<{ ok: boolean; error?: string }>;
  [IPC_CHANNELS.LOOP_STOP]: () => Promise<void>;
  [IPC_CHANNELS.LOOP_GET_STATE]: () => Promise<LoopState>;
  [IPC_CHANNELS.PERMISSIONS_GET]: () => Promise<PermissionStatus>;
  [IPC_CHANNELS.PERMISSIONS_OPEN_ACCESSIBILITY]: () => Promise<void>;
  [IPC_CHANNELS.PERMISSIONS_OPEN_SCREEN]: () => Promise<void>;
  [IPC_CHANNELS.SETTINGS_GET]: () => Promise<AppSettings>;
  [IPC_CHANNELS.SETTINGS_SAVE]: (settings: AppSettings) => Promise<void>;
  [IPC_CHANNELS.SCREENSHOT_CAPTURE]: () => Promise<ScreenshotPayload>;
};

export type IpcEventMap = {
  [IPC_CHANNELS.LOOP_STATUS]: LoopState;
  [IPC_CHANNELS.LOOP_SCREENSHOT]: ScreenshotPayload;
  [IPC_CHANNELS.LOOP_ACTION]: LoopActionEvent;
  [IPC_CHANNELS.LOOP_COMPLETE]: LoopCompleteEvent;
  [IPC_CHANNELS.LOOP_ERROR]: LoopErrorEvent;
};
