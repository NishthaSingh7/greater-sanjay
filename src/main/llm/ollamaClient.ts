import type { AgentAction } from '../../shared/types/actions';
import { tryParseAction } from '../../shared/types/actions';
import { normalizeAction } from '../../shared/types/actionNormalize';
import type { TaskPlan } from '../../shared/types/task';
import type { ScreenshotCapture } from '../services/screenshot';
import { parseModelJson } from './jsonRepair';
import {
  buildChromeTabVerifyPrompt,
  buildPostActionVerifyPrompt,
  buildRepairPrompt,
  buildSystemPrompt,
  buildUserPrompt,
  buildVerifySystemPrompt,
} from './prompts';
import {
  buildPlanningSystemPrompt,
  buildPlanningUserPrompt,
  fallbackPlan,
  parsePlanResponse,
} from './taskPlanner';
import { canAcceptVerification, requiredActionsCompleted } from './taskCompletion';
import { isChromeBrowserTask, looksLikeUrl } from './taskPlaybooks';

interface OllamaChatResponse {
  message?: { content?: string };
  error?: string;
}

function normalizeEndpoint(endpoint: string): string {
  return endpoint.trim().replace(/\/+$/, '') || 'http://127.0.0.1:11434';
}

/**
 * Local agent via Ollama:
 * - reasoningModel: planning & step breakdown
 * - visionModel: screenshot → action JSON
 */
export class OllamaClient {
  private endpoint: string;
  private visionModel: string;
  private reasoningModel: string;

  constructor(endpoint: string, visionModel: string, reasoningModel: string) {
    this.endpoint = normalizeEndpoint(endpoint);
    this.visionModel = visionModel;
    this.reasoningModel = reasoningModel;
  }

  updateConfig(endpoint: string, visionModel: string, reasoningModel: string): void {
    this.endpoint = normalizeEndpoint(endpoint);
    this.visionModel = visionModel;
    this.reasoningModel = reasoningModel;
  }

  isConfigured(): boolean {
    return Boolean(this.endpoint && this.visionModel.trim() && this.reasoningModel.trim());
  }

  async planTask(task: string): Promise<TaskPlan> {
    try {
      const raw = await this.requestTextJson(
        buildPlanningSystemPrompt(),
        buildPlanningUserPrompt(task),
        this.reasoningModel
      );
      const plan = parsePlanResponse(raw, task);
      if (plan) {
        return { ...plan, source: 'llm' };
      }
    } catch {
      // fallback below
    }
    return fallbackPlan(task);
  }

  async analyzeScreenshot(
    capture: ScreenshotCapture,
    task: string,
    history: AgentAction[],
    plan?: TaskPlan | null,
    inApp = false
  ): Promise<AgentAction> {
    const systemPrompt = buildSystemPrompt(capture.imageWidth, capture.imageHeight, inApp);
    const userPrompt = buildUserPrompt(task, history, plan, inApp);
    const imageBase64 = capture.buffer.toString('base64');

    const action = await this.requestVisionAction(
      systemPrompt,
      userPrompt,
      imageBase64,
      undefined,
      task
    );
    if (!action) {
      throw new Error('Vision model returned invalid action JSON');
    }

    if (action.type === 'done') {
      return { type: 'wait', ms: 500 };
    }

    return action;
  }

  async verifyAfterAction(
    capture: ScreenshotCapture,
    task: string,
    lastAction: AgentAction,
    history: AgentAction[],
    plan?: TaskPlan | null
  ): Promise<AgentAction> {
    const systemPrompt = buildVerifySystemPrompt();
    const userPrompt = buildPostActionVerifyPrompt(task, lastAction, history, plan);
    const imageBase64 = capture.buffer.toString('base64');
    const fullHistory = [...history, lastAction];

    if (!requiredActionsCompleted(task, fullHistory, plan)) {
      return { type: 'wait', ms: 500 };
    }

    let action = await this.requestVisionAction(systemPrompt, userPrompt, imageBase64);
    if (this.isAcceptedDone(task, fullHistory, action, plan)) {
      return action!;
    }

    if (isChromeBrowserTask(task) || looksLikeUrl(task)) {
      action = await this.requestVisionAction(
        systemPrompt,
        buildChromeTabVerifyPrompt(task, plan),
        imageBase64
      );
      if (this.isAcceptedDone(task, fullHistory, action, plan)) {
        return action!;
      }
    }

    return { type: 'wait', ms: 200 };
  }

  private isAcceptedDone(
    task: string,
    history: AgentAction[],
    action: AgentAction | null,
    plan?: TaskPlan | null
  ): boolean {
    if (!action || action.type !== 'done') {
      return false;
    }
    return canAcceptVerification(task, history, action.reason, plan).accepted;
  }

  private async requestVisionAction(
    systemPrompt: string,
    userPrompt: string,
    imageBase64: string,
    repairText?: string,
    task?: string
  ): Promise<AgentAction | null> {
    const response = await fetch(`${this.endpoint}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.visionModel,
        stream: false,
        format: 'json',
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: repairText ?? userPrompt,
            images: [imageBase64],
          },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Vision model failed (${response.status}). Run: ollama pull ${this.visionModel}. ${body}`
      );
    }

    return this.parseActionResponse(response, (text) =>
      this.requestVisionAction(
        systemPrompt,
        userPrompt,
        imageBase64,
        buildRepairPrompt(text),
        task
      )
    , task);
  }

  private async requestTextJson(
    systemPrompt: string,
    userPrompt: string,
    model: string
  ): Promise<unknown> {
    const response = await fetch(`${this.endpoint}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        format: 'json',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Reasoning model failed (${response.status}). Run: ollama pull ${model}. ${body}`
      );
    }

    const data = (await response.json()) as OllamaChatResponse;
    if (data.error) {
      throw new Error(`Ollama error: ${data.error}`);
    }

    const text = data.message?.content?.trim();
    if (!text) {
      throw new Error('Reasoning model returned an empty response');
    }

    return parseModelJson(text);
  }

  private async parseActionResponse(
    response: Response,
    retry: (invalid: string) => Promise<AgentAction | null>,
    task?: string
  ): Promise<AgentAction | null> {
    const data = (await response.json()) as OllamaChatResponse;
    if (data.error) {
      throw new Error(`Ollama error: ${data.error}`);
    }

    const text = data.message?.content?.trim();
    if (!text) {
      throw new Error('Model returned an empty response');
    }

    let parsed: unknown;
    try {
      parsed = parseModelJson(text);
    } catch {
      return retry(text);
    }

    const action = tryParseAction(parsed);
    if (action) {
      return normalizeAction(action, task);
    }

    return retry(text);
  }
}
