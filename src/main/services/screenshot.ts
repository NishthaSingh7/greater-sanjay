import type { BrowserWindow } from 'electron';
import { execFile } from 'child_process';
import { desktopCapturer, nativeImage, screen } from 'electron';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';
import type { ScreenshotMeta, ScreenshotPayload } from '../../shared/types/task';
import { prepareAgentDesktop } from './desktopFocus';

const execFileAsync = promisify(execFile);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface ScreenshotCapture extends ScreenshotMeta {
  buffer: Buffer;
}

async function captureMacScreen(): Promise<Buffer> {
  const tmpFile = path.join(os.tmpdir(), `gs-capture-${Date.now()}.png`);
  await execFileAsync('screencapture', ['-x', tmpFile]);
  try {
    return fs.readFileSync(tmpFile);
  } finally {
    fs.unlinkSync(tmpFile);
  }
}

export async function captureScreenshot(): Promise<ScreenshotCapture> {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: displayWidth, height: displayHeight } = primaryDisplay.size;
  const scaleFactor = primaryDisplay.scaleFactor;

  let buffer: Buffer;
  let imageWidth: number;
  let imageHeight: number;

  if (process.platform === 'darwin') {
    buffer = await captureMacScreen();
    const image = nativeImage.createFromBuffer(buffer);
    const size = image.getSize();
    imageWidth = size.width;
    imageHeight = size.height;
  } else {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: {
        width: Math.round(displayWidth * scaleFactor),
        height: Math.round(displayHeight * scaleFactor),
      },
    });

    const source = sources[0];
    if (!source) {
      throw new Error('No screen source available. Grant Screen Recording permission.');
    }

    const image = source.thumbnail;
    const imageSize = image.getSize();
    buffer = image.toPNG();
    imageWidth = imageSize.width;
    imageHeight = imageSize.height;
  }

  return {
    buffer,
    imageWidth,
    imageHeight,
    displayWidth,
    displayHeight,
    scaleFactor,
  };
}

/**
 * Capture the desktop for the agent loop.
 * Hides the Electron window briefly so the screenshot shows the target app,
 * then shows it again WITHOUT stealing focus from the target app.
 */
export async function captureAgentScreenshot(
  window: BrowserWindow | null,
  keepAppVisible: boolean
): Promise<ScreenshotCapture> {
  await prepareAgentDesktop(window);

  if (!keepAppVisible || !window || window.isDestroyed()) {
    return captureScreenshot();
  }

  const wasVisible = window.isVisible();
  if (wasVisible) {
    window.hide();
    await sleep(80);
  }

  try {
    return await captureScreenshot();
  } finally {
    if (wasVisible && !window.isDestroyed()) {
      window.showInactive();
    }
  }
}

export function toPayload(
  capture: ScreenshotCapture,
  label?: ScreenshotPayload['label'],
  meta?: { iteration?: number }
): ScreenshotPayload {
  return {
    dataUrl: `data:image/png;base64,${capture.buffer.toString('base64')}`,
    imageWidth: capture.imageWidth,
    imageHeight: capture.imageHeight,
    displayWidth: capture.displayWidth,
    displayHeight: capture.displayHeight,
    scaleFactor: capture.scaleFactor,
    label,
    iteration: meta?.iteration,
    capturedAt: Date.now(),
  };
}

export function mapCoordinates(
  x: number,
  y: number,
  meta: ScreenshotMeta
): { x: number; y: number } {
  return {
    x: (x / meta.imageWidth) * meta.displayWidth,
    y: (y / meta.imageHeight) * meta.displayHeight,
  };
}
