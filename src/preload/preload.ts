import { contextBridge, ipcRenderer } from 'electron';

const IPC = {
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

const electronAPI = {
  startTask: (payload: { task: string; maxIterations?: number }) =>
    ipcRenderer.invoke(IPC.LOOP_START, payload),

  stopTask: () => ipcRenderer.invoke(IPC.LOOP_STOP),

  getLoopState: () => ipcRenderer.invoke(IPC.LOOP_GET_STATE),

  captureScreenshot: () => ipcRenderer.invoke(IPC.SCREENSHOT_CAPTURE),

  getPermissions: () => ipcRenderer.invoke(IPC.PERMISSIONS_GET),

  openAccessibilitySettings: () => ipcRenderer.invoke(IPC.PERMISSIONS_OPEN_ACCESSIBILITY),

  openScreenRecordingSettings: () => ipcRenderer.invoke(IPC.PERMISSIONS_OPEN_SCREEN),

  getSettings: () => ipcRenderer.invoke(IPC.SETTINGS_GET),

  saveSettings: (settings: unknown) => ipcRenderer.invoke(IPC.SETTINGS_SAVE, settings),

  onLoopStatus: (callback: (state: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: unknown) => callback(state);
    ipcRenderer.on(IPC.LOOP_STATUS, listener);
    return () => ipcRenderer.removeListener(IPC.LOOP_STATUS, listener);
  },

  onLoopScreenshot: (callback: (payload: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => callback(payload);
    ipcRenderer.on(IPC.LOOP_SCREENSHOT, listener);
    return () => ipcRenderer.removeListener(IPC.LOOP_SCREENSHOT, listener);
  },

  onLoopAction: (callback: (event: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: unknown) => callback(data);
    ipcRenderer.on(IPC.LOOP_ACTION, listener);
    return () => ipcRenderer.removeListener(IPC.LOOP_ACTION, listener);
  },

  onLoopComplete: (callback: (event: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: unknown) => callback(data);
    ipcRenderer.on(IPC.LOOP_COMPLETE, listener);
    return () => ipcRenderer.removeListener(IPC.LOOP_COMPLETE, listener);
  },

  onLoopError: (callback: (event: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: unknown) => callback(data);
    ipcRenderer.on(IPC.LOOP_ERROR, listener);
    return () => ipcRenderer.removeListener(IPC.LOOP_ERROR, listener);
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
