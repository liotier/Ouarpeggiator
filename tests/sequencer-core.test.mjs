/**
 * Sequencer core tests.
 *
 * The core is deliberately free of DOM/audio/MIDI concerns, so it runs under
 * plain `node --test` with no dependencies and no browser — which is why the
 * behaviour that actually decides what you hear is tested here rather than
 * through the UI.
 *
 * Run with:  node --test tests/
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
    TICKS_PER_BAR,
    isStepTick,
    isChordChangeTick,
    isStabSequencerActive,
    advanceBarChord,
    computeStepNotes,
    applyTranspose
} from '../js/sequencerCore.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const C_MAJOR = { notes: [60, 64, 67], symbol: 'I' };

/** A playable baseline state; override only what a test cares about. */
function makeState(overrides = {}) {
    const steps = overrides.steps ?? 16;
    return {
        isPlaying: true,
        bpm: 120,
        tickCount: 0,
        euclidean: { hits: steps, steps, rotation: 0, pattern: Array(steps).fill(true) },
        euclideanStepIndex: 0,
        absoluteStepIndex: 0,
        freeRunning: false,
        arpNoteOrder: 'up',
        swing: 0,
        humanization: 0,
        octaveSpread: 1,
        transposeOctaves: 0,
        playbackMode: 'arpeggio',
        chordProgression: [C_MAJOR],
        currentChordIndex: 0,
        chordOverrideIndex: null,
        chordOrderMode: 'harmonic',
        orderedProgression: [],
        progressionPos: 0,
        progressionLength: 0,
        barsPerChord: 1,
        harmonicAdherence: 100,
        voiceLeading: 'none',
        harmonicVariation: 0,
        rhythmicVariation: 0,
        velocity: { mode: 'fixed', fixed: 100 },
        gate: { mode: 'fixed', fixed: 0.8 },
        curveSyncRotation: false,
        strumSpeed: 0,
        strumDirection: 'up',
        chordSequencing: { enabled: false, euclidean: { hits: 4, steps: 16, rotation: 0, pattern: [] }, stepIndex: 0 },
        ...overrides
    };
}

/** Ticks at which a new step begins, over `bars` bars. */
function stepTicks(state, bars = 2) {
    const out = [];
    for (let t = 0; t < TICKS_PER_BAR * bars; t++) {
        state.tickCount = t;
        if (isStepTick(state)) out.push(t);
    }
    return out;
}

/** The note sounded at each of the first `n` steps. */
function notesOverSteps(state, n, ticksPerStep) {
    const out = [];
    for (let i = 0; i < n; i++) {
        state.tickCount = i * ticksPerStep;
        const r = computeStepNotes(state);
        out.push(r.isRest ? null : r.notes[0].note);
    }
    return out;
}

// ---------------------------------------------------------------------------
// Step timing
// ---------------------------------------------------------------------------

test('bar-locked: exactly `steps` steps per bar, realigning on every downbeat', () => {
    for (const steps of [4, 7, 14, 16, 20]) {
        const s = makeState({ steps });
        const ticks = stepTicks(s, 3);
        assert.equal(ticks.length, steps * 3, `${steps} steps/bar`);
        // A step must land exactly on each downbeat — this is the drift guard.
        assert.ok(ticks.includes(0) && ticks.includes(TICKS_PER_BAR) && ticks.includes(TICKS_PER_BAR * 2),
            `steps=${steps} realigns at each bar`);
    }
});

test('free-running: one step per 16th note regardless of pattern length', () => {
    const s = makeState({ steps: 7, freeRunning: true });
    const ticks = stepTicks(s, 2);
    assert.deepEqual(ticks.slice(0, 5), [0, 6, 12, 18, 24]);
    assert.equal(ticks.length, 32, 'two bars of 16ths');
});

test('free-running phases against the bar; bar-locked does not', () => {
    const barLocked = makeState({ steps: 7 });
    barLocked.tickCount = TICKS_PER_BAR;
    computeStepNotes(barLocked);
    assert.equal(barLocked.euclideanStepIndex, 0, 'bar-locked restarts the pattern at the bar');

    const free = makeState({ steps: 7, freeRunning: true });
    free.tickCount = TICKS_PER_BAR;           // 96/6 = 16 steps elapsed, 16 % 7 = 2
    computeStepNotes(free);
    assert.equal(free.euclideanStepIndex, 2, 'free-running carries its phase across the bar');
});

