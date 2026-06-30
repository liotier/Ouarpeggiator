/**
 * Note Scheduler Worker - Runs sequencer logic in separate thread
 *
 * Runs the sequencer clock off the main thread so timing is immune to tab
 * throttling. Notes are reported to the main thread via postMessage, which
 * forwards them on to the Juno-106 window and updates the piano roll.
 */

// Import Euclidean algorithm
import { euclidean, rotatePattern } from './euclidean.js';
// Shared sequencing core — identical note-generation logic to the main thread
import {
    isChordChangeTick,
    isStepTick,
    advanceBarChord,
    advanceStabChord,
    computeStepNotes
} from './sequencerCore.js';
// Import the Stab Mode chord sequencer (own instance, independent of main
// thread's singleton — settings are synced in via 'updateState')
import { ChordProgressionSequencer } from './chordProgressionSequencer.js';

const chordSequencer = new ChordProgressionSequencer();

// Sequencer state
let state = {
    isPlaying: false,
    bpm: 120,
    tickCount: 0,

    // Euclidean pattern
    euclidean: {
        hits: 7,
        steps: 16,
        rotation: 0,
        pattern: []
    },
    euclideanStepIndex: 0,

    // Chord progression
    chordProgression: [],
    currentChordIndex: 0,
    barsPerChord: 4,
    harmonicAdherence: 70,

    // Chord progression sequencing (Stab Mode only) — Euclidean-pattern-driven
    // chord changes, independent of and in addition to the bar-based advance above
    chordSequencing: {
        enabled: true,
        euclidean: { hits: 4, steps: 16, rotation: 0, pattern: [] },
        stepIndex: 0
    },

    // Playback mode
    playbackMode: 'arpeggio',  // 'arpeggio' | 'stab'
    octaveSpread: 1,

    // Variation
    harmonicVariation: 0,
    rhythmicVariation: 0,
    humanization: 0,

    // Velocity & Gate
    velocity: { mode: 'fixed', fixed: 100 },
    gate: { mode: 'fixed', fixed: 0.8 },
    curveSyncRotation: false,

    // Stab mode
    strumSpeed: 0,
    strumDirection: 'up',

    // Output
    outputMode: 'juno106',
    lastPlayedNote: null
};

// Pending note-offs (tick-based, immune to setTimeout throttling)
const pendingNoteOffs = [];

// Clock
let clockInterval = null;
let nextTickTime = 0;

/**
 * Start the sequencer clock
 */
function startClock() {
    if (clockInterval) return;

    nextTickTime = performance.now();

    clockInterval = setInterval(() => {
        const currentTime = performance.now();

        // Fire all ticks that should have happened.
        // tickInterval is recomputed each tick so BPM changes take effect live.
        while (state.isPlaying && nextTickTime <= currentTime) {
            handleTick();
            nextTickTime += 60000 / (state.bpm * 24);  // ms per tick
        }
    }, 5);  // 5ms precision
}

/**
 * Stop the clock
 */
function stopClock() {
    if (clockInterval) {
        clearInterval(clockInterval);
        clockInterval = null;
    }

    // Send immediate note-offs for any pending notes
    pendingNoteOffs.forEach(noff => {
        self.postMessage({
            type: 'noteOff',
            note: noff.note
        });
    });
    pendingNoteOffs.length = 0;
}

/**
 * Handle a clock tick
 */
function handleTick() {
    if (!state.isPlaying) return;

    // Process pending note-offs
    processPendingNoteOffs();

    // tickCount is processed 0-based (incremented at the end), so the first
    // tick is the downbeat (step 0).

    // Bar-based chord advancement (before the step trigger so a chord change
    // takes effect on the same tick as the step).
    if (isChordChangeTick(state)) {
        if (advanceBarChord(state)) {
            // Tell the main thread so it can update the chord grid highlight.
            self.postMessage({
                type: 'chordUpdate',
                currentChordIndex: state.currentChordIndex
            });
        }
    }

    if (isStepTick(state)) {
        executeStep();

        // Notify main thread only when the step actually advances — matches
        // the main-thread clock's own cadence (once per step, not once per
        // tick). Posting on every tick caused up to ~96 full Euclidean circle
        // SVG rebuilds/sec, starving the main thread and delaying
        // noteOn/noteOff processing (piano roll display lag).
        self.postMessage({
            type: 'tick',
            tickCount: state.tickCount,
            euclideanStepIndex: state.euclideanStepIndex
        });
    }

    state.tickCount++;
}

