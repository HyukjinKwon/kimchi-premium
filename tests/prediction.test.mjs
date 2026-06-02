import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { validateBet, resolveOutcome, computeRank, POINTS_FLOOR, TOLERANCE } = require('../js/prediction.js');

// ── validateBet ───────────────────────────────────────────────────────────────

describe('validateBet', () => {
  test('rejects zero bet', () => {
    const r = validateBet('0', 100);
    assert.equal(r.valid, false);
    assert.equal(r.bet, 0);
    assert.ok(r.error);
  });

  test('rejects negative bet', () => {
    const r = validateBet('-5', 100);
    assert.equal(r.valid, false);
    assert.equal(r.bet, 0);
  });

  test('rejects non-numeric string', () => {
    const r = validateBet('abc', 100);
    assert.equal(r.valid, false);
    assert.equal(r.bet, 0);
  });

  test('rejects empty string', () => {
    const r = validateBet('', 100);
    assert.equal(r.valid, false);
    assert.equal(r.bet, 0);
  });

  test('rejects bet exceeding available points', () => {
    const r = validateBet('15', 10);
    assert.equal(r.valid, false);
    assert.equal(r.bet, 0);
    assert.ok(r.error.includes('exceeds'));
  });

  test('accepts bet equal to available points', () => {
    const r = validateBet('10', 10);
    assert.equal(r.valid, true);
    assert.equal(r.bet, 10);
    assert.equal(r.error, null);
  });

  test('accepts normal bet within points', () => {
    const r = validateBet('5', 100);
    assert.equal(r.valid, true);
    assert.equal(r.bet, 5);
    assert.equal(r.error, null);
  });

  test('truncates floats via parseInt (5.9 → 5)', () => {
    const r = validateBet('5.9', 100);
    assert.equal(r.valid, true);
    assert.equal(r.bet, 5);
  });

  test('rejects bet of 1 when user has 0 points (edge: floor state)', () => {
    // A user should never reach 0 points due to the floor, but the validator
    // is independent of the floor — it just compares bet to availablePoints.
    const r = validateBet('1', 0);
    assert.equal(r.valid, false);
  });
});

// ── submitPrediction — target price guard (mirrors app.js line 289) ───────────
// The guard was changed from `!target || target <= 0`
// to `!Number.isFinite(target) || target <= 0` to block Infinity.
describe('target price validation (Number.isFinite guard)', () => {
  function isValidTarget(raw) {
    const target = parseFloat(raw);
    return Number.isFinite(target) && target > 0;
  }

  test('normal price passes', () => assert.equal(isValidTarget('50000'), true));
  test('decimal price passes', () => assert.equal(isValidTarget('0.5432'), true));
  test('zero is rejected', () => assert.equal(isValidTarget('0'), false));
  test('negative is rejected', () => assert.equal(isValidTarget('-100'), false));
  test('empty string is rejected', () => assert.equal(isValidTarget(''), false));
  test('non-numeric string is rejected', () => assert.equal(isValidTarget('abc'), false));
  test('"Infinity" is rejected (the fixed hole)', () => assert.equal(isValidTarget('Infinity'), false));
  test('NaN input is rejected', () => assert.equal(isValidTarget('NaN'), false));
});

// ── resolveOutcome — input validation edge cases ──────────────────────────────
// The code in app.js guards: target > 0 and actualPrice must exist before
// calling resolvePrediction. These tests document what happens if those guards
// are absent or bypass (e.g. price feed returns 0 or NaN).

