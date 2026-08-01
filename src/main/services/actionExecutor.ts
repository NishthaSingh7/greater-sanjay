import {
  Button,
  Key,
  keyboard,
  mouse,
  Point,
  straightTo,
} from '@nut-tree-fork/nut-js';
import type { AgentAction } from '../../shared/types/actions';
import { normalizeAction } from '../../shared/types/actionNormalize';
import type { ScreenshotMeta } from '../../shared/types/task';
import { shouldPrepareChromeAddressBar } from '../llm/taskPlaybooks';
import { mapCoordinates } from './screenshot';

export interface ExecuteContext {
  task?: string;
  history?: AgentAction[];
}

const KEY_MAP: Record<string, Key> = {
  Enter: Key.Enter,
  Return: Key.Enter,
  Tab: Key.Tab,
  Escape: Key.Escape,
  Esc: Key.Escape,
  Backspace: Key.Backspace,
  Delete: Key.Delete,
  Space: Key.Space,
  Up: Key.Up,
  Down: Key.Down,
  Left: Key.Left,
  Right: Key.Right,
  Meta: Key.LeftSuper,
  Command: Key.LeftSuper,
  Cmd: Key.LeftSuper,
  Control: Key.LeftControl,
  Ctrl: Key.LeftControl,
  Alt: Key.LeftAlt,
  Option: Key.LeftAlt,
  Shift: Key.LeftShift,
};

function resolveKey(name: string): Key {
  if (/^\s+$/.test(name)) {
    return Key.Space;
  }

  const trimmed = name.trim();
  const mapped =
    KEY_MAP[trimmed] ??
    KEY_MAP[trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase()];

  if (mapped !== undefined) {
    return mapped;
  }

  if (trimmed.length === 1) {
    const upper = trimmed.toUpperCase();
    if (upper >= 'A' && upper <= 'Z') {
      const letterKey = Key[upper as keyof typeof Key];
      if (typeof letterKey === 'number') {
        return letterKey;
      }
    }

    if (upper >= '0' && upper <= '9') {
      const digitKey = Key[`Num${upper}` as keyof typeof Key];
      if (typeof digitKey === 'number') {
        return digitKey;
      }
    }
  }

  throw new Error(`Unsupported key: ${name}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pressKeyCombo(names: string[]): Promise<void> {
  const keys = names.map(resolveKey);
  if (keys.length === 1) {
    await keyboard.pressKey(keys[0]);
    await sleep(25);
    await keyboard.releaseKey(keys[0]);
    return;
  }

  const modifiers = keys.slice(0, -1);
  const mainKey = keys[keys.length - 1];

  for (const key of modifiers) {
    await keyboard.pressKey(key);
    await sleep(15);
  }
  await keyboard.pressKey(mainKey);
  await sleep(30);
  await keyboard.releaseKey(mainKey);
  await sleep(15);
  for (const key of [...modifiers].reverse()) {
    await keyboard.releaseKey(key);
    await sleep(10);
  }
}

async function prepareChromeAddressBar(fresh = false): Promise<void> {
  if (fresh) {
    await pressKeyCombo(['Escape']);
    await sleep(60);
    await pressKeyCombo(['Escape']);
    await sleep(60);
  }
  await pressKeyCombo(['Meta', 'l']);
  await sleep(100);
  await pressKeyCombo(['Meta', 'a']);
  await sleep(70);
}

export async function executeAction(
  action: AgentAction,
  screenshotMeta: ScreenshotMeta,
  context: ExecuteContext = {}
): Promise<string> {
  const task = context.task ?? '';
  const history = context.history ?? [];
  const normalized = normalizeAction(action, task);

  switch (normalized.type) {
    case 'click': {
      const { x, y } = mapCoordinates(normalized.x, normalized.y, screenshotMeta);
      await mouse.move(straightTo(new Point(Math.round(x), Math.round(y))));
      const button = normalized.button === 'right' ? Button.RIGHT : Button.LEFT;
      const clicks = normalized.clicks ?? 1;
      for (let i = 0; i < clicks; i += 1) {
        await mouse.click(button);
        if (i < clicks - 1) {
          await sleep(70);
        }
      }
      const clickLabel = clicks > 1 ? `${clicks}x ` : '';
      return `Clicked ${clickLabel}${normalized.button ?? 'left'} at (${Math.round(x)}, ${Math.round(y)})`;
    }
    case 'move': {
      const { x, y } = mapCoordinates(normalized.x, normalized.y, screenshotMeta);
      await mouse.move(straightTo(new Point(Math.round(x), Math.round(y))));
      return `Moved to (${Math.round(x)}, ${Math.round(y)})`;
    }
    case 'type': {
      const text = normalized.text.trim();
      if (text.startsWith('{') && text.includes('"type"')) {
        throw new Error('Refusing to type JSON/commands into the UI — vision must use key/click actions');
      }

      const freshNav = shouldPrepareChromeAddressBar(normalized, task, history);
      if (freshNav) {
        await prepareChromeAddressBar(true);
      }
      await keyboard.type(normalized.text);
      if (freshNav) {
        return `Cleared address bar and typed "${normalized.text}"`;
      }
      return `Typed "${normalized.text}"`;
    }
    case 'key': {
      const keys = normalized.keys.map(resolveKey);
      if (keys.length === 1) {
        await keyboard.pressKey(keys[0]);
        await sleep(25);
        await keyboard.releaseKey(keys[0]);
      } else {
        const modifiers = keys.slice(0, -1);
        const mainKey = keys[keys.length - 1];

        for (const key of modifiers) {
          await keyboard.pressKey(key);
          await sleep(15);
        }
        await keyboard.pressKey(mainKey);
        await sleep(30);
        await keyboard.releaseKey(mainKey);
        await sleep(15);
        for (const key of [...modifiers].reverse()) {
          await keyboard.releaseKey(key);
          await sleep(10);
        }
      }
      return `Dispatched keys: ${normalized.keys.join('+')} (not verified yet)`;
    }
    case 'wait': {
      await sleep(normalized.ms);
      return `Waited ${normalized.ms}ms`;
    }
    case 'done': {
      return normalized.reason;
    }
    default: {
      const _exhaustive: never = normalized;
      throw new Error(`Unknown action type: ${(_exhaustive as AgentAction).type}`);
    }
  }
}
