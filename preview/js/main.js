/**
 * Ouarpeggiator - Main Application Module
 *
 * Entry point that initializes the application, manages state,
 * and coordinates between MIDI, arpeggiator, and UI modules.
 *
 * French phonetic spelling of "warp" + arpeggiator - referencing
 * time manipulation and phase distortion through Euclidean rhythms.
 */

import { euclidean, rotatePattern } from './euclidean.js';
import * as MIDI from './midi.js';
import * as Arpeggiator from './arpeggiator.js';
import * as UI from './ui.js';

// ============================================================================
// Application State
// ============================================================================

const appState = {
    // Chord progression data
    chordProgression: [
        [60, 64, 67],     // C major
        [57, 60, 64],     // A minor
        [65, 69, 72],     // F major
        [62, 65, 69],     // D minor
    ],
    currentChordIndex: 0,

    // Euclidean pattern parameters
    euclidean: {
        hits: 7,
        steps: 16,
        rotation: 0,
        pattern: [],      // Computed boolean array
    },
    octaveSpread: 1,      // How many octaves to span (1-4)

    // Timing
    clock: {
        mode: 'master',   // 'master' | 'slave'
        bpm: 120,
        isPlaying: false,
        tickCount: 0,     // For bar counting (24 PPQN)
        lastTickTime: 0,  // For clock loss detection in slave mode
    },
    barsPerChord: 4,      // Bars before advancing to next chord
    humanization: 0,      // Timing offset in milliseconds

    // Variation parameters
    harmonicVariation: 0.0,   // Probability of note substitution (0-1)
    rhythmicVariation: 0.0,   // Probability of rest insertion (0-1)
    voiceLeading: 'smooth',   // 'smooth' | 'far' | 'none'
    lastPlayedNote: null,     // For voice leading calculations

    // Velocity configuration
    velocity: {
        mode: 'fixed',        // 'fixed' | 'random' | 'curve'
        fixed: 100,
        randomMin: 60,
        randomMax: 110,
        curveType: 'linear-ascending',
        curveMin: 60,
        curveMax: 120,
    },

    // Gate configuration
    gate: {
        mode: 'fixed',
        fixed: 0.8,           // Percentage of step duration
        randomMin: 0.5,
        randomMax: 0.9,
        curveType: 'linear-ascending',
        curveMin: 0.3,
        curveMax: 0.95,
    },

    // Runtime state
    euclideanStepIndex: 0,    // Current position in pattern
    scheduledNotes: [],       // Active notes for cleanup
};

// ============================================================================
// Master Clock Management
// ============================================================================

let masterClockInterval = null;
let clockLossCheckInterval = null;

/**
 * Start the master clock
 */
function startMasterClock() {
    if (masterClockInterval) return;

    // Calculate tick interval: 24 PPQN (pulses per quarter note)
    const tickInterval = 60000 / (appState.clock.bpm * 24);

    // Send MIDI Start
    MIDI.sendStart();

    appState.clock.isPlaying = true;
    appState.clock.tickCount = 0;
    appState.euclideanStepIndex = 0;

    // Regenerate pattern to ensure it's current
    regeneratePattern();

    UI.updateTransportButtons(true);
    UI.updateClockStatus('playing');

    masterClockInterval = setInterval(() => {
        MIDI.sendClock();
        handleClockTick();
    }, tickInterval);

    console.log(`Master clock started at ${appState.clock.bpm} BPM`);
}

/**
 * Stop the master clock
 */
function stopMasterClock() {
    if (masterClockInterval) {
        clearInterval(masterClockInterval);
        masterClockInterval = null;
    }

    // Send MIDI Stop
    MIDI.sendStop();

    appState.clock.isPlaying = false;

    // Cancel all scheduled notes
    cancelAllScheduledNotes();

    UI.updateTransportButtons(false);
    UI.updateClockStatus('stopped');

    console.log('Master clock stopped');
}

/**
 * Update master clock tempo (restart if playing)
 */
