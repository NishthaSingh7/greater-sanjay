import type { AgentAction } from '../../shared/types/actions';
import { buildTaskSuccessCriteria } from './taskCompletion';
import { buildPlanExecutionContext } from './taskPlanner';
import { getPlaybookHint } from './taskPlaybooks';

export function buildSystemPrompt(
  imageWidth: number,
  imageHeight: number,
  inApp = false
): string {
  const base = `You are Greater Sanjay, a macOS desktop UI control agent.
You receive a screenshot of the user's screen RIGHT NOW.
You must return exactly ONE JSON action to progress the user's task.

Screenshot dimensions: ${imageWidth}x${imageHeight} pixels.
All x,y coordinates must be within 0..${imageWidth - 1} and 0..${imageHeight - 1}.

Respond with JSON only. No markdown, no explanation, no code fences.

Valid action types:
- {"type":"click","x":number,"y":number,"button":"left"|"right","clicks":1|2}
- {"type":"type","text":"string"}
- {"type":"key","keys":["Meta","Space"]}
- {"type":"wait","ms":number}
- {"type":"done","reason":"string"}

KEY vs TYPE:
- "key" = keyboard shortcuts only (Meta, Enter, Tab, letters).
- "type" = any text: URLs, search queries, song names.

FORBIDDEN:
- {"type":"move",...} — never move the mouse without clicking in the same action.
- Interacting with any window except the user's target app.

CRITICAL:
- Base every action ONLY on what you SEE in this screenshot.
- NEVER interact with Developer Tools, Console, Elements panel, Terminal, or the Greater Sanjay agent app.
- If DevTools or a code console is visible, IGNORE it — find the user's target app (Spotify, Chrome, etc.).
- Never assume UI state from memory — look at the image each turn.
- Return one action per response. Never return "done" during action selection.`;

  if (inApp) {
    return `${base}

PHASE 2 — INSIDE THE TARGET APP:
- Work ONLY inside the target app window visible in the screenshot.
- NEVER use move-only actions. Click buttons, search fields, or use keyboard shortcuts.
- NEVER click or type in Developer Tools, browser console, Terminal, or Greater Sanjay.
- Spotify: if search results are visible, double-click the first track (clicks:2) or click the Play button.
- Chrome/YouTube: click the video thumbnail or play button you can see.
- YouTube timing: "play after 5 minutes" means START at 5:00 in the player — never put minutes/seconds in the search box.
- If the wrong window is focused, click once inside the target app window first.`;
  }

  return `${base}

PHASE 1 may be handled automatically via Spotlight.
If the target app is already open and focused, work inside it immediately.`;
}

export function buildUserPrompt(
  task: string,
  history: AgentAction[],
  plan?: import('../../shared/types/task').TaskPlan | null,
  inApp = false
): string {
  const historyText =
    history.length > 0
      ? `\nRecent actions:\n${history
          .slice(-8)
          .map((a, i) => `${i + 1}. ${JSON.stringify(a)}`)
          .join('\n')}`
      : '';

  const guidance = plan
    ? buildPlanExecutionContext(plan, history.length, inApp)
    : getPlaybookHint(task, history);
  const guidanceText = guidance ? `\n\n${guidance}` : '';

  const phaseNote = inApp
    ? '\n\nThe app is open. Look at the screenshot and choose the next in-app action.'
    : '';

  return `User request: ${task}${historyText}${guidanceText}${phaseNote}\n\nWhat is the next action based on the CURRENT screenshot?`;
}

export function buildVerifySystemPrompt(): string {
  return `You are a strict visual verification assistant for a macOS automation agent.
You receive a screenshot taken AFTER an action was executed.

Respond with JSON only.

Valid responses:
- {"type":"done","reason":"..."} — the FULL task goal is visibly complete RIGHT NOW in this exact screenshot
- {"type":"wait","ms":500} — goal not complete yet

Rules:
- Describe ONLY what you literally see in the screenshot. No guessing.
- If the screenshot shows the automation app itself, another unrelated app, or the desktop — return wait.
- Search results pages are NOT success when the user asked to play/watch something.
- Spotify: return done ONLY if the bottom Now Playing bar shows a track with pause button or progress bar.
- Spotify search results or search bar with typed query = return wait.
- Return wait if unsure. False positives are worse than continuing.`;
}

export function buildPostActionVerifyPrompt(
  task: string,
  lastAction: AgentAction,
  history: AgentAction[],
  plan?: import('../../shared/types/task').TaskPlan | null
): string {
  const criteria = buildTaskSuccessCriteria(task, plan);

  return `${criteria}

Last action: ${JSON.stringify(lastAction)}
Actions so far: ${history.map((a) => JSON.stringify(a)).join('\n')}

Is the FULL task goal visibly complete in this screenshot?`;
}

export function buildChromeTabVerifyPrompt(
  task: string,
  plan?: import('../../shared/types/task').TaskPlan | null
): string {
  return `${buildTaskSuccessCriteria(task, plan)}

Focus on whether the task goal is achieved on screen. Return wait if only partial progress.`;
}

export function isIntentOnlyDoneReason(reason: string): boolean {
  const lower = reason.toLowerCase();
  const intentPhrases = [
    'intended', 'meant to', 'objective', 'previous action',
    'were dispatched', 'should have', 'supposed to',
  ];
  const visualPhrases = [
    'i see', 'visible', 'shows', 'displayed', 'window', 'open', 'screen',
  ];
  const hasIntent = intentPhrases.some((p) => lower.includes(p));
  const hasVisual = visualPhrases.some((p) => lower.includes(p));
  return hasIntent && !hasVisual;
}

export function buildRepairPrompt(invalidResponse: string): string {
  return `Invalid response:
${invalidResponse}

Return a single valid JSON action. URLs/words use {"type":"type","text":"..."}.`;
}
