import type { ElectronAPI } from '../shared/types/electron-api';
import type { LoopActionEvent } from '../shared/types/ipc';
import type { AppSettings, LoopState, PermissionStatus, ScreenshotPayload, TaskPlan } from '../shared/types/task';

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

const api = window.electronAPI;

const elements = {
  loopStatusPill: document.getElementById('loop-status-pill')!,
  taskTimer: document.getElementById('task-timer')!,
  permissionBanner: document.getElementById('permission-banner')!,
  permissionMessage: document.getElementById('permission-message')!,
  openAccessibility: document.getElementById('open-accessibility')!,
  openScreen: document.getElementById('open-screen')!,
  refreshPermissions: document.getElementById('refresh-permissions')!,
  taskInput: document.getElementById('task-input') as HTMLTextAreaElement,
  startBtn: document.getElementById('start-btn') as HTMLButtonElement,
  stopBtn: document.getElementById('stop-btn') as HTMLButtonElement,
  captureBtn: document.getElementById('capture-btn') as HTMLButtonElement,
  taskError: document.getElementById('task-error')!,
  screenshotPreview: document.getElementById('screenshot-preview') as HTMLImageElement,
  screenshotPlaceholder: document.getElementById('screenshot-placeholder')!,
  screenshotMeta: document.getElementById('screenshot-meta')!,
  feedBadge: document.getElementById('feed-badge')!,
  actionLog: document.getElementById('action-log')!,
  ollamaEndpoint: document.getElementById('ollama-endpoint') as HTMLInputElement,
  model: document.getElementById('model') as HTMLInputElement,
  reasoningModel: document.getElementById('reasoning-model') as HTMLInputElement,
  maxIterations: document.getElementById('max-iterations') as HTMLInputElement,
  taskTimeout: document.getElementById('task-timeout') as HTMLInputElement,
  tokenBudget: document.getElementById('token-budget') as HTMLInputElement,
  keepAppVisible: document.getElementById('keep-app-visible') as HTMLInputElement,
  saveSettings: document.getElementById('save-settings') as HTMLButtonElement,
  settingsSaved: document.getElementById('settings-saved')!,
  planPanel: document.getElementById('plan-panel')!,
  planGoal: document.getElementById('plan-goal')!,
  planSteps: document.getElementById('plan-steps')!,
  planSource: document.getElementById('plan-source')!,
};

let timerInterval: ReturnType<typeof setInterval> | null = null;
let timerDeadline = 0;

function clearTaskTimer(): void {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  elements.taskTimer.classList.add('hidden');
  elements.taskTimer.classList.remove('task-timer--urgent');
}

function updateTaskTimerDisplay(): void {
  const remainingMs = Math.max(0, timerDeadline - Date.now());
  const seconds = Math.ceil(remainingMs / 1000);
  elements.taskTimer.textContent = `${seconds}s`;
  elements.taskTimer.classList.toggle('task-timer--urgent', seconds <= 10);
  if (remainingMs <= 0) {
    clearTaskTimer();
  }
}

function startTaskTimer(taskTimeoutMs: number, elapsedMs = 0): void {
  clearTaskTimer();
  timerDeadline = Date.now() + taskTimeoutMs - elapsedMs;
  elements.taskTimer.classList.remove('hidden');
  updateTaskTimerDisplay();
  timerInterval = setInterval(updateTaskTimerDisplay, 200);
}

function updateFeedBadge(status: LoopState['status']): void {
  switch (status) {
    case 'capturing':
      elements.feedBadge.textContent = 'Capturing…';
      break;
    case 'analyzing':
      elements.feedBadge.textContent = 'Analyzing…';
      break;
    case 'executing':
      elements.feedBadge.textContent = 'Executing…';
      break;
    case 'planning':
      elements.feedBadge.textContent = 'Planning…';
      break;
    case 'running':
      elements.feedBadge.textContent = 'Running…';
      break;
    case 'complete':
      elements.feedBadge.textContent = 'Complete';
      break;
    case 'timed_out':
      elements.feedBadge.textContent = 'Timed out';
      break;
    case 'error':
      elements.feedBadge.textContent = 'Error';
      break;
    case 'stopped':
      elements.feedBadge.textContent = 'Stopped';
      break;
    default:
      elements.feedBadge.textContent = 'Idle';
      break;
  }
}