function updateMasterClockTempo() {
    if (appState.clock.mode === 'master' && appState.clock.isPlaying) {
        stopMasterClock();
        startMasterClock();
    }
}

// ============================================================================
// Slave Clock Management
// ============================================================================

/**
 * Handle incoming MIDI clock tick (slave mode)
 */
function handleIncomingClockTick() {
    appState.clock.lastTickTime = performance.now();
    handleClockTick();
}

/**
 * Handle transport messages from external clock
 */
function handleTransportMessage(message) {
    switch (message) {
        case 'start':
            appState.clock.isPlaying = true;
            appState.clock.tickCount = 0;
            appState.euclideanStepIndex = 0;
            regeneratePattern();
            UI.updateTransportButtons(true);
            UI.updateClockStatus('synced');
            console.log('External clock: Start received');
            break;

        case 'stop':
            appState.clock.isPlaying = false;
            cancelAllScheduledNotes();
            UI.updateTransportButtons(false);
            UI.updateClockStatus('stopped');
            console.log('External clock: Stop received');
            break;

        case 'continue':
            appState.clock.isPlaying = true;
            UI.updateTransportButtons(true);
            UI.updateClockStatus('synced');
            console.log('External clock: Continue received');
            break;
    }
}

/**
 * Start clock loss detection (slave mode)
 */
function startClockLossDetection() {
    if (clockLossCheckInterval) return;

    clockLossCheckInterval = setInterval(() => {
        if (appState.clock.mode === 'slave' && appState.clock.isPlaying) {
            const timeSinceLastTick = performance.now() - appState.clock.lastTickTime;

            // If no clock for 100ms, consider it lost
            if (timeSinceLastTick > 100) {
                console.warn('MIDI clock lost - freezing state');
                UI.updateClockStatus('lost');
            }
        }
    }, 50);
}

/**
 * Stop clock loss detection
 */
function stopClockLossDetection() {
    if (clockLossCheckInterval) {
        clearInterval(clockLossCheckInterval);
        clockLossCheckInterval = null;
    }
}

// ============================================================================
// Unified Clock Tick Handler
// ============================================================================

/**
 * Handle a clock tick (24 PPQN)
 * Called by both master and slave clock sources
 */
function handleClockTick() {
    if (!appState.clock.isPlaying) return;

    appState.clock.tickCount++;

    // Check for chord advancement
    const chordChanged = Arpeggiator.checkChordAdvancement(appState);
    if (chordChanged) {
        UI.updatePadDisplay(appState);
        UI.updateChordStatus(appState);
    }

    // Calculate ticks per Euclidean step
    // Pattern spans one bar: 96 ticks / steps
    const ticksPerStep = Arpeggiator.calculateTicksPerStep(appState.euclidean.steps);

    // Check if it's time for a new step
    if (appState.clock.tickCount % ticksPerStep === 0) {
        executeStep();
    }
}

/**
 * Execute one step of the arpeggiator
 */
function executeStep() {
    // Select note (may return null for rest)
    const note = Arpeggiator.selectNote(appState);

    if (note !== null) {
        // Calculate velocity and gate
        const velocity = Arpeggiator.calculateVelocity(appState);
        const stepDuration = Arpeggiator.calculateStepDuration(
            appState.clock.bpm,
            appState.euclidean.steps
        );
        const gateLength = Arpeggiator.calculateGateLength(appState, stepDuration);

        // Calculate humanization offset
        const humanizationOffset = Arpeggiator.calculateHumanization(appState.humanization);

        // Schedule note with humanization
        const delay = Math.max(0, humanizationOffset);

        setTimeout(() => {
            if (!appState.clock.isPlaying) return;

            // Send note on
            MIDI.sendNoteOn(note, velocity);
            appState.lastPlayedNote = note;

            // Schedule note off
            const noteOffHandle = setTimeout(() => {
                MIDI.sendNoteOff(note);
                appState.scheduledNotes = appState.scheduledNotes.filter(s => s.note !== note);
            }, gateLength);

            appState.scheduledNotes.push({ note, handle: noteOffHandle });
        }, delay);
    }

    // Update UI to show current step
    UI.highlightCurrentStep(appState);

    // Advance to next step
    appState.euclideanStepIndex = (appState.euclideanStepIndex + 1) % appState.euclidean.steps;
}

