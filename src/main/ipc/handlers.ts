import { ipcMain, type BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../shared/types/ipc';
import type { AppSettings } from '../../shared/types/task';
import { ControlLoop } from '../services/controlLoop';
import {
  getPermissionStatus,
  openAccessibilitySettings,
  openScreenRecordingSettings,
  requestAccessibilityPermission,
} from '../services/permissions';
import { captureAgentScreenshot, toPayload } from '../services/screenshot';
import { loadSettings, saveSettings } from '../services/settings';

let controlLoop: ControlLoop | null = null;
let handlersRegistered = false;

function getControlLoop(): ControlLoop {
  if (!controlLoop) {
    controlLoop = new ControlLoop();
  }
  return controlLoop;
}

export function registerIpcHandlers(getWindow: () => BrowserWindow | null): void {
  if (handlersRegistered) {
    const win = getWindow();
    if (win) {
      getControlLoop().setWindow(win);
    }
    return;
  }

  handlersRegistered = true;
  const win = getWindow();
  if (win) {
    getControlLoop().setWindow(win);
  }

  ipcMain.handle(IPC_CHANNELS.LOOP_START, async (_event, payload) => {
    const win = getWindow();
    if (win) {
      getControlLoop().setWindow(win);
    }
    return getControlLoop().start(payload.task, payload.maxIterations);
  });

  ipcMain.handle(IPC_CHANNELS.LOOP_STOP, async () => {
    getControlLoop().stop();
  });

  ipcMain.handle(IPC_CHANNELS.LOOP_GET_STATE, async () => {
    return getControlLoop().getState();
  });

  ipcMain.handle(IPC_CHANNELS.PERMISSIONS_GET, async () => {
    requestAccessibilityPermission();
    return getPermissionStatus();
  });

  ipcMain.handle(IPC_CHANNELS.PERMISSIONS_OPEN_ACCESSIBILITY, async () => {
    openAccessibilitySettings();
  });

  ipcMain.handle(IPC_CHANNELS.PERMISSIONS_OPEN_SCREEN, async () => {
    openScreenRecordingSettings();
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, async () => {
    return loadSettings();
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS_SAVE, async (_event, settings: AppSettings) => {
    saveSettings(settings);
    getControlLoop().refreshSettings();
  });

  ipcMain.handle(IPC_CHANNELS.SCREENSHOT_CAPTURE, async () => {
    const win = getWindow();
    const settings = loadSettings();
    const capture = await captureAgentScreenshot(win, settings.keepAppVisible);
    return toPayload(capture, 'live');
  });
}

export function attachWindow(window: BrowserWindow): void {
  getControlLoop().setWindow(window);
}
