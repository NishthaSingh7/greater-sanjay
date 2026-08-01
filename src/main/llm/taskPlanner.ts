import { z } from 'zod';
import type { TaskPlan } from '../../shared/types/task';
import { resolveLaunchApp, shouldUseSpotlight, isWebContentTask, buildWebNavigationTarget } from './taskPlaybooks';

const planResponseSchema = z.object({
  goal: z.string().min(1),
  steps: z.array(z.string().min(1)).min(2).max(12),
});

export function buildPlanningSystemPrompt(): string {
  return `You are a macOS desktop task planner for Greater Sanjay.
The user writes SHORT requests. Expand them into clear step-by-step plans.

Respond with JSON only: {"goal":"...","steps":["step 1","step 2",...]}

Rules:
- 3-5 short steps maximum — be concise
- ALWAYS open apps via Spotlight: Cmd+Space → type app name → Enter
- NEVER use Terminal, shell commands, or Dock clicks to launch apps
- For browsers: Spotlight open Chrome → Cmd+T → type URL → Enter
- Each step is one quick milestone`;
}

export function buildPlanningUserPrompt(task: string): string {
  return `User request:\n"${task}"\n\nReturn the JSON plan.`;
}

export function parsePlanResponse(raw: unknown, task: string): TaskPlan | null {
  const result = planResponseSchema.safeParse(raw);
  if (!result.success) return null;

  return {
    goal: result.data.goal,
    steps: result.data.steps.map((description, index) => ({
      id: index + 1,
      description,
      status: 'pending' as const,
    })),
    source: 'llm',
  };
}

export function isSimpleOpenTask(task: string): boolean {
  return shouldUseSpotlight(task) && Boolean(resolveLaunchApp(task));
}

export function fallbackPlan(task: string): TaskPlan {
  const appName = resolveLaunchApp(task);
  const webTarget = buildWebNavigationTarget(task);

  if (appName && isWebContentTask(task)) {
    return toPlan(task, [
      `Spotlight: Cmd+Space → "${appName}" → Enter`,
      webTarget
        ? `In browser: go to ${webTarget}`
        : 'Navigate to the target site inside the browser',
      'Complete the requested action on the page',
      'Verify the goal is visible',
    ]);
  }

  if (appName) {
    return toPlan(task, [
      `Spotlight: Cmd+Space → "${appName}" → Enter`,
      'Complete the requested action inside the app',
      'Verify the goal is visible on screen',
    ]);
  }

  if (shouldUseSpotlight(task)) {
    return toPlan(task, [
      'Open Spotlight (Cmd+Space)',
      'Type the target app name and press Enter',
      'Complete the requested action',
      'Verify the goal is visible',
    ]);
  }

  if (looksLikeBrowserFollowUp(task)) {
    return toPlan(task, [
      'Spotlight: open Google Chrome',
      'New tab (Cmd+T) → type URL → Enter',
      'Complete the action on the page',
      'Verify the goal is visible',
    ]);
  }

  return toPlan(task, [
    'Spotlight: open the required app',
    'Perform the main actions',
    'Verify the goal is visibly achieved',
  ]);
}

function looksLikeBrowserFollowUp(task: string): boolean {
  const lower = task.toLowerCase();
  return (
    lower.includes('chrome') ||
    lower.includes('browser') ||
    lower.includes('.com') ||
    lower.includes('tab') ||
    lower.includes('meet')
  );
}

function toPlan(goal: string, stepDescriptions: string[]): TaskPlan {
  return {
    goal,
    steps: stepDescriptions.map((description, index) => ({
      id: index + 1,
      description,
      status: 'pending',
    })),
    source: 'fallback',
  };
}

export function estimateCompletedStepCount(historyLength: number, stepCount: number): number {
  if (stepCount === 0) return 0;
  return Math.min(historyLength, stepCount - 1);
}

export function updatePlanProgress(plan: TaskPlan, historyLength: number): TaskPlan {
  const doneThrough = estimateCompletedStepCount(historyLength, plan.steps.length);
  const activeIdx = Math.min(doneThrough, plan.steps.length - 1);

  return {
    ...plan,
    steps: plan.steps.map((step, index) => ({
      ...step,
      status:
        index < doneThrough ? 'done' : index === activeIdx ? 'in_progress' : 'pending',
    })),
  };
}

export function buildPlanExecutionContext(
  plan: TaskPlan,
  historyLength: number,
  inApp = false
): string {
  const progressed = updatePlanProgress(plan, historyLength);
  const activeIdx = progressed.steps.findIndex((s) => s.status === 'in_progress');
  const focusStep = activeIdx >= 0 ? activeIdx + 1 : progressed.steps.length;

  const lines = [
    `GOAL: ${progressed.goal}`,
    '',
    'PLAN (follow in order):',
  ];

  for (const step of progressed.steps) {
    const icon = step.status === 'done' ? '✓' : step.status === 'in_progress' ? '→' : '○';
    lines.push(`${icon} ${step.id}. ${step.description}`);
  }

  lines.push('');
  lines.push(
    inApp
      ? `Phase 2 (step ${focusStep}): App is open — use the screenshot to click/type INSIDE the app.`
      : `Phase 1 (step ${focusStep}): Open the app via Spotlight first.`
  );

  return lines.join('\n');
}

export function buildPlanVerifyCriteria(plan: TaskPlan): string {
  const lines = [
    `Goal: ${plan.goal}`,
    '',
    'Return done ONLY when ALL of these are visibly achieved:',
  ];
  for (const step of plan.steps) {
    lines.push(`- ${step.description}`);
  }
  return lines.join('\n');
}