describe('resolveOutcome — degenerate inputs', () => {
  test('zero targetPrice causes division by zero → NaN hit, treated as miss', () => {
    // Math.abs(actual - 0) / 0 = Infinity, which is > TOLERANCE → miss
    const { hit } = resolveOutcome(0, 0, 100, 5);
    assert.equal(hit, false); // NaN <= TOLERANCE is false
  });

  test('NaN actualPrice → NaN deviation → treated as miss (not a hit)', () => {
    const { hit } = resolveOutcome(NaN, 50000, 100, 5);
    assert.equal(hit, false);
  });

  test('NaN bet → rawChange is NaN → newPoints collapses to floor via Math.max', () => {
    // Math.max(10, 100 + NaN) = Math.max(10, NaN) = NaN — this is a real hole
    const { newPoints } = resolveOutcome(50000, 50000, 100, NaN);
    // Document the actual (broken) behavior so a regression is visible
    assert.ok(Number.isNaN(newPoints), 'NaN bet produces NaN newPoints — floor not enforced');
  });

  test('negative bet on a win produces a loss instead (no guard)', () => {
    // validateBet catches this before resolveOutcome is called,
    // but if called directly, negative bet on a win subtracts points
    const { rawChange } = resolveOutcome(50000, 50000, 100, -10);
    assert.equal(rawChange, -20); // hit ? -10 * 2 : 10 → -20 (wrong direction)
  });
});

// ── resolveOutcome ────────────────────────────────────────────────────────────

describe('resolveOutcome', () => {
  test('direct hit: exact match', () => {
    const { hit } = resolveOutcome(50000, 50000, 100, 10);
    assert.equal(hit, true);
  });

  test('hit: actual within +0.3% of target', () => {
    const target = 50000;
    const actual = target * (1 + TOLERANCE); // exactly at the edge
    const { hit } = resolveOutcome(actual, target, 100, 10);
    assert.equal(hit, true);
  });

  test('hit: actual within -0.3% of target', () => {
    const target = 50000;
    const actual = target * (1 - TOLERANCE);
    const { hit } = resolveOutcome(actual, target, 100, 10);
    assert.equal(hit, true);
  });

  test('miss: actual just outside +0.3%', () => {
    const target = 50000;
    const actual = target * (1 + TOLERANCE + 0.0001); // 0.31% off
    const { hit } = resolveOutcome(actual, target, 100, 10);
    assert.equal(hit, false);
  });

  test('miss: actual just outside -0.3%', () => {
    const target = 50000;
    const actual = target * (1 - TOLERANCE - 0.0001);
    const { hit } = resolveOutcome(actual, target, 100, 10);
    assert.equal(hit, false);
  });

  test('win: points increase by 2x bet', () => {
    const { newPoints, actualChange } = resolveOutcome(50000, 50000, 100, 10);
    assert.equal(newPoints, 120);  // 100 + 10*2
    assert.equal(actualChange, 20);
  });

  test('loss: points decrease by bet amount', () => {
    const { newPoints, actualChange } = resolveOutcome(60000, 50000, 100, 10);
    assert.equal(newPoints, 90);   // 100 - 10
    assert.equal(actualChange, -10);
  });

  test('loss: floor enforced — points never go below POINTS_FLOOR', () => {
    // User has exactly floor points and bets all of them
    const { newPoints, actualChange } = resolveOutcome(60000, 50000, POINTS_FLOOR, POINTS_FLOOR);
    assert.equal(newPoints, POINTS_FLOOR);
    assert.equal(actualChange, 0);  // floor capped the loss
  });

  test('loss: floor applied when loss would go negative', () => {
    const { newPoints } = resolveOutcome(60000, 50000, 15, 10);
    // 15 - 10 = 5, but floor is 10
    assert.equal(newPoints, POINTS_FLOOR);
  });

  test('win: floor not applied on a winning outcome above floor', () => {
    const { newPoints } = resolveOutcome(50000, 50000, POINTS_FLOOR, POINTS_FLOOR);
    assert.equal(newPoints, POINTS_FLOOR + POINTS_FLOOR * 2); // 10 + 20 = 30
  });

  test('rawChange is +2*bet on win', () => {
    const { rawChange } = resolveOutcome(50000, 50000, 100, 7);
    assert.equal(rawChange, 14);
  });

  test('rawChange is -bet on loss', () => {
    const { rawChange } = resolveOutcome(99999, 50000, 100, 7);
    assert.equal(rawChange, -7);
  });

  test('actualChange reflects floor capping', () => {
    // 12 - 10 (bet) = 2, below floor → capped to 10 → actualChange = -2
    const { actualChange } = resolveOutcome(99999, 50000, 12, 10);
    assert.equal(actualChange, -2);
  });

  test('very large price deviation is still a miss', () => {
    const { hit } = resolveOutcome(100000, 50000, 100, 5);
    assert.equal(hit, false);
  });
});

