/**
 * Sequencer Core - Shared, pure sequencing logic
 *
 * This module holds the note-generation decisions that MUST be identical
 * between the two playback paths:
 *   - the main thread clock (handleClockTick / executeStep in main.js)
 *   - the off-thread Web Worker (handleTick / executeStep in
 *     noteSchedulerWorker.js, used for Juno-106 / background-tab timing)
 *
 * It is deliberately free of host concerns:
 *   - no DOM access / rendering
 *   - no audio/MIDI/postMessage output
 *   - no setTimeout / scheduling
 *
 * Each host passes in its own state object (appState / worker state — they
 * share the same field shape) plus, for stab mode, its own
 * ChordProgressionSequencer instance. The core mutates the playback-position
 * fields (currentChordIndex, chordSequencing.stepIndex, euclideanStepIndex,
 * lastPlayedNote) and returns descriptors; the host decides how/when to
 * output and render. Keeping this single source of truth is what stops the
 * two paths from silently diverging (the cause of several past bugs).
 */

import { selectNextChordHarmonically } from './modules/musicTheory.js';

// Clock resolution: ticks per bar. The host clocks run at 24 PPQN (bpm*24),
// i.e. 24 ticks/beat * 4 beats = 96 ticks/bar. The Euclidean pattern spans
// exactly one bar, so its steps are distributed across this many ticks.
// IMPORTANT: tickCount is processed 0-based — the host increments it AFTER
// handling each tick, so tick 0 is the first downbeat.
export const TICKS_PER_BAR = 96;

// ============================================================================
// Tick math
// ============================================================================

export function getTicksPerChordChange(state) {
    return TICKS_PER_BAR * state.barsPerChord;
}

/** True on the tick where the bar-based chord advance should run. */
export function isChordChangeTick(state) {
    return state.tickCount > 0 && state.tickCount % getTicksPerChordChange(state) === 0;
}

/**
 * Global step index for a given tick — steps distributed proportionally across
 * the bar (floor(tick * steps / ticksPerBar)). This is what eliminates drift:
 * exactly `steps` steps fall in every 96-tick bar and realign on each downbeat,
 * even for step counts that don't divide 96 (e.g. 7, 14, 20).
 */
function globalStepIndex(tickCount, steps) {
    return Math.floor(tickCount * steps / TICKS_PER_BAR);
}

/**
 * True when this tick starts a new Euclidean step (the proportional step index
 * advanced since the previous tick). Fires step 0 on every downbeat, including
 * tick 0 (where the previous index is -1).
 */
export function isStepTick(state) {
    const steps = state.euclidean.steps;
    return globalStepIndex(state.tickCount, steps) !== globalStepIndex(state.tickCount - 1, steps);
}

// ============================================================================
// Chord advancement
// ============================================================================

/**
 * True when the Stab-mode chord sequencer (gold-ring Euclidean pattern) is
 * driving chord changes. When it is, the bar-based advance must NOT also run —
 * otherwise the two fight and the gold-ring controls appear not to take effect.
 */
export function isStabSequencerActive(state) {
    return state.playbackMode === 'stab' && state.chordSequencing.enabled;
}

/**
 * Bar-based harmonic chord advancement. Mutates state.currentChordIndex.
 * @returns {boolean} true if the progression (>1 chord) was advanced — the
 *   host should refresh the chord-grid highlight in that case.
 */
export function advanceBarChord(state) {
    if (state.chordProgression.length <= 1) return false;

    const currentChord = state.chordProgression[state.currentChordIndex];
    const currentChordObj = { notes: currentChord?.notes || [] };
    const paletteObjs = state.chordProgression.map(c => ({ notes: c?.notes || [] }));

    state.currentChordIndex = selectNextChordHarmonically(
        currentChordObj,
        paletteObjs,
        state.harmonicAdherence,
        state.currentChordIndex
    );
    return true;
}

/**
 * Stab-mode chord sequencer advancement (independent Euclidean change pattern).
 * Mutates state.currentChordIndex and state.chordSequencing.stepIndex.
 * @param {object} sequencer - the host's ChordProgressionSequencer instance
 * @returns {{ran: boolean, changed: boolean}} ran = stab sequencing was active
 *   this step; changed = the chord actually advanced.
 */
export function advanceStabChord(state, sequencer) {
    if (!isStabSequencerActive(state)) {
        return { ran: false, changed: false };
    }

    const changePattern = state.chordSequencing.euclidean.pattern;
    const changeStepIndex = state.chordSequencing.stepIndex;
    let changed = false;

    if (changePattern[changeStepIndex]) {
        state.currentChordIndex = sequencer.getNextChord(state.chordProgression);
        changed = true;
    }

    // Advance the chord-change step index (uses chord-change steps, not the
    // main pattern's steps — enables polyrhythm/flams).
    state.chordSequencing.stepIndex =
        (state.chordSequencing.stepIndex + 1) % state.chordSequencing.euclidean.steps;

    return { ran: true, changed };
}

// ============================================================================
// Per-step note computation
// ============================================================================

/**
 * Position within the pattern cycle, as a fraction [0, 1). Drives curve modes.
 * When curveSyncRotation is on, the curve's phase 0 is shifted by the same
 * rotation applied to the Euclidean pattern, so the curve's shape rotates
 * along with the pattern instead of staying pinned to raw array position 0.
 */
function curvePhase(state) {
    const steps = state.euclidean.steps;
    const shift = state.curveSyncRotation ? state.euclidean.rotation : 0;
    return (((state.euclideanStepIndex + shift) % steps) + steps) % steps / steps;
}