test('at steps=16 the two modes agree', () => {
    assert.deepEqual(stepTicks(makeState({ steps: 16 }), 2),
        stepTicks(makeState({ steps: 16, freeRunning: true }), 2));
});

// ---------------------------------------------------------------------------
// Arpeggio note order
// ---------------------------------------------------------------------------

test('note order shapes the sequence of chord tones', () => {
    const run = (arpNoteOrder) => notesOverSteps(makeState({ steps: 8, arpNoteOrder }), 8, 12);

    assert.deepEqual(run('up'), [60, 64, 67, 60, 64, 67, 60, 64]);
    assert.deepEqual(run('down'), [67, 64, 60, 67, 64, 60, 67, 64]);
    assert.deepEqual(run('updown'), [60, 64, 67, 64, 60, 64, 67, 64]);
    assert.deepEqual(run('downup'), [67, 64, 60, 64, 67, 64, 60, 64]);
    assert.deepEqual(run('converge'), [60, 67, 64, 60, 67, 64, 60, 67]);
    assert.deepEqual(run('diverge'), [64, 67, 60, 64, 67, 60, 64, 67]);
    assert.deepEqual(run('asplayed'), [60, 64, 67, 60, 64, 67, 60, 64]);
});

test('random note order only ever picks tones from the chord', () => {
    const s = makeState({ steps: 8, arpNoteOrder: 'random' });
    for (const n of notesOverSteps(s, 40, 12)) {
        assert.ok([60, 64, 67].includes(n), `${n} is a chord tone`);
    }
});

test('note order composes with octave spread', () => {
    const s = makeState({ steps: 8, arpNoteOrder: 'up', octaveSpread: 2 });
    assert.deepEqual(notesOverSteps(s, 6, 12), [60, 64, 67, 72, 76, 79]);
});

test('an unrecognised note order degrades to ascending rather than throwing', () => {
    const s = makeState({ steps: 8, arpNoteOrder: 'nonsense' });
    assert.deepEqual(notesOverSteps(s, 3, 12), [60, 64, 67]);
});

// ---------------------------------------------------------------------------
// Swing
// ---------------------------------------------------------------------------

test('swing delays offbeats only, and not at all when set to zero', () => {
    const off = (swing, step) => {
        const s = makeState({ steps: 8, swing });
        s.tickCount = step * 12;
        return computeStepNotes(s).notes[0].offset;
    };
    assert.equal(off(0, 1), 0, 'swing 0 is straight');
    assert.equal(off(100, 0), 0, 'onbeat is never delayed');
    assert.ok(off(100, 1) > 0, 'offbeat is delayed');
});

test('swing keeps alternating across the wrap of an odd-length pattern', () => {
    // Regression: parity was read from the wrapped index, so a 7-step pattern
    // put two un-swung steps back to back once per cycle and the shuffle
    // stuttered. Parity must come from the unwrapped step count.
    const s = makeState({ steps: 7, freeRunning: true, swing: 100 });
    const flags = [];
    for (let step = 0; step < 14; step++) {
        s.tickCount = step * 6;
        flags.push(computeStepNotes(s).notes[0].offset > 0 ? 1 : 0);
    }
    assert.deepEqual(flags, [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1]);
});

test('swing at 100% delays the offbeat by a third of a step', () => {
    const s = makeState({ steps: 16, swing: 100, bpm: 120 });
    s.tickCount = 6;                            // step 1
    const stepMs = (60000 / 120) / (16 / 4);    // one sixteenth at 120bpm = 125ms
    assert.ok(Math.abs(computeStepNotes(s).notes[0].offset - stepMs / 3) < 1e-9);
});

// ---------------------------------------------------------------------------
// Gate length
// ---------------------------------------------------------------------------

test('gate length follows the step duration of the active timing mode', () => {
    const barLocked = makeState({ steps: 8, bpm: 120 });
    barLocked.tickCount = 0;
    // Bar-locked: 8 steps fill a 2s bar → 250ms per step, 80% gate = 200ms.
    assert.ok(Math.abs(computeStepNotes(barLocked).notes[0].gateLength - 200) < 1e-9);

    const free = makeState({ steps: 8, bpm: 120, freeRunning: true });
    free.tickCount = 0;
    // Free-running: a step is a sixteenth = 125ms, 80% gate = 100ms.
    assert.ok(Math.abs(computeStepNotes(free).notes[0].gateLength - 100) < 1e-9);
});

