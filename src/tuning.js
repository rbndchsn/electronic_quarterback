// Every value the 1978 manual does not specify lives here.
// Change feel by editing this table; the rules engine never needs touching.

export const TUNING = {
  // Real milliseconds per 0.1 simulated minute. 600 means a quarter is 90 s of live play.
  msPerClockTenth: 600,

  // How often the defense gets a turn (ms), per skill level.
  defenderIntervalMs: { 1: 900, 2: 560 },
  // Chance that a given tackler steps on a defensive turn, per skill level.
  defenderMoveProb: { 1: 0.38, 2: 0.48 },
  // Chance that a pass defender steps on a defensive turn before the throw.
  passDefenderMoveProb: { 1: 0.28, 2: 0.45 },

  // Pass and kick animation speed (ms per yard column).
  flightStepMs: 70,
  kickStepMs: 60,

  // Field goals: certain-ish inside sureYards from the goal line, impossible beyond maxYards.
  fieldGoal: { sureYards: 5, maxYards: 45, maxProb: 0.95 },
  // Punt distance range in yards (a missed field goal is automatically a punt).
  punt: { min: 30, max: 50 },

  // Kickoffs: chance of a short kick that must be run back, and where that runback starts.
  shortKickoffChance: 0.15,
  runbackStartYard: 10,
};
