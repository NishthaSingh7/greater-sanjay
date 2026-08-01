import assert from 'node:assert/strict';
import { parseAction, tryParseAction } from '../dist/shared/types/actions.js';
import { normalizeAction } from '../dist/shared/types/actionNormalize.js';
import { mapCoordinates } from '../dist/main/services/screenshot.js';
import { ApiKeyPool } from '../dist/main/llm/apiKeyPool.js';
import { parseModelJson } from '../dist/main/llm/jsonRepair.js';
import {
  fallbackPlan,
  buildPlanExecutionContext,
  parsePlanResponse,
} from '../dist/main/llm/taskPlanner.js';
import {
  shouldPrepareChromeAddressBar,
  looksLikeUrl,
  resolveForcedAction,
  resolveLaunchApp,
  buildWebNavigationTarget,
  isWebContentTask,
  isInAppPhase,
  extractPlaybackStartSeconds,
  stripPlaybackTimingPhrases,
} from '../dist/main/llm/taskPlaybooks.js';
import {
  canAcceptVerification,
  requiredActionsCompleted,
  taskRequiresPlayback,
} from '../dist/main/llm/taskCompletion.js';

function testActionSchema() {
  const click = parseAction({ type: 'click', x: 100, y: 200 });
  assert.equal(click.type, 'click');

  const key = parseAction({ type: 'key', keys: ['Meta', 'Space'] });
  assert.deepEqual(key, { type: 'key', keys: ['Meta', 'Space'] });

  const done = parseAction({ type: 'done', reason: 'Opened Terminal' });
  assert.equal(done.reason, 'Opened Terminal');

  assert.equal(tryParseAction({ type: 'invalid' }), null);
  console.log('✓ Action schema');
}

function testCoordinateMapping() {
  const mapped = mapCoordinates(1920, 1080, {
    imageWidth: 3840,
    imageHeight: 2160,
    displayWidth: 1920,
    displayHeight: 1080,
    scaleFactor: 2,
  });

  assert.equal(mapped.x, 960);
  assert.equal(mapped.y, 540);
  console.log('✓ Coordinate mapping (Retina-safe)');
}

function testApiKeyPool() {
  const pool = new ApiKeyPool(['key-a', 'key-b', 'key-c']);
  assert.equal(pool.getKey(), 'key-a');
  assert.equal(pool.getCurrentKeyIndex(), 0);

  pool.rotate();
  assert.equal(pool.getKey(), 'key-b');
  assert.equal(pool.getCurrentKeyIndex(), 1);

  assert.equal(pool.isRateLimitError(new Error('429 rate limit exceeded')), true);
  assert.equal(pool.isRateLimitError(new Error('quota exceeded')), true);
  assert.equal(pool.isRateLimitError(new Error('network error')), false);
  console.log('✓ API key pool rotation and rate-limit detection');
}

function testActionNormalize() {
  const urlMisuse = normalizeAction({ type: 'key', keys: ['meet.google.com'] });
  assert.deepEqual(urlMisuse, { type: 'type', text: 'meet.google.com' });

  const wordMisuse = normalizeAction({ type: 'key', keys: ['Netflix'] });
  assert.deepEqual(wordMisuse, { type: 'type', text: 'Netflix' });

  const validShortcut = normalizeAction({ type: 'key', keys: ['Meta', 't'] });
  assert.deepEqual(validShortcut, { type: 'key', keys: ['Meta', 'T'] });

  const validEnter = normalizeAction({ type: 'key', keys: ['Enter'] });
  assert.deepEqual(validEnter, { type: 'key', keys: ['Enter'] });

  const metaSpace = normalizeAction({ type: 'key', keys: ['Meta', ' '] });
  assert.deepEqual(metaSpace, { type: 'key', keys: ['Meta', 'Space'] });

  console.log('✓ Action normalize (URL/word misuse → type, key aliases)');
}

