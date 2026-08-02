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

import {
    selectNextChordHarmonically,
    calculateHarmonicScore,
    calculateVoiceLeadingDistance
} from './modules/musicTheory.js';

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

// Free-running step clock resolution: one step per 16th note (a fixed grid,
// independent of the bar). TICKS_PER_BAR / 16 = 6 ticks per step.
const FREE_RUN_STEP_TICKS = TICKS_PER_BAR / 16;

/**
 * Monotonic step index for a given tick.
 *
 * Bar-locked (default): steps distributed proportionally across the bar
 * (floor(tick * steps / ticksPerBar)). This eliminates drift — exactly `steps`
 * steps fall in every 96-tick bar and realign on each downbeat, even for step
 * counts that don't divide 96 (e.g. 7, 14, 20).
 *
 * Free-running (polymeter): steps advance on a fixed 16th-note grid and never
 * reset at the bar, so a pattern whose length isn't 16 phases against the bar.
 * Here `steps` is purely the pattern *length* (the wrap in computeStepNotes),
 * not the rate. At steps=16 the two modes coincide (16 sixteenths = one bar).
 */
function globalStepIndex(state, tickCount) {
    if (state.freeRunning) {
        return Math.floor(tickCount / FREE_RUN_STEP_TICKS);
    }
    return Math.floor(tickCount * state.euclidean.steps / TICKS_PER_BAR);
}

/**
 * True when this tick starts a new Euclidean step (the step index advanced
 * since the previous tick). Fires step 0 on every downbeat, including tick 0
 * (where the previous index is -1).
 */
export function isStepTick(state) {
    return globalStepIndex(state, state.tickCount) !== globalStepIndex(state, state.tickCount - 1);
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
 * Clear any pad-click chord override. Called whenever the sequencer itself
 * advances the chord — the override only holds until the next scheduled change.
 */
function clearChordOverride(state) {
    state.chordOverrideIndex = null;
}

/**
 * Voice-leading-aware chord selection (used when the Voice Leading control is
 * 'smooth' or 'far'). Blends the shared harmonic score with an explicit
 * note-movement preference, then applies the same harmonic-adherence weighting
 * shape as selectNextChordHarmonically so the two feel consistent. Lives here,
 * on the Ouarpeggiator side, so musicTheory.js stays identical across apps.
 */
function selectNextChordVoiceLed(state, palette, currentChord) {
    const candidates = [];
    for (let idx = 0; idx < palette.length; idx++) {
        if (idx === state.currentChordIndex) continue;
        const notes = palette[idx].notes;
        if (!notes || notes.length === 0) continue;
        candidates.push({
            idx,
            harmonic: calculateHarmonicScore(currentChord, palette[idx]),          // 0..100
            dist: calculateVoiceLeadingDistance(currentChord.notes, notes)         // semitones
        });
    }
    if (candidates.length === 0) return (state.currentChordIndex + 1) % palette.length;

    // Normalize note-movement distance across candidates → preference in [0,1].
    const dists = candidates.map(c => c.dist);
    const minD = Math.min(...dists);
    const rangeD = (Math.max(...dists) - minD) || 1;
    candidates.forEach(c => {
        const normDist = (c.dist - minD) / rangeD;  // 0 = closest move, 1 = farthest
        const vlPref = state.voiceLeading === 'far' ? normDist : (1 - normDist);
        c.score = 0.5 * (c.harmonic / 100) + 0.5 * vlPref;  // both in [0,1]
    });

    candidates.sort((a, b) => b.score - a.score);

    const adherence = state.harmonicAdherence;
    if (adherence >= 100) return candidates[0].idx;
    if (adherence <= 0) return candidates[Math.floor(Math.random() * candidates.length)].idx;

    // Weighted random with the same exponent curve musicTheory uses.
    const scores = candidates.map(c => c.score);
    const minS = Math.min(...scores);
    const rangeS = (Math.max(...scores) - minS) || 1;
    const exponent = 1 + adherence / 25;  // 1..5
    const weights = candidates.map(c => Math.pow((c.score - minS) / rangeS + 0.1, exponent));
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < candidates.length; i++) {
        r -= weights[i];
        if (r <= 0) return candidates[i].idx;
    }
    return candidates[0].idx;
}

/**
 * Map a chord symbol back to the palette pad that holds it, so the chord-grid
 * highlight and note colouring track the in-order progression (repeated chords
 * keep highlighting the same pad). Falls back to the current index if unmatched.
 */
