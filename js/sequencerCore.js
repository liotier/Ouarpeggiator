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

// Pulses Per Quarter-note-equivalent that the clock counts in. One bar = 4
// "beats" = PPQN ticks. (Single source of truth — see #5 for the step-timing
// implications of this value.)
export const PPQN = 96;

// ============================================================================
// Tick math
// ============================================================================

export function getTicksPerChordChange(state) {
    return PPQN * state.barsPerChord;
}

export function getTicksPerStep(state) {
    return Math.floor(PPQN / state.euclidean.steps);
}

/** True on the tick where the bar-based chord advance should run. */
export function isChordChangeTick(state) {
    return state.tickCount > 0 && state.tickCount % getTicksPerChordChange(state) === 0;
}

/** True on the tick where a Euclidean step should be evaluated. */
export function isStepTick(state) {
    return state.tickCount % getTicksPerStep(state) === 0;
}

// ============================================================================
// Chord advancement
// ============================================================================

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
    if (state.playbackMode !== 'stab' || !state.chordSequencing.enabled) {
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

function advanceEuclideanStep(state) {
    state.euclideanStepIndex = (state.euclideanStepIndex + 1) % state.euclidean.steps;
}

function computeVelocity(state) {
    let velocity = state.velocity.fixed;
    if (state.velocity.mode === 'random') {
        velocity = state.velocity.randomMin +
            Math.random() * (state.velocity.randomMax - state.velocity.randomMin);
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
    const pattern = state.euclidean.pattern;
    const chord = state.chordProgression[state.currentChordIndex];

    // Rest if: no playable chord, this step isn't a hit, or rhythmic variation
    // randomly drops it. (Short-circuit preserves the original evaluation order.)
    const isRest =
        !chord || !chord.notes || chord.empty ||
        !pattern[state.euclideanStepIndex] ||
        (state.rhythmicVariation > 0 && Math.random() * 100 < state.rhythmicVariation);

    if (isRest) {
        advanceEuclideanStep(state);
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

    advanceEuclideanStep(state);
    return { isRest: false, notes };
}
