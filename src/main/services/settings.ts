import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import type { AppSettings } from '../../shared/types/task';
import { DEFAULT_SETTINGS } from '../../shared/types/task';

interface StoredSettings {
  apiKeys?: string[];
  encryptedApiKeys?: string;
  model?: string;
  ollamaEndpoint?: string;
  reasoningModel?: string;
  visualTokenBudget?: number;
  maxIterations?: number;
  taskTimeoutMs?: number;
  taskHardTimeoutMs?: number;
  keepAppVisible?: boolean;
}

const CLOUD_MODELS = new Set([
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash',
  'gemini-1.5-pro',
  'gemma-3-4b-it',
  'gemma-3-27b-it',
  'gemma-3-12b-it',
  'gemma-3-1b-it',
]);

function normalizeVisionModel(model?: string): string {
  const value = model?.trim();
  if (!value || CLOUD_MODELS.has(value)) {
    return DEFAULT_SETTINGS.model;
  }
  return value;
}

function normalizeReasoningModel(model?: string): string {
  const value = model?.trim();
  if (!value || CLOUD_MODELS.has(value)) {
    return DEFAULT_SETTINGS.reasoningModel;
  }
  return value;
}

function migrateSettings(raw: StoredSettings): AppSettings {
  return {
    ollamaEndpoint: raw.ollamaEndpoint?.trim() || DEFAULT_SETTINGS.ollamaEndpoint,
    model: normalizeVisionModel(raw.model),
    reasoningModel: normalizeReasoningModel(raw.reasoningModel),
    visualTokenBudget: raw.visualTokenBudget ?? DEFAULT_SETTINGS.visualTokenBudget,
    maxIterations: raw.maxIterations ?? DEFAULT_SETTINGS.maxIterations,
    taskTimeoutMs: raw.taskTimeoutMs ?? DEFAULT_SETTINGS.taskTimeoutMs,
    keepAppVisible: raw.keepAppVisible ?? DEFAULT_SETTINGS.keepAppVisible,
  };
}

function settingsChanged(before: StoredSettings, after: AppSettings): boolean {
  return (
    (before.ollamaEndpoint?.trim() || DEFAULT_SETTINGS.ollamaEndpoint) !== after.ollamaEndpoint ||
    normalizeVisionModel(before.model) !== after.model ||
    normalizeReasoningModel(before.reasoningModel) !== after.reasoningModel ||
    (before.visualTokenBudget ?? DEFAULT_SETTINGS.visualTokenBudget) !== after.visualTokenBudget ||
    (before.maxIterations ?? DEFAULT_SETTINGS.maxIterations) !== after.maxIterations ||
    (before.taskTimeoutMs ?? DEFAULT_SETTINGS.taskTimeoutMs) !== after.taskTimeoutMs ||
    (before.keepAppVisible ?? DEFAULT_SETTINGS.keepAppVisible) !== after.keepAppVisible ||
    Boolean(before.apiKeys?.length) ||
    Boolean(before.encryptedApiKeys) ||
    Boolean(before.taskHardTimeoutMs)
  );
}

function getSettingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json');
}

export function loadSettings(): AppSettings {
  const filePath = getSettingsPath();

  if (!fs.existsSync(filePath)) {
    return { ...DEFAULT_SETTINGS };
  }

  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as StoredSettings;
    const settings = migrateSettings(raw);

    if (settingsChanged(raw, settings)) {
      saveSettings(settings);
    }

    return settings;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: AppSettings): void {
  const filePath = getSettingsPath();
  const stored: StoredSettings = {
    ollamaEndpoint: settings.ollamaEndpoint.trim() || DEFAULT_SETTINGS.ollamaEndpoint,
    model: settings.model.trim() || DEFAULT_SETTINGS.model,
    reasoningModel: settings.reasoningModel.trim() || DEFAULT_SETTINGS.reasoningModel,
    visualTokenBudget: settings.visualTokenBudget,
    maxIterations: settings.maxIterations,
    taskTimeoutMs: settings.taskTimeoutMs,
    keepAppVisible: settings.keepAppVisible,
  };

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(stored, null, 2), 'utf8');
}