function testJsonRepair() {
  const bareMeta = parseModelJson('{"type":"key","keys":[Meta,"t"]}');
  assert.deepEqual(bareMeta, { type: 'key', keys: ['Meta', 't'] });

  const fenced = parseModelJson('```json\n{"type":"wait","ms":500}\n```');
  assert.deepEqual(fenced, { type: 'wait', ms: 500 });

  console.log('✓ LLM JSON repair (unquoted Meta/t, fences)');
}

function testTaskPlanner() {
  const meetPlan = fallbackPlan('start google meet with camera off on chrome');
  assert.ok(meetPlan.steps.length >= 3);

  const spotifyPlan = fallbackPlan('open spotify and play music');
  assert.ok(spotifyPlan.steps[0].description.includes('Spotify'));

  const context = buildPlanExecutionContext(meetPlan, 1, false);
  assert.ok(context.includes('GOAL:'));
  assert.ok(context.includes('Phase 1'));

  console.log('✓ Task planner (fallback + plan context)');
}

function testPlaybooks() {
  assert.equal(resolveLaunchApp('open spotify and play music'), 'Spotify');
  assert.equal(resolveLaunchApp('open the youtube video from Aditya Verma playlist Dynamic Programming'), 'Google Chrome');
  assert.ok(isWebContentTask('open youtube playlist'));
  assert.ok(buildWebNavigationTarget('open youtube from Aditya Verma Dynamic Programming playlist').includes('youtube.com'));

  const forcedSpotlight = resolveForcedAction('open spotify', []);
  assert.deepEqual(forcedSpotlight, { type: 'key', keys: ['Meta', 'Space'] });

  const forcedType = resolveForcedAction('open spotify', [
    { type: 'key', keys: ['Meta', 'Space'] },
  ]);
  assert.deepEqual(forcedType, { type: 'type', text: 'Spotify' });

  const chromeHistory = [
    { type: 'key', keys: ['Meta', 'Space'] },
    { type: 'type', text: 'Google Chrome' },
    { type: 'key', keys: ['Enter'] },
  ];
  const forcedUrl = resolveForcedAction(
    'open the youtube video from Aditya Verma playlist Dynamic Programming',
    chromeHistory
  );
  assert.equal(forcedUrl?.type, 'type');
  assert.ok(forcedUrl?.text.includes('youtube.com'));

  const spotifyLaunch = [
    { type: 'key', keys: ['Meta', 'Space'] },
    { type: 'type', text: 'Spotify' },
    { type: 'key', keys: ['Enter'] },
  ];
  assert.equal(isInAppPhase('open spotify and play lofi', spotifyLaunch), true);
  assert.deepEqual(resolveForcedAction('open spotify and play lofi', spotifyLaunch), {
    type: 'key',
    keys: ['Meta', 'k'],
  });

  const spotifyInApp = [
    ...spotifyLaunch,
    { type: 'key', keys: ['Meta', 'k'] },
  ];
  const forcedSearch = resolveForcedAction('open spotify and play lofi', spotifyInApp);
  assert.deepEqual(forcedSearch, { type: 'type', text: 'lofi' });

  const spotifyTyped = [
    ...spotifyInApp,
    { type: 'type', text: 'lofi' },
  ];
  assert.deepEqual(resolveForcedAction('open spotify and play lofi', spotifyTyped), {
    type: 'key',
    keys: ['Enter'],
  });

  const spotifySubmitted = [
    ...spotifyTyped,
    { type: 'key', keys: ['Enter'] },
  ];
  assert.equal(resolveForcedAction('open spotify and play lofi', spotifySubmitted), null);

  console.log('✓ Task playbooks (Spotlight + Spotify fast path)');
}