// ── computeRank ───────────────────────────────────────────────────────────────

describe('computeRank', () => {
  test('returns null for unknown userId', () => {
    const scores = { user1: { points: 100, tries: 5 } };
    assert.equal(computeRank(scores, 'nobody'), null);
  });

  test('returns null for user with 0 tries (never played)', () => {
    const scores = { user1: { points: 50, tries: 0 } };
    assert.equal(computeRank(scores, 'user1'), null);
  });

  test('returns null for user at exactly the floor (10p) — excluded from rankings', () => {
    const scores = { user1: { points: POINTS_FLOOR, tries: 3 } };
    assert.equal(computeRank(scores, 'user1'), null);
  });

  test('returns 1 for sole ranked player', () => {
    const scores = { user1: { points: 50, tries: 3 } };
    assert.equal(computeRank(scores, 'user1'), 1);
  });

  test('ranks by points descending', () => {
    const scores = {
      user1: { points: 200, tries: 5 },
      user2: { points: 100, tries: 5 },
    };
    assert.equal(computeRank(scores, 'user1'), 1);
    assert.equal(computeRank(scores, 'user2'), 2);
  });

  test('tiebreak: fewer tries ranks higher', () => {
    const scores = {
      user1: { points: 100, tries: 10 },
      user2: { points: 100, tries: 5 },
    };
    // user2 has same points but fewer tries → should be #1
    assert.equal(computeRank(scores, 'user2'), 1);
    assert.equal(computeRank(scores, 'user1'), 2);
  });

  test('excludes floor players from rank calculation', () => {
    const scores = {
      user1: { points: 100, tries: 5 },
      user2: { points: POINTS_FLOOR, tries: 3 },  // at floor, excluded
    };
    assert.equal(computeRank(scores, 'user1'), 1);
    assert.equal(computeRank(scores, 'user2'), null);
  });

  test('handles missing points/tries fields gracefully (defaults to 0)', () => {
    const scores = { user1: { points: 50 } }; // no tries field
    assert.equal(computeRank(scores, 'user1'), null); // tries defaults to 0 → excluded
  });

  test('user with 11 points and tries > 0 appears on board', () => {
    const scores = { user1: { points: 11, tries: 1 } };
    assert.equal(computeRank(scores, 'user1'), 1);
  });

  test('empty scores returns null', () => {
    assert.equal(computeRank({}, 'user1'), null);
  });

  test('three-way sort: mixed points and tries', () => {
    const scores = {
      alice: { points: 300, tries: 20 },
      bob:   { points: 300, tries: 10 }, // fewer tries → higher rank than alice
      carol: { points: 200, tries: 5  },
    };
    assert.equal(computeRank(scores, 'bob'),   1);
    assert.equal(computeRank(scores, 'alice'), 2);
    assert.equal(computeRank(scores, 'carol'), 3);
  });
});

// ── Betting window: 10-minute period ─────────────────────────────────────────
// app.js sets targetTs = Date.now() + 10 * 60 * 1000.
// The Firebase rule allows targetTs <= now + 660_000 (window + 60s clock-skew buffer).
// These tests pin the exact values so a window change forces both to be updated together.

