import type { AgentAction } from '../../shared/types/actions';
import type { TaskPlan } from '../../shared/types/task';
import { isIntentOnlyDoneReason } from './prompts';
import { buildPlanVerifyCriteria } from './taskPlanner';
import { isWebContentTask, looksLikeUrl, resolveLaunchApp, extractPlaybackStartSeconds } from './taskPlaybooks';

const STOP_WORDS = new Set([
  'open',
  'new',
  'tab',
  'chrome',
  'browser',
  'type',
  'enter',
  'and',
  'the',
  'on',
  'in',
  'a',
  'click',
  'press',
  'with',
  'using',
  'play',
  'any',
  'video',
]);

export function taskRequiresPlayback(task: string): boolean {
  return /\b(play|watch|listen|start\s+playing)\b/i.test(task);
}

export function isSpotifyPlaybackTask(task: string): boolean {
  return resolveLaunchApp(task) === 'Spotify' && taskRequiresPlayback(task);
}

const PLAYBACK_EVIDENCE = [
  'now playing',
  'pause button',
  'pause icon',
  'playback',
  'progress bar',
  'song is playing',
  'music is playing',
  'track is playing',
  'player controls',
  'playing bar',
];

const SPOTIFY_PREMATURE = [
  'search result',
  'search results',
  'search bar',
  'search box',
  'search open',
  'query typed',
  'spotify is open',
  'spotify window',
  'searching for',
  'search field',
  'results for',
  'search page',
  'magnifying glass',
];

export function reasonShowsPlayback(reason: string): boolean {
  const lower = reason.toLowerCase();
  return (
    PLAYBACK_EVIDENCE.some((p) => lower.includes(p)) ||
  // "playing" alone is weak but ok if not "search"
    (lower.includes('playing') && !lower.includes('search'))
  );
}

export function isPrematureSpotifyReason(reason: string): boolean {
  const lower = reason.toLowerCase();
  if (reasonShowsPlayback(reason)) {
    return false;
  }
  return SPOTIFY_PREMATURE.some((p) => lower.includes(p));
}

export function extractGoalTerms(task: string): string[] {
  const words = task
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z0-9]/g, ''))
    .filter((w) => w.length > 3 && !STOP_WORDS.has(w));

  return [...new Set(words)];
}

export function extractTypeTarget(task: string): string | null {
  const match = task.match(/\btype\s+(.+?)(?:\s+and\s+|\s*$)/i);
  return match ? match[1].trim().toLowerCase() : null;
}

export function taskRequiresTyping(task: string): boolean {
  return /\btype\b/i.test(task);
}

export function taskRequiresEnter(task: string): boolean {
  return /\benter\b/i.test(task);
}

function isMetaT(action: AgentAction): boolean {
  if (action.type !== 'key') return false;
  const keys = action.keys.map((k) => k.toLowerCase());
  const hasMeta = keys.some((k) => ['meta', 'command', 'cmd'].includes(k));
  return hasMeta && keys.includes('t');
}

function isEnter(action: AgentAction): boolean {
  return (
    action.type === 'key' &&
    action.keys.some((k) => ['enter', 'return'].includes(k.toLowerCase()))
  );
}

function historyHasClick(history: AgentAction[]): boolean {
  return history.some((a) => a.type === 'click');
}

function historyHasWebNavigation(history: AgentAction[]): boolean {
  return history.some(
    (a) =>
      a.type === 'type' &&
      (looksLikeUrl(a.text) ||
        a.text.toLowerCase().includes('youtube') ||
        a.text.toLowerCase().includes('.com'))
  );
}

/** Stricter gate — partial progress must not count as done. */
export function requiredActionsCompleted(
  task: string,
  history: AgentAction[],
  plan?: TaskPlan | null
): boolean {
  if (history.length === 0) {
    return false;
  }

  if (plan && plan.steps.length > 0) {
    let minActions = Math.max(plan.steps.length, 3);
    if (taskRequiresPlayback(task)) {
      minActions = Math.max(minActions, 5);
    }
    if (history.length < minActions) {
      return false;
    }
  }

  if (isWebContentTask(task)) {
    if (!historyHasWebNavigation(history)) {
      return false;
    }
    if (!history.some(isEnter)) {
      return false;
    }
  }

  if (taskRequiresPlayback(task)) {
    if (isSpotifyPlaybackTask(task)) {
      if (!historyHasClick(history)) {
        return false;
      }
    } else if (!historyHasClick(history)) {
      return false;
    }
  }

  const typeTarget = extractTypeTarget(task);
  if (taskRequiresTyping(task) && typeTarget) {
    const typed = history.some(
      (a) => a.type === 'type' && a.text.toLowerCase().includes(typeTarget)
    );
    if (!typed) return false;
  }

  if (taskRequiresEnter(task) && !history.some(isEnter)) {
    return false;
  }

  const lower = task.toLowerCase();
  if (lower.includes('new tab') && lower.includes('chrome') && !history.some(isMetaT)) {
    return false;
  }

  return history.length >= 2;
}

