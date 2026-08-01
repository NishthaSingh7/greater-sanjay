import type { BrowserWindow } from 'electron';
import type { AgentAction } from '../../shared/types/actions';
import { IPC_CHANNELS } from '../../shared/types/ipc';
import type { ActionLogEntry, LoopState, ScreenshotPayload } from '../../shared/types/task';
import { OllamaClient } from '../llm/ollamaClient';
import { fallbackPlan } from '../llm/taskPlanner';
import { canAcceptVerification } from '../llm/taskCompletion';
import {
  drainForcedActions,
  getForcedActionDelay,
  isInAppPhase,
  resolveForcedAction,
  resolveLaunchApp,
  sanitizeMisguidedTypeAction,
  shouldSkipVerification,
} from '../llm/taskPlaybooks';
import {
  activateTargetApp,
  prepareAgentDesktop,
  prepareDesktopForAction,
  waitForAppLaunch,
  waitForUiUpdate,
  withDesktopFocus,
} from './desktopFocus';
import { executeAction } from './actionExecutor';
import { assertPermissions } from './permissions';
import {
  captureAgentScreenshot,
  toPayload,
  type ScreenshotCapture,
} from './screenshot';
import { loadSettings } from './settings';

/**
 * Core feedback loop:
 *   FAST forced actions (Spotlight, Spotify search, URLs) → OBSERVE → VISION → ACT → repeat
 */
export class ControlLoop {
  private state: LoopState = {
    status: 'idle',
    task: '',
    iteration: 0,
    maxIterations: 35,
    taskTimeoutMs: 60_000,
    actionHistory: [],
  };

  private stopRequested = false;
  private running = false;
  private window: BrowserWindow | null = null;
  private agent: OllamaClient;
  private keepAppVisible = true;
  private wasInAppPhase = false;
  private taskStartedAt = 0;

  constructor() {
    const settings = loadSettings();
    this.agent = new OllamaClient(
      settings.ollamaEndpoint,
      settings.model,
      settings.reasoningModel
    );
    this.keepAppVisible = settings.keepAppVisible;
  }

  setWindow(window: BrowserWindow): void {
    this.window = window;
  }

  getState(): LoopState {
    const elapsedMs = this.taskStartedAt ? Date.now() - this.taskStartedAt : 0;
    return {
      ...this.state,
      elapsedMs,
      actionHistory: [...this.state.actionHistory],
    };
  }

  refreshSettings(): void {
    const settings = loadSettings();
    this.agent.updateConfig(settings.ollamaEndpoint, settings.model, settings.reasoningModel);
    this.keepAppVisible = settings.keepAppVisible;
  }

  async start(task: string, maxIterations?: number): Promise<{ ok: boolean; error?: string }> {
    if (this.running) {
      return { ok: false, error: 'A task is already running.' };
    }

    this.refreshSettings();
    const settings = loadSettings();

    try {
      assertPermissions();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, error: message };
    }

    if (!this.agent.isConfigured()) {
      return { ok: false, error: 'Configure Ollama endpoint and models in Settings.' };
    }

    if (!settings.model.trim()) {
      return { ok: false, error: 'No vision model configured in Settings.' };
    }

    this.running = true;
    this.stopRequested = false;
    this.wasInAppPhase = false;
    this.taskStartedAt = Date.now();
    if (this.window) {
      await prepareAgentDesktop(this.window);
    }
    this.state = {
      status: 'running',
      task,
      iteration: 0,
      maxIterations: maxIterations ?? settings.maxIterations,
      taskTimeoutMs: settings.taskTimeoutMs,
      actionHistory: [],
    };
    this.emitStatus();

    void this.runLoop();

