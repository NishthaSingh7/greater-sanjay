import { execFile } from 'child_process';
import { promisify } from 'util';
import type { BrowserWindow } from 'electron';
import { resolveLaunchApp } from '../llm/taskPlaybooks';

const execFileAsync = promisify(execFile);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Close DevTools so keystrokes never land in the console during agent runs. */
export function closeDevTools(window: BrowserWindow | null): void {
  if (!window || window.isDestroyed()) {
    return;
  }

  if (window.webContents.isDevToolsOpened()) {
    window.webContents.closeDevTools();
  }
}

/** Bring the target macOS app to the foreground before in-app actions. */
export async function activateTargetApp(task: string): Promise<void> {
  const appName = resolveLaunchApp(task);
  if (!appName) {
    return;
  }

  try {
    await execFileAsync('osascript', ['-e', `tell application "${appName}" to activate`]);
    await sleep(180);
  } catch {
    // App may not be installed or script may fail — continue with keyboard automation.
  }
}

/** Prepare the agent window so it cannot steal desktop focus. */
export async function prepareAgentDesktop(window: BrowserWindow | null): Promise<void> {
  closeDevTools(window);

  if (window && !window.isDestroyed()) {
    window.blur();
    if (window.isFocused()) {
      window.hide();
      await sleep(40);
      window.showInactive();
    }
  }

  await sleep(25);
}

export async function prepareDesktopForAction(task: string): Promise<void> {
  if (resolveLaunchApp(task)) {
    await activateTargetApp(task);
  }
}

/** Hide the agent window so mouse/keyboard events reach the desktop. */
export async function withDesktopFocus(
  window: BrowserWindow | null,
  fn: () => Promise<void>
): Promise<void> {
  closeDevTools(window);

  const wasVisible = Boolean(window && !window.isDestroyed() && window.isVisible());

  if (window && !window.isDestroyed()) {
    window.blur();
  }

  if (wasVisible && window) {
    window.hide();
    await sleep(120);
  }

  try {
    await fn();
  } finally {
    if (wasVisible && window && !window.isDestroyed()) {
      window.showInactive();
    }
  }
}

export async function waitForUiUpdate(task?: string, ms?: number): Promise<void> {
  if (ms !== undefined) {
    await sleep(ms);
    return;
  }

  const lower = task?.toLowerCase() ?? '';
  const delay =
    lower.includes('chrome') ||
    lower.includes('browser') ||
    lower.includes('youtube') ||
    lower.includes('.com')
      ? 280
      : 140;
  await sleep(delay);
}

/** Extra settle time when an app window first opens. */
export async function waitForAppLaunch(): Promise<void> {
  await sleep(450);
}