export function reasonProvesTask(task: string, reason: string): boolean {
  if (isSpotifyPlaybackTask(task)) {
    return reasonShowsPlayback(reason);
  }

  const goals = extractGoalTerms(task);
  if (goals.length === 0) {
    return true;
  }

  const lower = reason.toLowerCase();
  return goals.some((term) => lower.includes(term));
}

const WEAK_VERIFY_PHRASES = [
  'multiple tabs',
  'tab bar',
  'browser window is visible',
  'contains multiple',
  'at least one',
  'closed tab',
  'active tab',
  'completing the task goal',
  'task goal of viewing',
];

export function isPrematurePlaybackReason(task: string, reason: string): boolean {
  if (!taskRequiresPlayback(task)) {
    return false;
  }

  const lower = reason.toLowerCase();
  const playEvidence = [
    'playing',
    'playback',
    'now playing',
    'video is playing',
    'video player',
    'player area',
    'paused video',
  ];
  if (playEvidence.some((p) => lower.includes(p))) {
    return false;
  }

  const searchOnly = [
    'search result',
    'results page',
    'search results for',
    'navigated to the search',
    'successfully navigated',
    'relevant video/playlist is visible and loaded',
    'spotify search',
    'search bar shows',
    'search is open',
  ];
  return searchOnly.some((p) => lower.includes(p));
}

export function isWeakGenericReason(task: string, reason: string): boolean {
  const goals = extractGoalTerms(task);
  if (goals.length === 0) {
    return false;
  }

  const lower = reason.toLowerCase();
  const mentionsGoal = goals.some((g) => lower.includes(g));
  if (mentionsGoal && !isPrematurePlaybackReason(task, reason)) {
    return false;
  }

  return WEAK_VERIFY_PHRASES.some((p) => lower.includes(p));
}

export function canAcceptVerification(
  task: string,
  history: AgentAction[],
  reason: string,
  plan?: TaskPlan | null
): { accepted: boolean; rejectReason?: string } {
  if (isIntentOnlyDoneReason(reason)) {
    return { accepted: false, rejectReason: 'Verification used intent, not visible evidence' };
  }

  if (isPrematurePlaybackReason(task, reason)) {
    return {
      accepted: false,
      rejectReason: 'Search results alone do not satisfy a play/watch task — media must be playing',
    };
  }

  if (isSpotifyPlaybackTask(task) && isPrematureSpotifyReason(reason)) {
    return {
      accepted: false,
      rejectReason: 'Spotify search/open is not playback — Now Playing bar or pause button must be visible',
    };
  }

  if (isSpotifyPlaybackTask(task) && !reasonShowsPlayback(reason)) {
    return {
      accepted: false,
      rejectReason: 'Spotify play tasks need visible playback (Now Playing bar, pause button, progress bar)',
    };
  }

  if (isWeakGenericReason(task, reason)) {
    return {
      accepted: false,
      rejectReason: 'Verification only described generic UI, not the actual task goal',
    };
  }

  if (!reasonProvesTask(task, reason)) {
    const goals = extractGoalTerms(task).join(', ');
    return {
      accepted: false,
      rejectReason: `Screenshot must visibly show evidence of: ${goals}`,
    };
  }

  if (!requiredActionsCompleted(task, history, plan)) {
    return {
      accepted: false,
      rejectReason: 'Not enough real actions executed yet for this task',
    };
  }

  return { accepted: true };
}

export function buildTaskSuccessCriteria(task: string, plan?: TaskPlan | null): string {
  if (plan) {
    const base = buildPlanVerifyCriteria(plan);
    if (taskRequiresPlayback(task)) {
      return `${base}\n\nIMPORTANT: Search results are NOT enough. A video must be visibly playing or opened in the player.`;
    }
    return base;
  }

  const goals = extractGoalTerms(task);
  const typeTarget = extractTypeTarget(task);
  const lines = [`Full task: ${task}`, '', 'Return done ONLY if the goal is visibly achieved:'];

  if (goals.length > 0) {
    lines.push(`- Visible evidence related to: ${goals.join(', ')}`);
  }
  if (typeTarget) {
    lines.push(`- "${typeTarget}" appears on screen if typing was required`);
  }
  if (taskRequiresEnter(task)) {
    lines.push('- Navigation or search was submitted and results loaded');
  }
  if (taskRequiresPlayback(task)) {
    lines.push('- Media must be actively playing — NOT just search results or an open app');
  }
  const seekSec = extractPlaybackStartSeconds(task);
  if (seekSec && isWebContentTask(task)) {
    lines.push(`- Video should be playing from approximately ${Math.floor(seekSec / 60)} minute(s) in — not from the start`);
    lines.push('- Search results or typing "5 minutes" in search is NOT success');
  }
  if (isSpotifyPlaybackTask(task)) {
    lines.push('- Spotify: bottom "Now Playing" bar with pause button or progress bar MUST be visible');
    lines.push('- Search results, search bar, or "lofi" text in search = return wait');
  }

  lines.push('- Do NOT return done for partial progress, intent, or unrelated UI');
  lines.push('- If the screenshot shows the agent app or desktop without the target app, return wait');
  return lines.join('\n');
}
