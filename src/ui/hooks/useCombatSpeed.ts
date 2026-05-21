// Single combat tempo. Per-attack-beat duration covers wind-up → tracer →
// impact → readable hold. Calibrated so the damage banner + floating number
// get ~1.6s of impact-phase visibility — gives the player time to read the
// number before the next beat takes over. The corner Skip button in
// CombatChoreographer is the escape hatch for long sequences.
export const COMBAT_STEP_MS = 2400;
