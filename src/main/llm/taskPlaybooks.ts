import type { AgentAction } from '../../shared/types/actions';

const APP_ALIASES: Record<string, string> = {
  spotify: 'Spotify',
  chrome: 'Google Chrome',
  google: 'Google Chrome',
  safari: 'Safari',
  firefox: 'Firefox',
  terminal: 'Terminal',
  finder: 'Finder',
  notes: 'Notes',
  slack: 'Slack',
  discord: 'Discord',
  messages: 'Messages',
  mail: 'Mail',
  calendar: 'Calendar',
  photos: 'Photos',
  music: 'Music',
  vscode: 'Visual Studio Code',
  cursor: 'Cursor',
  filmora: 'Filmora',
  imovie: 'iMovie',
  zoom: 'zoom.us',
  whatsapp: 'WhatsApp',
};

const STOPWORDS = new Set([
  'the', 'a', 'an', 'this', 'that', 'my', 'your', 'its', 'video', 'videos',
  'playlist', 'playlists', 'from', 'of', 'on', 'in', 'at', 'to', 'for', 'and',
  'with', 'particular', 'specific', 'please', 'open', 'launch', 'start',
  'after', 'minutes', 'minute', 'mins', 'min', 'seconds', 'secs', 'mark',
  'youtube', 'play',
]);

/** Remove "play after 5 minutes" style timing — not part of the search query. */
export function stripPlaybackTimingPhrases(task: string): string {
  return task
    .replace(/\s+and\s+play\s+(?:after|from|at)\s+(?:the\s+)?[\d:]+(?:\s*(?:minutes?|mins?|seconds?|secs?))?\s*/gi, ' ')
    .replace(
      /\s+(?:after|from|at)\s+(?:the\s+)?\d{1,2}(?::\d{2}){0,2}\s*(?:minutes?|mins?|seconds?|secs?)?(?:\s+mark)?\s*/gi,
      ' '
    )
    .replace(/\s+/g, ' ')
    .trim();
}

/** Start playback at this offset (e.g. "after 5 minutes" → 300). */
export function extractPlaybackStartSeconds(task: string): number | null {
  const minMatch = task.match(
    /\b(?:after|from|at|start(?:ing)?\s+at)\s+(?:the\s+)?(\d+)\s*(?:minutes?|mins?)\b/i
  );
  if (minMatch) {
    return parseInt(minMatch[1]!, 10) * 60;
  }

  const hmsMatch = task.match(
    /\b(?:after|from|at)\s+(?:the\s+)?(\d{1,2}):(\d{2})(?::(\d{2}))?\b/i
  );
  if (hmsMatch) {
    if (hmsMatch[3]) {
      return (
        parseInt(hmsMatch[1]!, 10) * 3600 +
        parseInt(hmsMatch[2]!, 10) * 60 +
        parseInt(hmsMatch[3]!, 10)
      );
    }
    return parseInt(hmsMatch[1]!, 10) * 60 + parseInt(hmsMatch[2]!, 10);
  }

  const markMatch = task.match(/\b(\d+)\s*(?:minutes?|mins?)\s+mark\b/i);
  if (markMatch) {
    return parseInt(markMatch[1]!, 10) * 60;
  }

  return null;
}

export function formatYoutubeSeekSuffix(seconds: number): string {
  return `&t=${seconds}s`;
}

/** Block vision from typing "5 minutes" into YouTube search when user meant seek time. */
export function sanitizeMisguidedTypeAction(
  task: string,
  action: AgentAction
): AgentAction {
  if (action.type !== 'type' || !extractPlaybackStartSeconds(task)) {
    return action;
  }

  const text = action.text.trim().toLowerCase();
  const looksLikeTiming =
    /\b\d+\s*(?:minutes?|mins?|seconds?|secs?)\b/.test(text) ||
    /\bafter\s+\d+/.test(text) ||
    /^\d+$/.test(text);

  if (!looksLikeTiming) {
    return action;
  }

  const query = extractYoutubeSearchQuery(task) || extractInAppSearchQuery(task);
  if (query) {
    return { type: 'type', text: query };
  }

  return action;
}