/**
 * Cancel all scheduled notes (on stop)
 */
function cancelAllScheduledNotes() {
    appState.scheduledNotes.forEach(scheduled => {
        clearTimeout(scheduled.handle);
        MIDI.sendNoteOff(scheduled.note);
    });
    appState.scheduledNotes = [];

    // Also use MIDI's stopAllNotes for safety
    MIDI.stopAllNotes();
}

// ============================================================================
// Pattern Management
// ============================================================================

/**
 * Regenerate Euclidean pattern from current parameters
 */
function regeneratePattern() {
    const basePattern = euclidean(appState.euclidean.hits, appState.euclidean.steps);
    appState.euclidean.pattern = rotatePattern(basePattern, appState.euclidean.rotation);
    UI.updatePatternDisplay(appState);
}

// ============================================================================
// UI Callbacks
// ============================================================================

const uiCallbacks = {
    onPatternChange: (state) => {
        console.log(`Pattern changed: ${state.euclidean.hits}/${state.euclidean.steps}, rotation: ${state.euclidean.rotation}`);
    },

    onClockModeChange: (state) => {
        console.log(`Clock mode changed to: ${state.clock.mode}`);

        // Stop current clock if playing
        if (state.clock.isPlaying) {
            stopMasterClock();
        }

        // Set up appropriate clock handling
        if (state.clock.mode === 'slave') {
            MIDI.setClockCallback(handleIncomingClockTick);
            MIDI.setTransportCallback(handleTransportMessage);
            startClockLossDetection();
            UI.updateClockStatus('disconnected');
        } else {
            MIDI.setClockCallback(null);
            MIDI.setTransportCallback(null);
            stopClockLossDetection();
            UI.updateClockStatus('stopped');
        }
    },

    onBPMChange: (state) => {
        updateMasterClockTempo();
    },

    onStart: () => {
        if (appState.clock.mode === 'master') {
            startMasterClock();
        }
    },

    onStop: () => {
        if (appState.clock.mode === 'master') {
            stopMasterClock();
        }
    },

    onChordsChange: (state) => {
        console.log(`Chord progression updated: ${state.chordProgression.length} chords`);
    },

    onInputSelect: (deviceId) => {
        const success = MIDI.selectInputDevice(deviceId);
        if (success && deviceId) {
            UI.showNotification('MIDI input connected', 'success');
        }
    },

    onOutputSelect: (deviceId) => {
        const success = MIDI.selectOutputDevice(deviceId);
        if (success && deviceId) {
            UI.showNotification('MIDI output connected', 'success');
        }
    },
};

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize the application
 */
async function initialize() {
    console.log('Ouarpeggiator initializing...');

    // Generate initial pattern
    regeneratePattern();

    // Initialize MIDI
    if (MIDI.isWebMIDIAvailable()) {
        const access = await MIDI.initMIDI();

        if (access) {
            // Populate device selectors
            UI.populateMIDIDevices(
                MIDI.getInputDevices(),
                MIDI.getOutputDevices()
            );

            // Bind device selection handlers
            UI.bindMIDIDeviceSelectors(uiCallbacks);

            UI.showNotification('WebMIDI initialized', 'info');
        } else {
            UI.showNotification('WebMIDI initialization failed', 'error');
        }
    } else {
        UI.showNotification('WebMIDI not supported in this browser', 'error');
        console.warn('WebMIDI not supported');
    }

    // Initialize UI
    UI.initializeUI(appState, uiCallbacks);

    console.log('Ouarpeggiator ready');
}

// ============================================================================
// Start Application
// ============================================================================

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}

// Expose state for debugging in browser console
window.ouarpeggiatorState = appState;
window.ouarpeggiatorDebug = {
    startMasterClock,
    stopMasterClock,
    executeStep,
    regeneratePattern,
};