/** Maps phase [0,1) to shape value [0,1] for a named curve type. */
function evaluateCurve(curveType, phase) {
    switch (curveType) {
        case 'linear-descending': return 1 - phase;
        case 'exponential': return phase * phase;              // ease-in ramp
        case 'logarithmic': return Math.sqrt(phase);            // ease-out ramp
        case 'sinusoidal': return (1 - Math.cos(phase * 2 * Math.PI)) / 2; // smooth swell
        case 'triangle': return phase < 0.5 ? phase * 2 : (1 - phase) * 2; // linear swell
        case 'linear-ascending':
        default: return phase;
    }
}

function computeVelocity(state) {
    let velocity = state.velocity.fixed;
    if (state.velocity.mode === 'random') {
        velocity = state.velocity.randomMin +
            Math.random() * (state.velocity.randomMax - state.velocity.randomMin);
    } else if (state.velocity.mode === 'curve') {
        const shape = evaluateCurve(state.velocity.curveType, curvePhase(state));
        velocity = state.velocity.curveMin + shape * (state.velocity.curveMax - state.velocity.curveMin);
    }
    return Math.round(Math.max(1, Math.min(127, velocity)));
}

function computeGateLength(state) {
    // One Euclidean step spans (bar / steps); the pattern fills one bar.
    const stepDuration = (60000 / state.bpm) / (state.euclidean.steps / 4);
    let gatePercent = state.gate.fixed;
    if (state.gate.mode === 'random') {
        gatePercent = state.gate.randomMin +
            Math.random() * (state.gate.randomMax - state.gate.randomMin);
    } else if (state.gate.mode === 'curve') {
        const shape = evaluateCurve(state.gate.curveType, curvePhase(state));
        gatePercent = state.gate.curveMin + shape * (state.gate.curveMax - state.gate.curveMin);
    }
    return stepDuration * gatePercent;
}

/**
 * Humanization timing offset in ms. Always >= 0: a note is either on time or
 * slightly late (never early), so it can be scheduled as a simple delay.
 */
function computeHumanizeOffset(state) {
    return Math.max(0, (Math.random() - 0.5) * 2 * state.humanization);
}

function selectArpeggioNote(state, chord) {
    const chordSize = chord.notes.length;
    const baseNoteIndex = state.euclideanStepIndex % chordSize;
    const octaveLayer = Math.floor(state.euclideanStepIndex / chordSize) % state.octaveSpread;
    let note = chord.notes[baseNoteIndex] + (octaveLayer * 12);

    // Harmonic variation: occasionally substitute a note from the whole
    // progression, folded back to within an octave of the original.
    if (state.harmonicVariation > 0 && Math.random() * 100 < state.harmonicVariation) {
        const allNotes = state.chordProgression.filter(c => c.notes).flatMap(c => c.notes);
        if (allNotes.length > 0) {
            let substitute = allNotes[Math.floor(Math.random() * allNotes.length)];
            while (substitute < note - 12) substitute += 12;
            while (substitute > note + 12) substitute -= 12;
            note = substitute;
        }
    }

    return note;
}

function orderStabNotes(state, notes) {
    const orderedNotes = [...notes];
    if (state.strumDirection === 'down') {
        orderedNotes.reverse();
    } else if (state.strumDirection === 'alternating') {
        if (state.euclideanStepIndex % 2 === 1) {
            orderedNotes.reverse();
        }
    }
    return orderedNotes;
}

/**
 * Evaluate the current Euclidean step. Mutates state position fields
 * (euclideanStepIndex, lastPlayedNote) and returns what to play.
 *
 * @returns {{isRest: boolean, notes: Array<{note:number, velocity:number,
 *   gateLength:number, offset:number}>}} offset is the per-note delay in ms
 *   from step start (humanization + strum). A rest carries no notes.
 */
export function computeStepNotes(state) {
    // Derive the bar-locked step index for this tick (replaces the old
    // free-running counter that drifted for non-divisor step counts).
    state.euclideanStepIndex =
        globalStepIndex(state.tickCount, state.euclidean.steps) % state.euclidean.steps;

    const pattern = state.euclidean.pattern;
    const chord = state.chordProgression[state.currentChordIndex];

    // Rest if: no playable chord, this step isn't a hit, or rhythmic variation
    // randomly drops it. (Short-circuit preserves the original evaluation order.)
    const isRest =
        !chord || !chord.notes || chord.empty ||
        !pattern[state.euclideanStepIndex] ||
        (state.rhythmicVariation > 0 && Math.random() * 100 < state.rhythmicVariation);

    if (isRest) {
        return { isRest: true, notes: [] };
    }

    const velocity = computeVelocity(state);
    const gateLength = computeGateLength(state);
    const humanizeOffset = computeHumanizeOffset(state);

    let notes;
    if (state.playbackMode === 'stab') {
        const ordered = orderStabNotes(state, chord.notes);
        const strumDelay = state.strumSpeed / Math.max(1, ordered.length - 1);
        notes = ordered.map((note, idx) => ({
            note,
            velocity,
            gateLength,
            offset: humanizeOffset + idx * strumDelay
        }));
        state.lastPlayedNote = ordered[0];
    } else {
        const note = selectArpeggioNote(state, chord);
        notes = [{ note, velocity, gateLength, offset: humanizeOffset }];
        state.lastPlayedNote = note;
    }

    return { isRest: false, notes };
}