const WEB_INDICATORS = [
  'youtube', 'youtu.be', 'playlist', 'google meet', 'meet.google',
  'netflix', 'website', 'webpage', 'browser', 'http://', 'https://', 'www.',
  '.com', '.org', '.io', 'search for', 'go to',
];

function isMetaSpace(action: AgentAction): boolean {
  if (action.type !== 'key') return false;
  const keys = action.keys.map((k) => k.toLowerCase());
  const hasMeta = keys.some((k) => ['meta', 'command', 'cmd'].includes(k));
  return hasMeta && keys.some((k) => k === 'space' || k === ' ');
}

function isEnter(action: AgentAction): boolean {
  return (
    action.type === 'key' &&
    action.keys.some((k) => ['enter', 'return'].includes(k.toLowerCase()))
  );
}

function isMetaT(action: AgentAction): boolean {
  if (action.type !== 'key') return false;
  const keys = action.keys.map((k) => k.toLowerCase());
  const hasMeta = keys.some((k) => ['meta', 'command', 'cmd'].includes(k));
  return hasMeta && keys.includes('t');
}

function isMetaK(action: AgentAction): boolean {
  if (action.type !== 'key') return false;
  const keys = action.keys.map((k) => k.toLowerCase());
  const hasMeta = keys.some((k) => ['meta', 'command', 'cmd'].includes(k));
  return hasMeta && keys.includes('k');
}

function isMetaL(action: AgentAction): boolean {
  if (action.type !== 'key') return false;
  const keys = action.keys.map((k) => k.toLowerCase());
  const hasMeta = keys.some((k) => ['meta', 'command', 'cmd'].includes(k));
  return hasMeta && keys.includes('l');
}

function isEnd(action: AgentAction): boolean {
  return (
    action.type === 'key' &&
    action.keys.some((k) => ['end', 'fn+right'].includes(k.toLowerCase()))
  );
}

function isArrowDown(action: AgentAction): boolean {
  return (
    action.type === 'key' &&
    action.keys.some((k) => ['down', 'arrowdown'].includes(k.toLowerCase()))
  );
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

export function looksLikeUrl(text: string): boolean {
  const lower = text.trim().toLowerCase();
  return (
    lower.includes('.com') ||
    lower.includes('.org') ||
    lower.includes('.io') ||
    lower.startsWith('http://') ||
    lower.startsWith('https://') ||
    lower.startsWith('www.')
  );
}

export function isWebContentTask(task: string): boolean {
  const lower = task.toLowerCase();
  return WEB_INDICATORS.some((k) => lower.includes(k)) || looksLikeUrl(task);
}

export function isChromeBrowserTask(task: string): boolean {
  const lower = task.toLowerCase();
  return (
    lower.includes('chrome') ||
    lower.includes('browser') ||
    lower.includes('tab') ||
    isWebContentTask(task)
  );
}

/** Which macOS app Spotlight should open for this task. */
export function resolveLaunchApp(task: string): string | null {
  const lower = task.toLowerCase();

  if (isWebContentTask(task)) {
    if (lower.includes('safari') && !lower.includes('chrome')) {
      return 'Safari';
    }
    return 'Google Chrome';
  }

  for (const [key, name] of Object.entries(APP_ALIASES)) {
    const pattern = new RegExp(`\\b${key.replace('.', '\\.')}\\b`, 'i');
    if (pattern.test(lower)) {
      return name;
    }
  }

  const afterVerb = extractAfterOpenVerb(task);
  if (!afterVerb) return null;

  const words = afterVerb
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z0-9]/gi, ''))
    .filter((w) => w.length > 1 && !STOPWORDS.has(w.toLowerCase()));

  if (words.length === 0) return null;

  const first = words[0].toLowerCase();
  if (APP_ALIASES[first]) {
    return APP_ALIASES[first];
  }

  return capitalize(words[0]);
}