// ---------------------------------------------------------------------------
// Rests
// ---------------------------------------------------------------------------

test('a pattern rest and an empty chord both yield no notes', () => {
    const rest = makeState({ steps: 4 });
    rest.euclidean.pattern = [true, false, true, false];
    rest.tickCount = TICKS_PER_BAR / 4;         // step 1 = rest
    assert.equal(computeStepNotes(rest).isRest, true);

    const empty = makeState({ chordProgression: [{ notes: [], empty: true, symbol: 'x' }] });
    assert.equal(computeStepNotes(empty).isRest, true);
});

// ---------------------------------------------------------------------------
// Transpose
// ---------------------------------------------------------------------------

test('transpose shifts whole octaves and clamps to the MIDI range', () => {
    assert.equal(applyTranspose(60, { transposeOctaves: 0 }), 60);
    assert.equal(applyTranspose(60, { transposeOctaves: 1 }), 72);
    assert.equal(applyTranspose(60, { transposeOctaves: -2 }), 36);
    assert.equal(applyTranspose(120, { transposeOctaves: 3 }), 127, 'clamped high');
    assert.equal(applyTranspose(5, { transposeOctaves: -3 }), 0, 'clamped low');
});

// ---------------------------------------------------------------------------
// Chord motion
// ---------------------------------------------------------------------------

const BLUES_ORDER = ['I7', 'I7', 'I7', 'I7', 'IV7', 'IV7', 'I7', 'I7', 'V7', 'IV7', 'I7', 'V7'];

function bluesState() {
    // Palette collapses the repeats; the ordered progression keeps them.
    const palette = [
        { notes: [60, 64, 67, 70], symbol: 'I7' },
        { notes: [65, 69, 72, 75], symbol: 'IV7' },
        { notes: [67, 71, 74, 77], symbol: 'V7' },
        { notes: [90, 94, 97], symbol: 'OUTSIDE' }   // an extended pad, not in the progression
    ];
    const bySymbol = Object.fromEntries(palette.map(c => [c.symbol, c]));
    return makeState({
        chordProgression: palette,
        orderedProgression: BLUES_ORDER.map(sym => ({ notes: bySymbol[sym].notes.slice(), symbol: sym })),
        progressionLength: BLUES_ORDER.length,
        chordOrderMode: 'inOrder'
    });
}

test('in-order mode plays the progression verbatim, repeats included, then loops', () => {
    const s = bluesState();
    const heard = [s.orderedProgression[s.progressionPos].symbol];
    for (let i = 0; i < BLUES_ORDER.length; i++) {
        advanceBarChord(s);
        heard.push(s.orderedProgression[s.progressionPos].symbol);
    }
    assert.deepEqual(heard.slice(0, 12), BLUES_ORDER, 'twelve bars as written');
    assert.equal(heard[12], 'I7', 'loops back to the top');
});

test('in-order mode keeps the grid highlight on the pad holding the sounding chord', () => {
    const s = bluesState();
    // The four opening I7 bars all map back to the single I7 pad.
    const pads = [s.currentChordIndex];
    for (let i = 0; i < 3; i++) { advanceBarChord(s); pads.push(s.currentChordIndex); }
    assert.deepEqual(pads, [0, 0, 0, 0]);
});

test('in-order mode falls back to looping the first N pads without an ordered list', () => {
    const s = makeState({
        chordProgression: [0, 1, 2, 3, 4, 5].map(i => ({ notes: [60 + i], symbol: `c${i}` })),
        chordOrderMode: 'inOrder',
        orderedProgression: [],
        progressionLength: 4
    });
    const seq = [];
    for (let i = 0; i < 6; i++) { advanceBarChord(s); seq.push(s.currentChordIndex); }
    assert.deepEqual(seq, [1, 2, 3, 0, 1, 2]);
});

test('a pad click overrides the sounding chord until the next scheduled change', () => {
    // Regression: in-order mode sounds orderedProgression[pos] and ignored
    // currentChordIndex, so clicking a pad mid-playback was audibly inert.
    const s = bluesState();
    s.tickCount = 0;
    const before = computeStepNotes(s).notes[0].note;
    assert.equal(before, 60, 'sounding the progression');

    s.currentChordIndex = 3;
    s.chordOverrideIndex = 3;                   // the OUTSIDE pad
    s.tickCount = 0;
    assert.equal(computeStepNotes(s).notes[0].note, 90, 'the click is heard');

    advanceBarChord(s);
    assert.equal(s.chordOverrideIndex, null, 'the sequencer reclaims control');
    s.tickCount = 0;
    assert.equal(computeStepNotes(s).notes[0].note, 60, 'back on the progression');
});