    return { ok: true };
  }

  stop(): void {
    this.stopRequested = true;
  }

  private isTimedOut(): boolean {
    return Date.now() - this.taskStartedAt >= this.state.taskTimeoutMs;
  }

  private async captureFresh(label: ScreenshotPayload['label']): Promise<ScreenshotCapture> {
    const capture = await captureAgentScreenshot(this.window, this.keepAppVisible);
    this.emitScreenshot(toPayload(capture, label, { iteration: this.state.iteration }));
    return capture;
  }

  private async runLoop(): Promise<void> {
    const recentActions: AgentAction[] = [];

    try {
      this.setStatus('planning');
      const plan = fallbackPlan(this.state.task);
      this.state.plan = plan;
      this.emitStatus();

      while (
        !this.stopRequested &&
        this.state.iteration < this.state.maxIterations &&
        !this.isTimedOut()
      ) {
        this.state.iteration += 1;

        const inApp = isInAppPhase(this.state.task, recentActions);
        if (inApp && !this.wasInAppPhase) {
          const app = resolveLaunchApp(this.state.task);
          if (app) {
            await activateTargetApp(this.state.task);
          }
          await waitForAppLaunch();
          this.wasInAppPhase = true;
        }

        const forcedBatch = drainForcedActions(this.state.task, recentActions);
        if (forcedBatch.length > 0) {
          await this.executeActionBatch(forcedBatch, recentActions, inApp);
          continue;
        }

        if (this.isTimedOut()) {
          break;
        }

        this.setStatus('capturing');
        const observeCapture = await this.captureFresh('live');
        await this.decideAndAct(observeCapture, recentActions, inApp);
      }

      if (this.stopRequested) {
        this.state.status = 'stopped';
        this.emitStatus();
      } else if (this.isTimedOut() && this.state.status !== 'complete') {
        this.state.status = 'timed_out';
        const limitSec = Math.round(this.state.taskTimeoutMs / 1000);
        this.emitComplete(`Task not completed within ${limitSec}s`);
        this.emitStatus();
      } else if (this.state.status !== 'complete') {
        this.state.status = 'complete';
        this.emitComplete(`Reached max iterations (${this.state.maxIterations})`);
        this.emitStatus();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.state.status = 'error';
      this.state.error = message;
      this.emitStatus();
      this.emitError(message);
    } finally {
      this.running = false;
      this.wasInAppPhase = false;
      this.taskStartedAt = 0;

      if (
        this.state.status === 'running' ||
        this.state.status === 'planning' ||
        this.state.status === 'executing' ||
        this.state.status === 'analyzing' ||
        this.state.status === 'capturing'
      ) {
        this.state.status = 'idle';
        this.emitStatus();
      }
    }
  }

  private async executeActionBatch(
    actions: AgentAction[],
    recentActions: AgentAction[],
    inApp: boolean
  ): Promise<void> {
    for (const action of actions) {
      if (this.stopRequested || this.isTimedOut()) {
        return;
      }

      this.setStatus('executing');
      await prepareDesktopForAction(this.state.task);

      let message = '';
      await withDesktopFocus(this.window, async () => {
        message = await executeAction(action, { imageWidth: 0, imageHeight: 0, displayWidth: 0, displayHeight: 0, scaleFactor: 1 }, {
          task: this.state.task,
          history: recentActions,
        });
      });

      await waitForUiUpdate(this.state.task, getForcedActionDelay(action));
      recentActions.push(action);
      this.logAction(action, 'dispatched', message);

      if (this.state.plan) {
        this.state.plan = {
          ...this.state.plan,
          steps: this.state.plan.steps.map((step, index) => ({
            ...step,
            status: index === 0 ? 'done' : index === 1 && inApp ? 'in_progress' : step.status,
          })),
        };
      }
    }

    this.setStatus('running');
  }

  private async decideAndAct(
    observeCapture: ScreenshotCapture,
    recentActions: AgentAction[],
    inApp: boolean
  ): Promise<void> {
    this.setStatus('analyzing');
    const forced = resolveForcedAction(this.state.task, recentActions);
    const rawAction =
      forced ??
      (await this.agent.analyzeScreenshot(
        observeCapture,
        this.state.task,
        recentActions,
        this.state.plan,
        inApp
      ));
    const action = sanitizeMisguidedTypeAction(this.state.task, rawAction);

    this.setStatus('executing');
    await prepareDesktopForAction(this.state.task);

    let message = '';
    await withDesktopFocus(this.window, async () => {
      message = await executeAction(action, observeCapture, {
        task: this.state.task,
        history: recentActions,
      });
    });

    await waitForUiUpdate(this.state.task);

    recentActions.push(action);

    this.setStatus('capturing');
    const afterCapture = await this.captureFresh(inApp ? 'after' : 'live');

    if (inApp && !shouldSkipVerification(action, this.state.task, recentActions)) {
      this.setStatus('analyzing');
      try {
        const verification = await this.agent.verifyAfterAction(
          afterCapture,
          this.state.task,
          action,
          recentActions.slice(0, -1),
          this.state.plan
        );

        if (verification.type === 'done') {
          const acceptance = canAcceptVerification(
            this.state.task,
            recentActions,
            verification.reason,
            this.state.plan
          );
          if (!acceptance.accepted) {
            this.logAction(
              action,
              'unverified',
              `Rejected false success: ${acceptance.rejectReason}`
            );
            this.setStatus('running');
            return;
          }

          this.emitScreenshot(
            toPayload(afterCapture, 'verified', { iteration: this.state.iteration })
          );
          this.logAction(action, 'success', `Verified on screen: ${verification.reason}`);
          this.state.status = 'complete';
          this.emitStatus();
          this.emitComplete(verification.reason, true);
          this.stopRequested = true;
          return;
        }
        this.logAction(action, 'unverified', 'Goal not complete yet — continuing');
      } catch (verifyError) {
        const verifyMessage =
          verifyError instanceof Error ? verifyError.message : String(verifyError);
        this.logAction(action, 'unverified', `Verify continue (${verifyMessage})`);
      }
    } else {
      this.logAction(action, 'dispatched', message);
    }

    this.setStatus('running');
  }

  private setStatus(status: LoopState['status']): void {
    this.state.status = status;
    this.emitStatus();
  }

  private logAction(
    action: AgentAction,
    result: ActionLogEntry['result'],
    message?: string
  ): void {
    const entry: ActionLogEntry = {
      iteration: this.state.iteration,
      timestamp: Date.now(),
      action,
      result,
      message,
    };
    this.state.actionHistory.push(entry);
    this.window?.webContents.send(IPC_CHANNELS.LOOP_ACTION, {
      iteration: entry.iteration,
      action: entry.action,
      result: entry.result,
      message: entry.message,
    });
  }

  private emitStatus(): void {
    this.window?.webContents.send(IPC_CHANNELS.LOOP_STATUS, this.getState());
  }

  private emitScreenshot(payload: ReturnType<typeof toPayload>): void {
    this.window?.webContents.send(IPC_CHANNELS.LOOP_SCREENSHOT, payload);
  }

  private emitComplete(reason: string, success = false): void {
    this.window?.webContents.send(IPC_CHANNELS.LOOP_COMPLETE, {
      reason,
      iterations: this.state.iteration,
      success,
    });
  }

  private emitError(message: string): void {
    this.window?.webContents.send(IPC_CHANNELS.LOOP_ERROR, {
      message,
      iteration: this.state.iteration,
    });
  }
}