/** @deprecated Use resolveLaunchApp */
export function extractTargetAppName(task: string): string | null {
  return resolveLaunchApp(task);
}

function extractAfterOpenVerb(task: string): string | null {
  const match = task.match(/\b(?:open|launch|start)\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

export function buildWebNavigationTarget(task: string): string | null {
  const explicitUrl = task.match(/https?:\/\/[^\s]+/i);
  if (explicitUrl) {
    return explicitUrl[0];
  }

  const lower = task.toLowerCase();

  if (lower.includes('meet.google') || (lower.includes('google meet') || /\bmeet\b/.test(lower) && lower.includes('camera'))) {
    return 'https://meet.google.com/new';
  }

  if (lower.includes('youtube') || lower.includes('youtu.be') || (lower.includes('playlist') && !lower.includes('spotify'))) {
    const query = extractYoutubeSearchQuery(task);
    if (query) {
      return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    }
    return 'https://www.youtube.com';
  }

  const domainMatch = task.match(/\b([\w-]+\.(?:com|org|io|net|dev))\b/i);
  if (domainMatch) {
    return `https://${domainMatch[1]}`;
  }

  return null;
}

function extractYoutubeSearchQuery(task: string): string {
  const cleaned = stripPlaybackTimingPhrases(task);

  const patterns = [
    /\bplay\s+(.+?)(?:\s+video\b|\s+on\s+youtube\b|\s+and\b|$)/i,
    /\bfrom\s+(.+?)(?:\s+playlist|\s+on\s+youtube|$)/i,
    /\bplaylist\s+(.+?)(?:\s+on\s+youtube|$)/i,
    /\byoutube\s+(?:video\s+)?(?:of|from|about)\s+(.+?)$/i,
    /\bby\s+([A-Za-z][\w\s]+?)(?:\s+playlist|\s+on\s+youtube|$)/i,
    /\b(?:watch|find)\s+(.+?)(?:\s+on\s+youtube|\s+video\b|$)/i,
  ];

  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match?.[1]) {
      const query = match[1]
        .replace(/\s+video$/i, '')
        .replace(/\s+on\s+youtube$/i, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (query.length > 1) {
        return query;
      }
    }
  }

  const words = cleaned
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z0-9]/gi, ''))
    .filter((w) => w.length > 2 && !STOPWORDS.has(w.toLowerCase()) && !/youtube/i.test(w));

  return words.slice(0, 8).join(' ');
}

export function shouldUseSpotlight(task: string): boolean {
  const lower = task.toLowerCase();
  if (lower.includes('spotlight')) return true;
  if (/\b(?:open|launch|start|play|watch|go)\b/i.test(task)) return true;
  return Boolean(resolveLaunchApp(task));
}

function historyTypedApp(appName: string, history: AgentAction[]): boolean {
  const needle = appName.split(' ')[0].toLowerCase();
  return history.some(
    (a) => a.type === 'type' && a.text.toLowerCase().includes(needle)
  );
}

export function spotlightLaunchComplete(task: string, history: AgentAction[]): boolean {
  if (!shouldUseSpotlight(task)) return true;

  const appName = resolveLaunchApp(task);
  if (!appName) return history.some(isEnter);

  return historyTypedApp(appName, history) && history.some(isEnter);
}

/** True when Spotlight launch is done and vision model should drive all further steps. */
export function isInAppPhase(task: string, history: AgentAction[]): boolean {
  if (!spotlightLaunchComplete(task, history)) {
    return false;
  }

  if (isWebContentTask(task)) {
    const target = buildWebNavigationTarget(task);
    if (!target) {
      return true;
    }
    const urlEntered = history.some((a, i) => {
      if (a.type !== 'type' || a.text.trim().toLowerCase() !== target.toLowerCase()) {
        return false;
      }
      return history.slice(i + 1).some(isEnter);
    });
    return urlEntered;
  }

  return true;
}

