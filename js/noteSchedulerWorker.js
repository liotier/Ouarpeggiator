/**
 * Note Scheduler Worker - Runs sequencer logic in separate thread
 *
 * Uses BroadcastChannel to send notes directly to Juno-106 tab,
 * bypassing the main thread entirely when backgrounded.
 *
 * This ensures perfect timing regardless of tab throttling.
 */

// Import Euclidean algorithm
import { euclidean, rotatePattern } from './euclidean.js';
// Import harmonic chord selection (same algorithm the main thread uses)
import { selectNextChordHarmonically } from './modules/musicTheory.js';

// BroadcastChannel for cross-tab communication (same origin only)
const noteChannel = new BroadcastChannel('ouarpeggiator-notes');

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
        noteChannel.postMessage({
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

    state.tickCount++;

    // Chord advancement (bar-based harmonic selection) — must run before the
    // step trigger so a chord change takes effect on the same tick as the step,
    // exactly as the main-thread clock does.
    const ticksPerBar = 96;
    const ticksPerChordChange = ticksPerBar * state.barsPerChord;

    if (state.tickCount > 0 && state.tickCount % ticksPerChordChange === 0 &&
        state.chordProgression.length > 1) {
        const currentChord = state.chordProgression[state.currentChordIndex];
        const currentChordObj = { notes: currentChord?.notes || [] };
        const paletteObjs = state.chordProgression.map(c => ({ notes: c?.notes || [] }));

        state.currentChordIndex = selectNextChordHarmonically(
            currentChordObj,
            paletteObjs,
            state.harmonicAdherence,
            state.currentChordIndex
        );

        // Tell the main thread so it can update the chord grid highlight.
        self.postMessage({
            type: 'chordChange',
            currentChordIndex: state.currentChordIndex
        });
    }

    // Check for step trigger
    const ticksPerStep = Math.floor(96 / state.euclidean.steps);

    if (state.tickCount % ticksPerStep === 0) {
        executeStep();
    }

    // Notify main thread about progress (for UI updates)
    self.postMessage({
        type: 'tick',
        tickCount: state.tickCount,
        euclideanStepIndex: state.euclideanStepIndex
    });
}

/**
 * Process pending note-offs
 */
function processPendingNoteOffs() {
    const now = performance.now();
    for (let i = pendingNoteOffs.length - 1; i >= 0; i--) {
        if (now >= pendingNoteOffs[i].offTime) {
            const noff = pendingNoteOffs.splice(i, 1)[0];

            // Send noteOff via BroadcastChannel
            noteChannel.postMessage({
                type: 'noteOff',
                note: noff.note
            });

            // Also notify main thread for piano roll
            self.postMessage({
                type: 'noteOff',
                note: noff.note
            });
        }
    }
}

/**
 * Execute a step in the Euclidean pattern
 */
function executeStep() {
    const pattern = state.euclidean.pattern;
    const chord = state.chordProgression[state.currentChordIndex];

    if (!chord || !chord.notes || chord.empty) {
        state.euclideanStepIndex = (state.euclideanStepIndex + 1) % state.euclidean.steps;
        return;
    }

    // Check if current step is a hit
    if (!pattern[state.euclideanStepIndex]) {
        state.euclideanStepIndex = (state.euclideanStepIndex + 1) % state.euclidean.steps;
        return;
    }

    // Apply rhythmic variation
    if (state.rhythmicVariation > 0 && Math.random() * 100 < state.rhythmicVariation) {
        state.euclideanStepIndex = (state.euclideanStepIndex + 1) % state.euclidean.steps;
        return;
    }

    // Calculate velocity
    let velocity = state.velocity.fixed;
    if (state.velocity.mode === 'random') {
        velocity = state.velocity.randomMin + Math.random() * (state.velocity.randomMax - state.velocity.randomMin);
    }
    velocity = Math.round(Math.max(1, Math.min(127, velocity)));

    // Calculate gate
    const stepDuration = (60000 / state.bpm) / (state.euclidean.steps / 4);
    let gatePercent = state.gate.fixed;
    if (state.gate.mode === 'random') {
        gatePercent = state.gate.randomMin + Math.random() * (state.gate.randomMax - state.gate.randomMin);
    }
    const gateLength = stepDuration * gatePercent;

    if (state.playbackMode === 'stab') {
        executeChordStab(chord.notes, velocity, gateLength);
    } else {
        executeArpeggioNote(chord, velocity, gateLength);
    }

    state.euclideanStepIndex = (state.euclideanStepIndex + 1) % state.euclidean.steps;
}

/**
 * Execute arpeggio note
 */
function executeArpeggioNote(chord, velocity, gateLength) {
    const chordSize = chord.notes.length;
    const baseNoteIndex = state.euclideanStepIndex % chordSize;
    const octaveLayer = Math.floor(state.euclideanStepIndex / chordSize) % state.octaveSpread;
    let note = chord.notes[baseNoteIndex] + (octaveLayer * 12);

    // Apply harmonic variation (note substitution)
    if (state.harmonicVariation > 0 && Math.random() * 100 < state.harmonicVariation) {
        const allNotes = state.chordProgression.filter(c => c.notes).flatMap(c => c.notes);
        if (allNotes.length > 0) {
            let substitute = allNotes[Math.floor(Math.random() * allNotes.length)];
            while (substitute < note - 12) substitute += 12;
            while (substitute > note + 12) substitute -= 12;
            note = substitute;
        }
    }

    playNote(note, velocity, gateLength);
    state.lastPlayedNote = note;
}

/**
 * Execute chord stab
 */
function executeChordStab(notes, velocity, gateLength) {
    let orderedNotes = [...notes];
    if (state.strumDirection === 'down') {
        orderedNotes.reverse();
    } else if (state.strumDirection === 'alternating') {
        if (state.euclideanStepIndex % 2 === 1) {
            orderedNotes.reverse();
        }
    }

    const strumDelay = state.strumSpeed / Math.max(1, orderedNotes.length - 1);

    orderedNotes.forEach((note, idx) => {
        const delay = idx * strumDelay;
        setTimeout(() => {
            playNote(note, velocity, gateLength);
        }, delay);
    });

    state.lastPlayedNote = orderedNotes[0];
}

/**
 * Play a note
 */
function playNote(note, velocity, gateLength) {
    noteChannel.postMessage({
        type: 'noteOn',
        note: note,
        velocity: velocity
    });

    // Also notify main thread for piano roll / other outputs
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
            startClock();
            break;

        case 'stop':
            state.isPlaying = false;
            stopClock();
            state.tickCount = 0;
            state.euclideanStepIndex = 0;
            break;

        case 'updateState':
            // Merge state update
            Object.assign(state, data);

            // Regenerate Euclidean pattern if parameters changed
            if (data.euclidean) {
                state.euclidean.pattern = rotatePattern(
                    euclidean(state.euclidean.hits, state.euclidean.steps),
                    state.euclidean.rotation
                );
            }
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