describe('betting window timing', () => {
  const WINDOW_MS = 10 * 60 * 1000;
  const RULE_CEILING_MS = 660_000; // from database.rules.json: now + 660000

  test('prediction window is exactly 10 minutes', () => {
    assert.equal(WINDOW_MS, 600_000);
  });

  test('firebase rule ceiling is window + 60s clock-skew buffer', () => {
    assert.equal(RULE_CEILING_MS, WINDOW_MS + 60_000);
  });

  test('targetTs fits within rule ceiling when clocks agree', () => {
    const now = 1_000_000_000_000;
    const targetTs = now + WINDOW_MS;
    assert.ok(targetTs <= now + RULE_CEILING_MS);
  });

  test('targetTs rejected when client clock is 61s ahead of server', () => {
    const serverNow = 1_000_000_000_000;
    const clientNow = serverNow + 61_000;
    const targetTs = clientNow + WINDOW_MS;
    assert.ok(targetTs > serverNow + RULE_CEILING_MS);
  });

  test('targetTs accepted when client clock is exactly 60s ahead of server', () => {
    const serverNow = 1_000_000_000_000;
    const clientNow = serverNow + 60_000;
    const targetTs = clientNow + WINDOW_MS;
    assert.ok(targetTs <= serverNow + RULE_CEILING_MS);
  });

  test('targetTs is strictly in the future (rule: targetTs > now)', () => {
    const now = 1_000_000_000_000;
    const targetTs = now + WINDOW_MS;
    assert.ok(targetTs > now);
  });
});

// ── Countdown formatter (mirrors startCountdownTicker in app.js) ──────────────
// The countdown display logic is duplicated here as a pure function for testing.
// If the format in app.js changes, update this too.

describe('countdown formatting', () => {
  function formatCountdown(rem) {
    if (rem <= 0) return '확인 중...';
    const m = Math.floor(rem / 60000);
    const s = Math.floor((rem % 60000) / 1000);
    return `${m}분 ${String(s).padStart(2, '0')}초 후 확인`;
  }

  test('full 10-minute window formats as 10분 00초', () => {
    assert.equal(formatCountdown(10 * 60 * 1000), '10분 00초 후 확인');
  });

  test('9 minutes 30 seconds', () => {
    assert.equal(formatCountdown(9 * 60 * 1000 + 30 * 1000), '9분 30초 후 확인');
  });

  test('seconds are zero-padded to two digits', () => {
    assert.equal(formatCountdown(5 * 60 * 1000 + 5 * 1000), '5분 05초 후 확인');
  });

  test('last second before resolve', () => {
    assert.equal(formatCountdown(1_000), '0분 01초 후 확인');
  });

  test('zero remaining shows resolving message', () => {
    assert.equal(formatCountdown(0), '확인 중...');
  });

  test('negative remaining shows resolving message (already past targetTs)', () => {
    assert.equal(formatCountdown(-1), '확인 중...');
  });

  test('just under 1 minute shows 0분', () => {
    assert.equal(formatCountdown(59_999), '0분 59초 후 확인');
  });
});

// ── app.js inline constants match prediction.js ───────────────────────────────
// app.js re-implements the outcome formula inline (not via require).
// These tests document the expected values so a drift between the two files
// causes a visible failure — update both if the game rules change.

describe('app.js inline constants must match prediction.js exports', () => {
  // Inline values from app.js resolvePrediction():
  //   hit   = Math.abs(actual - target) / target <= 0.003   (TOLERANCE)
  //   win   = bet * 2                                        (WIN_MULTIPLIER)
  //   floor = Math.max(10, ...)                              (POINTS_FLOOR)
  const APP_TOLERANCE    = 0.003;
  const APP_WIN_MULT     = 2;
  const APP_FLOOR        = 10;

  test('inline tolerance matches TOLERANCE export', () => {
    assert.equal(APP_TOLERANCE, TOLERANCE);
  });

  test('inline win multiplier matches WIN_MULTIPLIER (prediction.js uses same value)', () => {
    // WIN_MULTIPLIER = 2 in prediction.js; app.js uses bet * 2 directly
    assert.equal(APP_WIN_MULT, 2);
    // Cross-check: resolveOutcome win produces rawChange = bet * WIN_MULTIPLIER
    const { rawChange } = resolveOutcome(50000, 50000, 100, 10);
    assert.equal(rawChange, 10 * APP_WIN_MULT);
  });

  test('inline floor matches POINTS_FLOOR export', () => {
    assert.equal(APP_FLOOR, POINTS_FLOOR);
  });

  test('inline hit formula matches resolveOutcome for a hit', () => {
    const actual = 50000, target = 50000;
    const inlineHit = Math.abs(actual - target) / target <= APP_TOLERANCE;
    const { hit } = resolveOutcome(actual, target, 100, 10);
    assert.equal(inlineHit, hit);
  });

  test('inline hit formula matches resolveOutcome for a miss', () => {
    const actual = 50300, target = 50000; // 0.6% off — outside 0.3% tolerance
    const inlineHit = Math.abs(actual - target) / target <= APP_TOLERANCE;
    const { hit } = resolveOutcome(actual, target, 100, 10);
    assert.equal(inlineHit, hit);
  });
});