function padIndexForSymbol(state, symbol) {
    if (symbol != null && state.chordProgression) {
        const i = state.chordProgression.findIndex(c => c && c.symbol === symbol);
        if (i >= 0) return i;
    }
    return state.currentChordIndex;
}

/**
 * Bar-based chord advancement. Mutates state.currentChordIndex.
 * @returns {boolean} true if the progression (>1 chord) was advanced — the
 *   host should refresh the chord-grid highlight in that case.
 */
export function advanceBarChord(state) {
    if (state.chordProgression.length <= 1) return false;

    // The sequencer is taking the wheel back from any pad-click override.
    clearChordOverride(state);

    // In-order mode: play the selected progression as written, including its
    // repeated chords (e.g. the four bars of I7 opening a 12-bar blues), rather
    // than the harmonic wander. orderedProgression is the literal voiced
    // progression with duplicates intact; currentChordIndex is mapped back to
    // the matching palette pad so the grid highlight follows along.
    if (state.chordOrderMode === 'inOrder') {
        const ordered = state.orderedProgression;
        if (ordered && ordered.length > 0) {
            state.progressionPos = (state.progressionPos + 1) % ordered.length;
            state.currentChordIndex = padIndexForSymbol(state, ordered[state.progressionPos].symbol);
        } else {
            // Fallback before the ordered list is synced: loop the first N pads.
            const n = state.progressionLength > 0
                ? Math.min(state.progressionLength, state.chordProgression.length)
                : state.chordProgression.length;
            state.currentChordIndex = (state.currentChordIndex + 1) >= n ? 0 : state.currentChordIndex + 1;
        }
        return true;
    }

    const currentChord = state.chordProgression[state.currentChordIndex];
    const currentChordObj = { notes: currentChord?.notes || [] };
    const paletteObjs = state.chordProgression.map(c => ({ notes: c?.notes || [] }));

    // Voice-leading steering ('smooth'/'far') re-ranks candidates by note
    // movement on top of the harmonic score. 'none' keeps the shared harmonic
    // selector's exact behavior (which already weights voice leading at 40%).
    // An empty current chord (an "empty" pad) has no notes to measure movement
    // from — voice-leading distance would come back NaN — so defer to the
    // harmonic selector in that case.
    if ((state.voiceLeading === 'smooth' || state.voiceLeading === 'far') &&
        currentChordObj.notes.length > 0) {
        state.currentChordIndex = selectNextChordVoiceLed(state, paletteObjs, currentChordObj);
    } else {
        state.currentChordIndex = selectNextChordHarmonically(
            currentChordObj,
            paletteObjs,
            state.harmonicAdherence,
            state.currentChordIndex
        );
    }
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
        // The sequencer is taking the wheel back from any pad-click override.
        clearChordOverride(state);
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

/**
 * Duration of one Euclidean step in ms. Bar-locked: the pattern fills one bar,
 * so a step is (bar / steps). Free-running: a fixed 16th note, independent of
 * step count (the pattern phases against the bar instead of stretching to it).
 */
function stepDurationMs(state) {
    if (state.freeRunning) {
        return 60000 / (state.bpm * 4);  // one 16th note
    }
    return (60000 / state.bpm) / (state.euclidean.steps / 4);
}

/**
 * Swing timing offset in ms. Delays offbeat steps; onbeats are untouched. At
 * swing=100 the offbeat is pushed a third of a step late (a ~2:1 long-short
 * "triplet" shuffle), scaling linearly from 0.
 *
 * Parity comes from the *unwrapped* step index, not the pattern-relative one:
 * with an odd step count the wrapped index repeats its parity across the loop
 * point (…5, 6, then 0), which would land two un-swung steps in a row and make
 * the shuffle stutter once per cycle. The unwrapped index keeps alternating.
 */
function computeSwingOffset(state) {
    const swing = state.swing || 0;
    if (swing <= 0 || state.absoluteStepIndex % 2 !== 1) return 0;
    return (swing / 100) * (stepDurationMs(state) / 3);
}

function computeGateLength(state) {
    const stepDuration = stepDurationMs(state);
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

/**
 * Build the ordered list of candidate notes for one chord, spanning the octave
 * spread, in the requested note-order. 'up'/'down' and the compound orders work
 * on pitch-sorted notes so they mean what a player expects regardless of the
 * chord's stored voicing; 'as-played' preserves the stored voicing order (the
 * pre-note-order behavior). The list is indexed per step (or picked at random).
 */
function buildArpSequence(chordNotes, octaveSpread, order) {
    const layered = [];
    for (let o = 0; o < octaveSpread; o++) {
        for (let i = 0; i < chordNotes.length; i++) layered.push(chordNotes[i] + o * 12);
    }
    if (order === 'asplayed') return layered;

    const ascending = layered.slice().sort((a, b) => a - b);
    switch (order) {
        case 'down':
            return ascending.reverse();
        case 'updown':  // ascend then descend, endpoints not repeated
            return ascending.concat(ascending.slice(1, -1).reverse());
        case 'downup': {
            const desc = ascending.slice().reverse();
            return desc.concat(ascending.slice(1, -1));
        }
        case 'converge': {  // outside-in: low, high, next-low, next-high, ...
            const res = [];
            let lo = 0, hi = ascending.length - 1;
            while (lo <= hi) {
                res.push(ascending[lo]);
                if (lo !== hi) res.push(ascending[hi]);
                lo++; hi--;
            }
            return res;
        }
        case 'diverge': {  // inside-out: middle outward
            const res = [];
            let lo = Math.floor((ascending.length - 1) / 2);
            let hi = lo + 1;
            while (lo >= 0 || hi < ascending.length) {
                if (lo >= 0) res.push(ascending[lo--]);
                if (hi < ascending.length) res.push(ascending[hi++]);
            }
            return res;
        }
        case 'up':
        case 'random':
        default:
            return ascending;
    }
}

function selectArpeggioNote(state, chord) {
    const order = state.arpNoteOrder || 'up';
    const sequence = buildArpSequence(chord.notes, Math.max(1, state.octaveSpread), order);

    let note = order === 'random'
        ? sequence[Math.floor(Math.random() * sequence.length)]
        : sequence[state.euclideanStepIndex % sequence.length];

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

/**
 * Live octave transpose, applied to every note right before output. Whole
 * octaves only (key select regenerates the progression's own voicings — this
 * is a separate, real-time shift on top of whatever was generated). Clamped
 * to the valid MIDI note range.
 */
export function applyTranspose(note, state) {
    const shifted = note + (state.transposeOctaves || 0) * 12;
    return Math.max(0, Math.min(127, shifted));
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
 * The chord to sound this step, in priority order:
 *   1. a pad-click override (jumpToChord), which holds only until the sequencer
 *      makes its next scheduled chord change;
 *   2. in-order mode: the literal progression entry (repeats preserved), which
 *      carries its own per-position voicing and so is not interchangeable with
 *      the collapsed palette pad;
 *   3. otherwise the current palette pad.
 */
function currentPlayChord(state) {
    const override = state.chordOverrideIndex;
    if (override != null && state.chordProgression[override]) {
        return state.chordProgression[override];
    }
    if (state.chordOrderMode === 'inOrder' &&
        state.orderedProgression && state.orderedProgression.length > 0) {
        return state.orderedProgression[state.progressionPos % state.orderedProgression.length];
    }
    return state.chordProgression[state.currentChordIndex];
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
    // Derive the pattern step index for this tick (bar-locked or free-running,
    // see globalStepIndex). absoluteStepIndex is the unwrapped count since
    // playback started (swing parity reads it); euclideanStepIndex is that
    // wrapped into the pattern length (pattern lookup and curves read it).
    state.absoluteStepIndex = globalStepIndex(state, state.tickCount);
    state.euclideanStepIndex = state.absoluteStepIndex % state.euclidean.steps;

    const pattern = state.euclidean.pattern;
    const chord = currentPlayChord(state);

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
    // Base timing offset for the step: humanization jitter + swing shuffle.
    const baseOffset = computeHumanizeOffset(state) + computeSwingOffset(state);

    let notes;
    if (state.playbackMode === 'stab') {
        const ordered = orderStabNotes(state, chord.notes);
        const strumDelay = state.strumSpeed / Math.max(1, ordered.length - 1);
        notes = ordered.map((note, idx) => ({
            note: applyTranspose(note, state),
            velocity,
            gateLength,
            offset: baseOffset + idx * strumDelay
        }));
        state.lastPlayedNote = notes[0].note;
    } else {
        const note = applyTranspose(selectArpeggioNote(state, chord), state);
        notes = [{ note, velocity, gateLength, offset: baseOffset }];
        state.lastPlayedNote = note;
    }

    return { isRest: false, notes };
}