/**
 * Process pending note-offs
 */
function processPendingNoteOffs() {
    const now = performance.now();
    for (let i = pendingNoteOffs.length - 1; i >= 0; i--) {
        if (now >= pendingNoteOffs[i].offTime) {
            const noff = pendingNoteOffs.splice(i, 1)[0];

            self.postMessage({
                type: 'noteOff',
                note: noff.note
            });
        }
    }
}

/**
 * Execute a step in the Euclidean pattern.
 * Note generation is delegated to the shared sequencer core; this host only
 * reports chord changes back to the main thread and schedules note output.
 */
function executeStep() {
    // Stab-mode chord sequencer advancement (shared core decides; host reports)
    const stab = advanceStabChord(state, chordSequencer);
    if (stab.ran) {
        self.postMessage({
            type: 'chordUpdate',
            currentChordIndex: state.currentChordIndex,
            chordSequencingStepIndex: state.chordSequencing.stepIndex
        });
    }

    const result = computeStepNotes(state);
    if (!result.isRest) {
        result.notes.forEach(scheduleNote);
    }
}

/**
 * Schedule a single note event (from the core) for output. Honors the per-note
 * timing offset (humanization + strum); offset 0 plays immediately. The Worker
 * isn't subject to background-tab setTimeout throttling, so offsets are exact.
 */
function scheduleNote(ev) {
    if (ev.offset <= 0) {
        playNote(ev.note, ev.velocity, ev.gateLength);
    } else {
        setTimeout(() => {
            if (state.isPlaying) playNote(ev.note, ev.velocity, ev.gateLength);
        }, ev.offset);
    }
}

/**
 * Play a note
 */
function playNote(note, velocity, gateLength) {
    self.postMessage({
        type: 'noteOn',
        note: note,
        velocity: velocity,
        gateLength: gateLength,
        chordIndex: state.currentChordIndex
    });

    // Schedule note-off
    pendingNoteOffs.push({
        note: note,
        offTime: performance.now() + gateLength
    });
}

/**
 * Message handler
 */
self.onmessage = function(e) {
    const { type, data } = e.data;

    switch (type) {
        case 'start':
            state.isPlaying = true;
            state.tickCount = 0;
            state.euclideanStepIndex = 0;
            state.chordSequencing.stepIndex = 0;
            chordSequencer.reset();
            startClock();
            break;

        case 'stop':
            state.isPlaying = false;
            stopClock();
            state.tickCount = 0;
            state.euclideanStepIndex = 0;
            break;

        case 'updateState': {
            // sequencerSettings targets the chordSequencer instance, not state
            const { sequencerSettings, ...stateData } = data;

            // Merge state update
            Object.assign(state, stateData);

            if (sequencerSettings) {
                Object.assign(chordSequencer, sequencerSettings);
            }

            // Regenerate Euclidean pattern if parameters changed
            if (data.euclidean) {
                state.euclidean.pattern = rotatePattern(
                    euclidean(state.euclidean.hits, state.euclidean.steps),
                    state.euclidean.rotation
                );
            }
            break;
        }

        case 'regenerateSequencer':
            // Manual "regenerate" trigger — forces a fresh sequence even when
            // lockPattern is on (mirrors ChordProgressionSequencer.regenerate()).
            chordSequencer.regenerate(state.chordProgression);
            break;

        case 'setBPM':
            state.bpm = data.bpm;
            // Restart clock with new BPM if playing
            if (state.isPlaying) {
                stopClock();
                startClock();
            }
            break;
    }
};