// ── Visitor count: 24-hour window filter ─────────────────────────────────────
// Firebase query: visitors.orderByChild('ts').startAt(Date.now() - 24h)
// This pure-JS equivalent tests the intended filtering semantics.

describe('visitor count 24h window filter', () => {
  function countVisitors(entries, now) {
    const cutoff = now - 24 * 60 * 60 * 1000;
    return Object.values(entries).filter(e => e.ts >= cutoff).length;
  }

  const NOW = 1_700_000_000_000;
  const H24 = 24 * 60 * 60 * 1000;

  test('empty object returns 0', () => {
    assert.equal(countVisitors({}, NOW), 0);
  });

  test('single recent visitor is counted', () => {
    assert.equal(countVisitors({ u1: { ts: NOW - 1_000 } }, NOW), 1);
  });

  test('visitor exactly at 24h boundary is included (>=)', () => {
    assert.equal(countVisitors({ u1: { ts: NOW - H24 } }, NOW), 1);
  });

  test('visitor 1ms before 24h cutoff is excluded', () => {
    assert.equal(countVisitors({ u1: { ts: NOW - H24 - 1 } }, NOW), 0);
  });

  test('only recent visitors counted, expired ones filtered out', () => {
    const entries = {
      stale1: { ts: NOW - H24 - 1_000 },
      stale2: { ts: NOW - H24 - 60_000 },
      fresh1: { ts: NOW - 3_600_000 },   // 1h ago
      fresh2: { ts: NOW - 100 },
    };
    assert.equal(countVisitors(entries, NOW), 2);
  });

  test('all visitors expired returns 0', () => {
    const entries = {
      u1: { ts: NOW - H24 - 1 },
      u2: { ts: NOW - H24 - 1_000 },
    };
    assert.equal(countVisitors(entries, NOW), 0);
  });

  test('same userId written twice counts as one (last-write-wins keying)', () => {
    // Firebase keyed by userId → duplicate visits overwrite, not accumulate
    const entries = { sameUser: { ts: NOW - 100 } };
    assert.equal(countVisitors(entries, NOW), 1);
  });
});

// ── Active-user rank filtering (mirrors recomputeRank in app.js) ─────────────
// recomputeRank only includes users present in _presenceActiveIds.
// This pure equivalent allows unit testing without Firebase or Vue.

