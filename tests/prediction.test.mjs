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

  test('hit: actual within +0.5% of target', () => {
    const target = 50000;
    const actual = target * (1 + TOLERANCE); // exactly at the edge
    const { hit } = resolveOutcome(actual, target, 100, 10);
    assert.equal(hit, true);
  });

  test('hit: actual within -0.5% of target', () => {
    const target = 50000;
    const actual = target * (1 - TOLERANCE);
    const { hit } = resolveOutcome(actual, target, 100, 10);
    assert.equal(hit, true);
  });

  test('miss: actual just outside +0.5%', () => {
    const target = 50000;
    const actual = target * (1 + TOLERANCE + 0.0001); // 0.51% off
    const { hit } = resolveOutcome(actual, target, 100, 10);
    assert.equal(hit, false);
  });

  test('miss: actual just outside -0.5%', () => {
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
