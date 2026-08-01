import type { LoopActionEvent, LoopCompleteEvent, LoopErrorEvent, StartTaskPayload } from './ipc';
import type { AppSettings, LoopState, PermissionStatus, ScreenshotPayload } from './task';

export interface ElectronAPI {
  startTask: (payload: StartTaskPayload) => Promise<{ ok: boolean; error?: string }>;
  stopTask: () => Promise<void>;
  getLoopState: () => Promise<LoopState>;
  captureScreenshot: () => Promise<ScreenshotPayload>;
  getPermissions: () => Promise<PermissionStatus>;
  openAccessibilitySettings: () => Promise<void>;
  openScreenRecordingSettings: () => Promise<void>;
  getSettings: () => Promise<AppSettings>;
  saveSettings: (settings: AppSettings) => Promise<void>;
  onLoopStatus: (callback: (state: LoopState) => void) => () => void;
  onLoopScreenshot: (callback: (payload: ScreenshotPayload) => void) => () => void;
  onLoopAction: (callback: (event: LoopActionEvent) => void) => () => void;
  onLoopComplete: (callback: (event: LoopCompleteEvent) => void) => () => void;
  onLoopError: (callback: (event: LoopErrorEvent) => void) => () => void;
}