export function extractInAppSearchQuery(task: string): string | null {
  const cleaned = stripPlaybackTimingPhrases(task);
  const patterns = [
    /\bplay\s+(.+?)(?:\s+music|\s+on\s+spotify|\s+video\b|\s+and\b|$)/i,
    /\bsearch\s+(?:for\s+)?(.+?)(?:\s+on\s+|\s+in\s+|$)/i,
    /\bfind\s+(.+?)(?:\s+on\s+|\s+in\s+|$)/i,
    /\blisten\s+to\s+(.+?)$/i,
  ];

  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match?.[1]) {
      const query = match[1]
        .replace(/\s+music$/i, '')
        .replace(/\s+on\s+spotify$/i, '')
        .replace(/\s+video$/i, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (query.length > 1) {
        return query;
      }
    }
  }

  return null;
}

function spotifySearchSubmitted(history: AgentAction[], queryLower: string): boolean {
  return history.some((a, i) => {
    if (a.type !== 'type' || !a.text.toLowerCase().includes(queryLower)) {
      return false;
    }
    return history.slice(i + 1).some(isEnter);
  });
}

export function isSpotifyPlaySequenceComplete(task: string, history: AgentAction[]): boolean {
  if (resolveLaunchApp(task) !== 'Spotify') {
    return false;
  }

  const query = extractInAppSearchQuery(task);
  if (!query) {
    return false;
  }

  return spotifySearchSubmitted(history, query.toLowerCase());
}

/**
 * Phase 1 — Spotlight: Cmd+Space → app name → Enter (no vision model).
 */
export function resolveForcedSpotlightAction(
  task: string,
  history: AgentAction[]
): AgentAction | null {
  if (!shouldUseSpotlight(task)) {
    return null;
  }

  const appName = resolveLaunchApp(task);
  const hasSpotlight = history.some(isMetaSpace);

  if (!hasSpotlight) {
    return { type: 'key', keys: ['Meta', 'Space'] };
  }

  if (appName) {
    if (!historyTypedApp(appName, history)) {
      return { type: 'type', text: appName };
    }
    if (!history.some(isEnter)) {
      return { type: 'key', keys: ['Enter'] };
    }
  }

  return null;
}

/**
 * Phase 2 — In browser: navigate to URL/search after Chrome/Safari is open.
 */
export function resolveForcedInAppAction(
  task: string,
  history: AgentAction[]
): AgentAction | null {
  if (!spotlightLaunchComplete(task, history)) {
    return null;
  }

  const app = resolveLaunchApp(task);
  const isBrowser = app === 'Google Chrome' || app === 'Safari';
  if (!isBrowser || !isWebContentTask(task)) {
    return null;
  }

  const target = buildWebNavigationTarget(task);
  if (!target) {
    return null;
  }

  const typed = history.some(
    (a) => a.type === 'type' && a.text.trim().toLowerCase() === target.toLowerCase()
  );
  if (!typed) {
    return { type: 'type', text: target };
  }

  const enterAfterUrl = history.some((a, i) => {
    if (a.type !== 'type' || a.text.trim().toLowerCase() !== target.toLowerCase()) {
      return false;
    }
    return history.slice(i + 1).some(isEnter);
  });
  if (!enterAfterUrl) {
    return { type: 'key', keys: ['Enter'] };
  }

  return null;
}

/**
 * Phase 2 — Spotify: Cmd+K opens search, then type query (vision handles play click).
 */
