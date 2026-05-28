// Pure business logic for the prediction/betting system.
// Extracted so it can be unit-tested without Vue or Firebase.

const POINTS_FLOOR = 10;
const TOLERANCE = 0.005; // ±0.5%
const WIN_MULTIPLIER = 2;

/**
 * Validates a raw bet input string against the user's available points.
 *
 * @param {string|number} betStr  Raw value from the bet input field.
 * @param {number} availablePoints  User's current points.
 * @returns {{ valid: boolean, bet: number, error: string|null }}
 */
function validateBet(betStr, availablePoints) {
  const raw = parseInt(betStr) || 0;
  if (raw <= 0) {
    return { valid: false, bet: 0, error: 'Bet must be a positive integer.' };
  }
  if (raw > availablePoints) {
    return { valid: false, bet: 0, error: `Bet (${raw}) exceeds available points (${availablePoints}).` };
  }
  return { valid: true, bet: raw, error: null };
}

/**
 * Resolves a prediction: determines hit/miss, applies payout, enforces floor.
 *
 * @param {number} actualPrice   Current market price.
 * @param {number} targetPrice   Price the user predicted.
 * @param {number} currentPoints User's points before resolution.
 * @param {number} bet           Points wagered.
 * @returns {{ hit: boolean, rawChange: number, newPoints: number, actualChange: number }}
 */
function resolveOutcome(actualPrice, targetPrice, currentPoints, bet) {
  const hit = Math.abs(actualPrice - targetPrice) / targetPrice <= TOLERANCE;
  const rawChange = hit ? bet * WIN_MULTIPLIER : -bet;
  const newPoints = Math.max(POINTS_FLOOR, currentPoints + rawChange);
  const actualChange = newPoints - currentPoints;
  return { hit, rawChange, newPoints, actualChange };
}

/**
 * Computes a user's 1-based rank on the leaderboard.
 * Only users with at least one try AND more than the floor (10p) are ranked.
 * Tiebreak: fewer tries ranks higher (more efficient).
 *
 * @param {Object} scores  Map of userId → { points, tries }.
 * @param {string} userId  The user to find.
 * @returns {number|null}  1-based rank, or null if not on the board.
 */
function computeRank(scores, userId) {
  const list = Object.entries(scores)
    .map(([id, s]) => ({ id, points: s.points || 0, tries: s.tries || 0 }))
    .filter(s => s.tries > 0 && s.points > POINTS_FLOOR)
    .sort((a, b) => b.points - a.points || a.tries - b.tries);
  const idx = list.findIndex(s => s.id === userId);
  return idx >= 0 ? idx + 1 : null;
}

module.exports = { validateBet, resolveOutcome, computeRank, POINTS_FLOOR, TOLERANCE };