test('voice leading steers chord choice, and none defers to harmonic scoring', () => {
    const palette = [
        { notes: [60, 64, 67], symbol: 'cur' },
        { notes: [61, 65, 68], symbol: 'near' },   // a semitone away
        { notes: [84, 88, 91], symbol: 'far' }     // two octaves up
    ];
    const pick = (voiceLeading) => {
        const s = makeState({ chordProgression: palette, voiceLeading, harmonicAdherence: 100 });
        s.currentChordIndex = 0;
        advanceBarChord(s);
        return s.currentChordIndex;
    };
    assert.equal(pick('smooth'), 1, 'smooth takes the small move');
    assert.equal(pick('far'), 2, 'far takes the leap');
    assert.ok([1, 2].includes(pick('none')), 'none still picks a real candidate');
});

test('voice leading survives an empty current chord instead of scoring NaN', () => {
    const s = makeState({
        chordProgression: [
            { notes: [], empty: true, symbol: 'x' },
            { notes: [60, 64, 67], symbol: 'I' },
            { notes: [65, 69, 72], symbol: 'IV' }
        ],
        voiceLeading: 'smooth'
    });
    s.currentChordIndex = 0;
    assert.equal(advanceBarChord(s), true);
    assert.ok(Number.isInteger(s.currentChordIndex) && s.currentChordIndex !== 0);
});

test('a single-chord palette never advances', () => {
    const s = makeState();
    assert.equal(advanceBarChord(s), false);
    assert.equal(s.currentChordIndex, 0);
});

// ---------------------------------------------------------------------------
// Chord-change scheduling
// ---------------------------------------------------------------------------

test('bar-based chord changes land on the bar, scaled by bars-per-chord', () => {
    const s = makeState({ barsPerChord: 2 });
    const hits = [];
    for (let t = 0; t < TICKS_PER_BAR * 5; t++) {
        s.tickCount = t;
        if (isChordChangeTick(s)) hits.push(t);
    }
    assert.deepEqual(hits, [TICKS_PER_BAR * 2, TICKS_PER_BAR * 4]);
});

test('bar-based chord changes stay bar-aligned even when the pattern free-runs', () => {
    const s = makeState({ steps: 7, freeRunning: true, barsPerChord: 1 });
    const hits = [];
    for (let t = 0; t < TICKS_PER_BAR * 3; t++) {
        s.tickCount = t;
        if (isChordChangeTick(s)) hits.push(t);
    }
    assert.deepEqual(hits, [TICKS_PER_BAR, TICKS_PER_BAR * 2]);
});

test('the stab sequencer only claims chord changes in stab mode when enabled', () => {
    assert.equal(isStabSequencerActive(makeState({ playbackMode: 'arpeggio' })), false);
    assert.equal(isStabSequencerActive(makeState({
        playbackMode: 'stab',
        chordSequencing: { enabled: false, euclidean: { steps: 16 }, stepIndex: 0 }
    })), false);
    assert.equal(isStabSequencerActive(makeState({
        playbackMode: 'stab',
        chordSequencing: { enabled: true, euclidean: { steps: 16 }, stepIndex: 0 }
    })), true);
});

// ---------------------------------------------------------------------------
// Stab mode
// ---------------------------------------------------------------------------

test('stab mode sounds the whole chord, spread by strum speed', () => {
    const s = makeState({ playbackMode: 'stab', strumSpeed: 60, strumDirection: 'up' });
    s.tickCount = 0;
    const { notes } = computeStepNotes(s);
    assert.deepEqual(notes.map(n => n.note), [60, 64, 67]);
    assert.deepEqual(notes.map(n => n.offset), [0, 30, 60], 'strum spreads the entries');
});

test('strum direction reorders the stab', () => {
    const down = makeState({ playbackMode: 'stab', strumDirection: 'down' });
    down.tickCount = 0;
    assert.deepEqual(computeStepNotes(down).notes.map(n => n.note), [67, 64, 60]);
});