export function resolveForcedSpotifyInAppAction(
  task: string,
  history: AgentAction[]
): AgentAction | null {
  if (resolveLaunchApp(task) !== 'Spotify') {
    return null;
  }

  if (!isInAppPhase(task, history)) {
    return null;
  }

  const query = extractInAppSearchQuery(task);
  if (!query) {
    return null;
  }

  const queryLower = query.toLowerCase();

  if (!history.some(isMetaK)) {
    return { type: 'key', keys: ['Meta', 'k'] };
  }

  const typed = history.some(
    (a) => a.type === 'type' && a.text.toLowerCase().includes(queryLower)
  );
  if (!typed) {
    return { type: 'type', text: query };
  }

  const submitted = spotifySearchSubmitted(history, queryLower);
  if (!submitted) {
    return { type: 'key', keys: ['Enter'] };
  }

  // Search is done — vision must double-click a track or click Play (keyboard Enter rarely starts playback).
  return null;
}

/**
 * Phase 2 — YouTube: after a video is opened, seek via URL (&t=300s) — not via search.
 */
export function resolveForcedYoutubeSeekAction(
  task: string,
  history: AgentAction[]
): AgentAction | null {
  const seconds = extractPlaybackStartSeconds(task);
  if (!seconds || !isWebContentTask(task)) {
    return null;
  }

  if (!isInAppPhase(task, history)) {
    return null;
  }

  if (!history.some((a) => a.type === 'click')) {
    return null;
  }

  const suffix = formatYoutubeSeekSuffix(seconds);
  const typedSuffix = history.some(
    (a) => a.type === 'type' && a.text.includes(suffix)
  );

  if (!history.some(isMetaL)) {
    return { type: 'key', keys: ['Meta', 'l'] };
  }

  if (!typedSuffix) {
    if (!history.some(isEnd)) {
      return { type: 'key', keys: ['End'] };
    }
    return { type: 'type', text: suffix };
  }

  const submitted = history.some((a, i) => {
    if (a.type !== 'type' || !a.text.includes(suffix)) {
      return false;
    }
    return history.slice(i + 1).some(isEnter);
  });
  if (!submitted) {
    return { type: 'key', keys: ['Enter'] };
  }

  return null;
}

/** Combined fast-path: Spotlight launch, browser URL, Spotify search, or YouTube seek. */
export function resolveForcedAction(
  task: string,
  history: AgentAction[]
): AgentAction | null {
  const spotlight = resolveForcedSpotlightAction(task, history);
  if (spotlight) {
    return spotlight;
  }

  if (isInAppPhase(task, history)) {
    const spotify = resolveForcedSpotifyInAppAction(task, history);
    if (spotify) {
      return spotify;
    }
    return resolveForcedYoutubeSeekAction(task, history);
  }

  return resolveForcedInAppAction(task, history);
}

/** Milliseconds to wait after a forced action before the next one. */
export function getForcedActionDelay(action: AgentAction): number {
  if (action.type === 'key') {
    if (isMetaK(action)) {
      return 400;
    }
    if (isEnter(action)) {
      return 320;
    }
    return 160;
  }

  switch (action.type) {
    case 'type':
      return 180;
    case 'click':
      return 220;
    default:
      return 100;
  }
}

/** Run consecutive forced actions without calling the vision model between them. */
export function drainForcedActions(
  task: string,
  history: AgentAction[],
  maxSteps = 12
): AgentAction[] {
  const batch: AgentAction[] = [];
  const scratch = [...history];

  for (let i = 0; i < maxSteps; i += 1) {
    const next = resolveForcedAction(task, scratch);
    if (!next) {
      break;
    }
    batch.push(next);
    scratch.push(next);
  }

  return batch;
}