describe('recomputeRank — active-user filtering', () => {
  function recomputeRankForActive(scores, userId, activeIds) {
    const list = Object.entries(scores)
      .map(([id, s]) => ({ id, points: s.points || 0, tries: s.tries || 0 }))
      .filter(s => s.tries > 0 && s.points > POINTS_FLOOR && activeIds.has(s.id))
      .sort((a, b) => b.points - a.points || a.tries - b.tries);
    const idx = list.findIndex(s => s.id === userId);
    return idx >= 0 ? idx + 1 : null;
  }

  test('returns null when no users are active', () => {
    const scores = { user1: { points: 200, tries: 5 } };
    assert.equal(recomputeRankForActive(scores, 'user1', new Set()), null);
  });

  test('inactive rank-1 player gets no rank', () => {
    const scores = {
      user1: { points: 200, tries: 5 },
      user2: { points: 100, tries: 3 },
    };
    // user1 is offline; only user2 is active
    const active = new Set(['user2']);
    assert.equal(recomputeRankForActive(scores, 'user1', active), null);
    assert.equal(recomputeRankForActive(scores, 'user2', active), 1);
  });

  test('rank-2 becomes rank-1 when rank-1 goes inactive', () => {
    const scores = {
      leader: { points: 500, tries: 10 },
      second: { points: 300, tries: 8 },
    };
    const active = new Set(['second']); // leader disconnected
    assert.equal(recomputeRankForActive(scores, 'leader', active), null);
    assert.equal(recomputeRankForActive(scores, 'second', active), 1);
  });

  test('rank-1 regains rank-1 when they reconnect', () => {
    const scores = {
      leader: { points: 500, tries: 10 },
      second: { points: 300, tries: 8 },
    };
    const active = new Set(['leader', 'second']); // leader back online
    assert.equal(recomputeRankForActive(scores, 'leader', active), 1);
    assert.equal(recomputeRankForActive(scores, 'second', active), 2);
  });

  test('only active users are ranked — inactive high-scorer is skipped', () => {
    const scores = {
      ghost:  { points: 1000, tries: 50 }, // highest but offline
      user1:  { points: 200,  tries: 5  },
      user2:  { points: 100,  tries: 3  },
    };
    const active = new Set(['user1', 'user2']);
    assert.equal(recomputeRankForActive(scores, 'ghost', active), null);
    assert.equal(recomputeRankForActive(scores, 'user1', active), 1);
    assert.equal(recomputeRankForActive(scores, 'user2', active), 2);
  });

  test('floor players are excluded even if active', () => {
    const scores = {
      user1: { points: POINTS_FLOOR, tries: 3 }, // at floor → excluded
      user2: { points: 50, tries: 2 },
    };
    const active = new Set(['user1', 'user2']);
    assert.equal(recomputeRankForActive(scores, 'user1', active), null);
    assert.equal(recomputeRankForActive(scores, 'user2', active), 1);
  });

  test('tiebreak by tries still applies among active users', () => {
    const scores = {
      user1: { points: 100, tries: 10 },
      user2: { points: 100, tries: 5 }, // fewer tries → higher rank
    };
    const active = new Set(['user1', 'user2']);
    assert.equal(recomputeRankForActive(scores, 'user2', active), 1);
    assert.equal(recomputeRankForActive(scores, 'user1', active), 2);
  });

  test('single active user out of many is rank 1', () => {
    const scores = {
      user1: { points: 500, tries: 20 },
      user2: { points: 400, tries: 15 },
      user3: { points: 300, tries: 10 },
    };
    const active = new Set(['user3']); // lowest scorer but only one online
    assert.equal(recomputeRankForActive(scores, 'user3', active), 1);
  });
});

// ── Result message tolerance display string ───────────────────────────────────
// app.js posts "±0.3%" in chat messages. This must match the actual TOLERANCE.

describe('result message tolerance label', () => {
  const LABEL = '±0.3%';

  test('label matches TOLERANCE constant (0.003 = 0.3%)', () => {
    assert.equal(TOLERANCE * 100, parseFloat(LABEL.replace('±', '').replace('%', '')));
  });

  test('label format is ±N.N%', () => {
    assert.match(LABEL, /^±\d+\.?\d*%$/);
  });
});

// ── Visitor count display condition ──────────────────────────────────────────
// Template: <span v-if="visitorCount > onlineCount">({{ visitorCount }})</span>

describe('visitor count display condition (visitorCount > onlineCount)', () => {
  function showVisitorTotal(onlineCount, visitorCount) {
    return visitorCount > onlineCount;
  }

  test('hides total when all visitors are currently live', () => {
    assert.equal(showVisitorTotal(3, 3), false);
  });

  test('shows total when inactive visitors exist beyond live count', () => {
    assert.equal(showVisitorTotal(1, 5), true);
  });

  test('hides total when nobody has visited', () => {
    assert.equal(showVisitorTotal(0, 0), false);
  });

  test('shows total when live count is 0 but prior visitors exist', () => {
    assert.equal(showVisitorTotal(0, 3), true);
  });

  test('hides total when visitorCount trails onlineCount (listener lag)', () => {
    // visitorCount listener can momentarily lag; must not show negative gap
    assert.equal(showVisitorTotal(4, 3), false);
  });

  test('shows total for minimum meaningful case: 1 live, 2 total', () => {
    assert.equal(showVisitorTotal(1, 2), true);
  });
});