function testYoutubeTiming() {
  const task =
    'open YouTube and play Dynamic Programming by Aditya video and play after 5 minutes';

  assert.equal(extractPlaybackStartSeconds(task), 300);

  const url = buildWebNavigationTarget(task);
  assert.ok(url?.includes('youtube.com'));
  assert.ok(url?.includes('search_query='));
  assert.ok(url?.includes('Dynamic') || url?.includes('Aditya'));
  assert.equal(url?.includes('5'), false);
  assert.equal(url?.includes('minute'), false);

  const cleaned = stripPlaybackTimingPhrases(task);
  assert.equal(cleaned.toLowerCase().includes('5 minutes'), false);

  console.log('✓ YouTube search vs playback timing (5 min seek ≠ search query)');
}

function testSpotifyFalseSuccess() {
  const task = 'open spotify and play lofi music';
  const keyboardOnly = [
    { type: 'key', keys: ['Meta', 'Space'] },
    { type: 'type', text: 'Spotify' },
    { type: 'key', keys: ['Enter'] },
    { type: 'key', keys: ['Meta', 'k'] },
    { type: 'type', text: 'lofi' },
    { type: 'key', keys: ['Enter'] },
  ];

  assert.equal(requiredActionsCompleted(task, keyboardOnly), false);

  const fakeReason = 'Spotify search results for lofi are visible in the search bar';
  const rejected = canAcceptVerification(task, keyboardOnly, fakeReason);
  assert.equal(rejected.accepted, false);

  const withClick = [
    ...keyboardOnly,
    { type: 'click', x: 400, y: 300, clicks: 2 },
  ];
  const playbackReason = 'Now playing bar at the bottom shows lofi with pause button visible';
  const accepted = canAcceptVerification(task, withClick, playbackReason);
  assert.equal(accepted.accepted, true);

  console.log('✓ Spotify false-success rejection (keyboard ≠ playback)');
}

function testVerificationStrictness() {
  const task =
    'Open the YouTube playlist Dynamic Programming by Aditya Verma and play any video';
  const searchOnlyHistory = [
    { type: 'key', keys: ['Meta', 'Space'] },
    { type: 'type', text: 'Google Chrome' },
    { type: 'key', keys: ['Enter'] },
    { type: 'type', text: 'https://www.youtube.com/results?search_query=Aditya+Verma' },
    { type: 'key', keys: ['Enter'] },
  ];

  assert.equal(taskRequiresPlayback(task), true);
  assert.equal(requiredActionsCompleted(task, searchOnlyHistory), false);

  const fakeReason =
    'The browser successfully navigated to the search results for Dynamic Programming by Aditya Verma';
  const rejected = canAcceptVerification(task, searchOnlyHistory, fakeReason);
  assert.equal(rejected.accepted, false);

  const clickHistory = [
    ...searchOnlyHistory,
    { type: 'click', x: 498, y: 361 },
    { type: 'click', x: 500, y: 400 },
    { type: 'click', x: 502, y: 420 },
  ];
  const playReason =
    'I see a YouTube video playing in the player with Dynamic Programming content visible';
  const accepted = canAcceptVerification(task, clickHistory, playReason);
  assert.equal(accepted.accepted, true);

  console.log('✓ Verification strictness (no fake success on search-only)');
}

function testScenarioActions() {
  const scenarios = [
    { type: 'key', keys: ['Meta', 'Space'] },
    { type: 'type', text: 'Terminal' },
    { type: 'key', keys: ['Enter'] },
    { type: 'key', keys: ['Meta', 't'] },
    { type: 'click', x: 450, y: 320 },
  ];

  for (const action of scenarios) {
    const parsed = parseAction(action);
    assert.equal(parsed.type, action.type);
  }
  console.log('✓ Page-2 scenario action shapes (Spotlight, Chrome tab, click)');
}

testActionSchema();
testCoordinateMapping();
testApiKeyPool();
testActionNormalize();
testJsonRepair();
testTaskPlanner();
testPlaybooks();
testYoutubeTiming();
testSpotifyFalseSuccess();
testVerificationStrictness();
testScenarioActions();
console.log('\nAll verification tests passed.');