export function shouldSkipVerification(
  action: AgentAction,
  task: string,
  history: AgentAction[]
): boolean {
  if (isInAppPhase(task, history)) {
    if (action.type === 'key' && (isMetaK(action) || isMetaT(action) || isArrowDown(action))) {
      return true;
    }
    if (action.type === 'key' && (isMetaL(action) || isEnd(action))) {
      return true;
    }
    if (action.type === 'key' && isEnter(action)) {
      return true;
    }
    const query = extractInAppSearchQuery(task);
    if (
      query &&
      action.type === 'type' &&
      action.text.toLowerCase().includes(query.toLowerCase())
    ) {
      return true;
    }
    const seekSec = extractPlaybackStartSeconds(task);
    if (
      seekSec &&
      action.type === 'type' &&
      action.text.includes(formatYoutubeSeekSuffix(seekSec))
    ) {
      return true;
    }
    return false;
  }

  if (action.type === 'key' && (isMetaSpace(action) || isMetaT(action))) {
    return true;
  }

  const appName = resolveLaunchApp(task);

  if (action.type === 'type' && appName && !historyTypedApp(appName, history)) {
    if (action.text.toLowerCase().includes(appName.split(' ')[0].toLowerCase())) {
      return true;
    }
  }

  if (action.type === 'type' && looksLikeUrl(action.text) && isWebContentTask(task)) {
    return true;
  }

  if (action.type === 'key' && isEnter(action) && !isInAppPhase(task, [...history, action])) {
    return true;
  }

  return false;
}

export function shouldPrepareChromeAddressBar(
  action: AgentAction,
  task: string,
  history: AgentAction[]
): boolean {
  if (action.type !== 'type' || !looksLikeUrl(action.text)) {
    return false;
  }

  if (!isChromeBrowserTask(task) && !isWebContentTask(task) && !looksLikeUrl(task)) {
    return false;
  }

  const target = action.text.trim().toLowerCase();
  const alreadyTyped = history.some(
    (a) => a.type === 'type' && a.text.trim().toLowerCase() === target
  );
  return !alreadyTyped;
}

export function getPlaybookHint(task: string, history: AgentAction[]): string | null {
  if (!spotlightLaunchComplete(task, history)) {
    const app = resolveLaunchApp(task);
    if (app) {
      return `PHASE 1 (automated): Spotlight — {"type":"key","keys":["Meta","Space"]} → {"type":"type","text":"${app}"} → {"type":"key","keys":["Enter"]}.`;
    }
    return 'PHASE 1: Open Spotlight (Meta+Space), type app name, press Enter.';
  }

  const searchQuery = extractInAppSearchQuery(task);
  const app = resolveLaunchApp(task);

  if (isWebContentTask(task)) {
    const seekSec = extractPlaybackStartSeconds(task);
    const lines = [
      `PHASE 2 — INSIDE ${app ?? 'browser'}: Study the screenshot.`,
      'Find the address bar, search box, or page content.',
      'Use click on visible UI elements with exact x,y from the screenshot.',
      'Use {"type":"type","text":"..."} for URLs/search, then Enter.',
      'Click play/buttons/links you can SEE. One action per turn.',
    ];
    if (seekSec) {
      lines.push(
        `TIMING: User wants playback from ${Math.floor(seekSec / 60)} min — do NOT search for "${seekSec} seconds". Open the video first; seek is automated via URL.`
      );
    }
    return lines.join(' ');
  }

  const hints = [
    `PHASE 2 — INSIDE ${app ?? 'the app'} ONLY. Ignore every other window.`,
    'NEVER use move-only actions. Click or use keyboard shortcuts.',
    'NEVER type into Developer Tools, browser console, Terminal, or Greater Sanjay.',
    'Spotify: search is automated — if results show, double-click the first track or click Play.',
    'Use {"type":"click","x":N,"y":N,"clicks":2} to double-click a song/playlist row.',
  ];

  if (
    searchQuery &&
    isSpotifyPlaySequenceComplete(task, history) &&
    !history.some((a) => a.type === 'click')
  ) {
    hints.push(
      `Search for "${searchQuery}" should be done. DOUBLE-CLICK the first track row (clicks:2) or click the green Play button — search alone is NOT success.`
    );
  } else if (searchQuery) {
    hints.push(`User wants: "${searchQuery}" — find search, type it, select result, play/confirm.`);
  }

  hints.push('One action per turn based ONLY on what is visible right now.');
  return hints.join(' ');
}

export { isMetaT };