function setStatusPill(status: string): void {
  elements.loopStatusPill.textContent = status;
  elements.loopStatusPill.dataset.status = status.toLowerCase();
}

function showTaskError(message: string): void {
  elements.taskError.textContent = message;
  elements.taskError.classList.toggle('hidden', !message);
}

function updatePermissionBanner(status: PermissionStatus): void {
  const missing: string[] = [];
  if (!status.accessibility) missing.push('Accessibility');
  if (!status.screenRecording) missing.push('Screen Recording');

  if (missing.length === 0) {
    elements.permissionBanner.classList.add('hidden');
    return;
  }

  elements.permissionBanner.classList.remove('hidden');
  elements.permissionMessage.textContent = `Missing: ${missing.join(', ')}. Open System Settings and grant permissions to Greater Sanjay (or your terminal in dev mode).`;
}

function labelForScreenshot(payload: ScreenshotPayload): string {
  switch (payload.label) {
    case 'verified':
      return 'Verified';
    case 'after':
      return 'After action';
    case 'before':
      return 'Before action';
    case 'live':
      return 'Live';
    default:
      return 'Capture';
  }
}

function renderScreenshot(payload: ScreenshotPayload): void {
  elements.screenshotPreview.src = payload.dataUrl;
  elements.screenshotPreview.classList.remove('hidden');

  const label = labelForScreenshot(payload);
  elements.feedBadge.textContent = label;

  const parts = [
    label,
    payload.iteration != null ? `step #${payload.iteration}` : null,
    `${payload.imageWidth}×${payload.imageHeight}px`,
    `display ${payload.displayWidth}×${payload.displayHeight}`,
    `scale ${payload.scaleFactor}x`,
  ].filter(Boolean);

  elements.screenshotMeta.textContent = parts.join(' · ');
}

function appendLogEntry(event: LoopActionEvent): void {
  const placeholder = elements.actionLog.querySelector('.placeholder');
  placeholder?.remove();

  const entry = document.createElement('div');
  entry.className = `log-entry log-entry--${event.result}`;
  const time = new Date().toLocaleTimeString();
  entry.innerHTML = `
    <div class="log-entry__head">
      <span>#${event.iteration} · ${time}</span>
      <span class="log-entry__badge">${event.result}</span>
    </div>
    <pre>${JSON.stringify(event.action, null, 2)}</pre>
    ${event.message ? `<p>${event.message}</p>` : ''}
  `;
  elements.actionLog.prepend(entry);
}

function setRunning(running: boolean): void {
  elements.startBtn.disabled = running;
  elements.stopBtn.disabled = !running;
  elements.taskInput.disabled = running;
}

function readSettingsForm(): AppSettings {
  return {
    ollamaEndpoint: elements.ollamaEndpoint.value.trim() || 'http://127.0.0.1:11434',
    model: elements.model.value.trim() || 'qwen2.5vl:7b',
    reasoningModel: elements.reasoningModel.value.trim() || 'deepseek-r1:8b',
    visualTokenBudget: Number(elements.tokenBudget.value) || 280,
    maxIterations: Number(elements.maxIterations.value) || 35,
    taskTimeoutMs: (Number(elements.taskTimeout.value) || 60) * 1000,
    keepAppVisible: elements.keepAppVisible.checked,
  };
}

function fillSettingsForm(settings: AppSettings): void {
  elements.ollamaEndpoint.value = settings.ollamaEndpoint;
  elements.model.value = settings.model;
  elements.reasoningModel.value = settings.reasoningModel;
  elements.maxIterations.value = String(settings.maxIterations);
  elements.taskTimeout.value = String(Math.round(settings.taskTimeoutMs / 1000));
  elements.tokenBudget.value = String(settings.visualTokenBudget);
  elements.keepAppVisible.checked = settings.keepAppVisible;
}

async function refreshPermissions(): Promise<void> {
  const status = await api.getPermissions();
  updatePermissionBanner(status);
}

