import type { AgentAction } from './actions';

const KEY_ALIASES: Record<string, string> = {
  space: 'Space',
  spacebar: 'Space',
  return: 'Enter',
  esc: 'Escape',
  cmd: 'Meta',
  command: 'Meta',
  ctrl: 'Control',
  control: 'Control',
  alt: 'Alt',
  option: 'Alt',
  shift: 'Shift',
  up: 'Up',
  down: 'Down',
  left: 'Left',
  right: 'Right',
  tab: 'Tab',
  enter: 'Enter',
  backspace: 'Backspace',
  delete: 'Delete',
};

const KNOWN_KEY_NAMES = new Set([
  'Enter', 'Return', 'Tab', 'Escape', 'Esc', 'Backspace', 'Delete', 'Space',
  'Up', 'Down', 'Left', 'Right', 'Meta', 'Command', 'Cmd', 'Control', 'Ctrl',
  'Alt', 'Option', 'Shift',
]);

function normalizeKeyToken(token: string): string {
  if (/^\s+$/.test(token)) {
    return 'Space';
  }

  const trimmed = token.trim();
  if (!trimmed) {
    return 'Space';
  }

  const alias = KEY_ALIASES[trimmed.toLowerCase()];
  if (alias) {
    return alias;
  }

  if (KNOWN_KEY_NAMES.has(trimmed)) {
    return trimmed;
  }

  const title =
    trimmed.length > 1
      ? trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase()
      : trimmed.toUpperCase();

  if (KNOWN_KEY_NAMES.has(title)) {
    return title;
  }

  if (trimmed.length === 1 && /[a-z]/.test(trimmed)) {
    return trimmed.toUpperCase();
  }

  return trimmed;
}

/**
 * Repair common LLM mistakes: URLs/words in key actions → type;
 * whitespace/aliases in keys → canonical key names.
 */
export function normalizeAction(action: AgentAction, _task?: string): AgentAction {
  if (action.type !== 'key') {
    return action;
  }

  const normalizedKeys = action.keys.map(normalizeKeyToken);
  const misused = normalizedKeys.filter(isMisusedTextInKeys);
  if (misused.length > 0) {
    return { type: 'type', text: misused.join('') };
  }

  return { type: 'key', keys: normalizedKeys };
}

export function isKnownKeyToken(token: string): boolean {
  const normalized = normalizeKeyToken(token);
  if (KNOWN_KEY_NAMES.has(normalized)) return true;
  if (normalized.length === 1 && /[a-zA-Z0-9]/.test(normalized)) return true;
  return false;
}

export function isMisusedTextInKeys(token: string): boolean {
  if (isKnownKeyToken(token)) return false;
  const trimmed = token.trim();
  if (!trimmed) return false;
  if (trimmed.length > 1) return true;
  return /[./:?=&]/.test(trimmed);
}