async function loadSettings(): Promise<void> {
  const settings = await api.getSettings();
  fillSettingsForm(settings);
}

function renderPlan(plan?: TaskPlan): void {
  if (!plan || plan.steps.length === 0) {
    elements.planPanel.classList.add('hidden');
    return;
  }

  elements.planPanel.classList.remove('hidden');
  elements.planGoal.textContent = plan.goal;
  elements.planSource.textContent = plan.source === 'llm' ? 'AI planned' : 'Template';
  elements.planSource.classList.remove('hidden');

  elements.planSteps.innerHTML = plan.steps
    .map((step) => {
      const statusClass =
        step.status === 'done'
          ? 'plan-step--done'
          : step.status === 'in_progress'
            ? 'plan-step--active'
            : '';
      const icon =
        step.status === 'done' ? '✓' : step.status === 'in_progress' ? '→' : '○';
      return `<li class="plan-step ${statusClass}"><span class="plan-step__icon">${icon}</span><span>${step.description}</span></li>`;
    })
    .join('');
}

function handleLoopState(state: LoopState): void {
  setStatusPill(state.status);
  updateFeedBadge(state.status);
  const running = ['planning', 'running', 'capturing', 'analyzing', 'executing'].includes(
    state.status
  );
  setRunning(running);
  renderPlan(state.plan);

  if (running && state.taskTimeoutMs) {
    if (!timerInterval) {
      const remaining = Math.max(0, state.taskTimeoutMs - (state.elapsedMs ?? 0));
      startTaskTimer(remaining);
    }
  } else if (!running) {
    clearTaskTimer();
  }

  if (state.error) {
    showTaskError(state.error);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await refreshPermissions();

  const initialState = await api.getLoopState();
  handleLoopState(initialState);

  elements.openAccessibility.addEventListener('click', () => api.openAccessibilitySettings());
  elements.openScreen.addEventListener('click', () => api.openScreenRecordingSettings());
  elements.refreshPermissions.addEventListener('click', () => void refreshPermissions());

  elements.startBtn.addEventListener('click', async () => {
    showTaskError('');
    const task = elements.taskInput.value.trim();
    if (!task) {
      showTaskError('Enter a task description.');
      return;
    }

    const settings = readSettingsForm();
    await api.saveSettings(settings);

    const result = await api.startTask({
      task,
      maxIterations: settings.maxIterations,
    });

    if (!result.ok) {
      showTaskError(result.error ?? 'Failed to start task.');
      return;
    }

    elements.actionLog.innerHTML = '';
    elements.planPanel.classList.add('hidden');
    startTaskTimer(settings.taskTimeoutMs);
    setRunning(true);
  });

  elements.stopBtn.addEventListener('click', async () => {
    await api.stopTask();
  });

  elements.captureBtn.addEventListener('click', async () => {
    try {
      const payload = await api.captureScreenshot();
      renderScreenshot(payload);
    } catch (error) {
      showTaskError(error instanceof Error ? error.message : String(error));
    }
  });

  elements.saveSettings.addEventListener('click', async () => {
    await api.saveSettings(readSettingsForm());
    elements.settingsSaved.classList.remove('hidden');
    setTimeout(() => elements.settingsSaved.classList.add('hidden'), 2000);
  });

  api.onLoopStatus(handleLoopState);
  api.onLoopScreenshot(renderScreenshot);
  api.onLoopAction(appendLogEntry);
  api.onLoopComplete((event) => {
    clearTaskTimer();
    const success = event.success === true;
    const timedOut = !success && event.reason.toLowerCase().includes('not completed within');
    setStatusPill(success ? 'complete' : timedOut ? 'timed_out' : 'complete');
    setRunning(false);
    showTaskError(timedOut ? event.reason : success ? '' : event.reason);
    elements.feedBadge.textContent = success ? 'Complete' : timedOut ? 'Timed out' : 'Stopped';
    if (success) {
      elements.loopStatusPill.textContent = 'Complete';
      elements.loopStatusPill.dataset.status = 'complete';
    }
  });
  api.onLoopError((event) => {
    setRunning(false);
    showTaskError(event.message);
    elements.feedBadge.textContent = 'Error';
  });
});
