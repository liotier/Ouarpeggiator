/**
 * Ouarpeggiator - Main Application Module
 *
 * Entry point that initializes the application, manages state,
 * and coordinates between MIDI, audio, arpeggiator, and UI modules.
 *
 * French phonetic spelling of "warp" + arpeggiator - referencing
 * time manipulation and phase distortion through Euclidean rhythms.
 */

import { euclidean, rotatePattern } from './euclidean.js';
import * as MIDI from './midi.js';
import * as Arpeggiator from './arpeggiator.js';
import * as UI from './ui.js';
import * as MusicTheory from './modules/musicTheory.js';
import * as Audio from './modules/audio.js';

// ============================================================================
// Application State
// ============================================================================

const appState = {
    // Output mode
    outputMode: 'midi',  // 'midi' | 'audio' | 'both'

    // Chord progression generator settings
    generator: {
        key: 0,           // Key offset (0-11)
        mode: 'Major',    // Mode name
        category: 'Pop/Rock',
        progressionIndex: 0,
    },

    // Chord progression data
    chordProgression: [],  // Array of chord objects with notes
    currentChordIndex: 0,

    // Euclidean pattern parameters
    euclidean: {
        hits: 7,
        steps: 16,
        rotation: 0,
        pattern: [],
    },
    octaveSpread: 1,

    // Timing
    clock: {
        mode: 'master',
        bpm: 120,
        isPlaying: false,
        tickCount: 0,
        lastTickTime: 0,
    },
    barsPerChord: 4,
    humanization: 0,

    // Variation parameters
    harmonicVariation: 0.0,
    rhythmicVariation: 0.0,
    voiceLeading: 'smooth',
    lastPlayedNote: null,

    // Velocity configuration
    velocity: {
        mode: 'fixed',
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
        fixed: 0.8,
        randomMin: 0.5,
        randomMax: 0.9,
        curveType: 'linear-ascending',
        curveMin: 0.3,
        curveMax: 0.95,
    },

    // Runtime state
    euclideanStepIndex: 0,
    scheduledNotes: [],
};

// ============================================================================
// Chord Progression Generation
// ============================================================================

/**
 * Generate a chord progression based on current generator settings
 */
function generateProgression() {
    const { key, mode, category, progressionIndex } = appState.generator;

    // Get progression template
    const categoryProgressions = MusicTheory.progressions[category];
    if (!categoryProgressions || categoryProgressions.length === 0) {
        console.warn('No progressions found for category:', category);
        return;
    }

    const template = categoryProgressions[progressionIndex] || categoryProgressions[0];
    const scaleDegrees = MusicTheory.getScaleDegrees(mode);

    // Generate chords from Roman numerals
    const chords = MusicTheory.generateProgressionChords(
        template.chords,
        key,
        scaleDegrees,
        mode,
        4  // Base octave
    );

    // Optimize voice leading
    const optimizedChords = MusicTheory.optimizeVoiceLeading(chords);

    // Update state
    appState.chordProgression = optimizedChords.map(chord => chord.notes);
    appState.currentChordIndex = 0;

    // Update UI
    UI.updatePadDisplay(appState);
    UI.updateChordStatus(appState);

    // Update JSON input with generated data
    const chordInput = document.getElementById('chord-input');
    if (chordInput) {
        chordInput.value = JSON.stringify(appState.chordProgression);
    }

    console.log(`Generated progression: ${template.name} in ${MusicTheory.keys[key]} ${mode}`);
}

/**
 * Preview the current chord progression
 */
function previewProgression() {
    if (!appState.chordProgression.length) {
        generateProgression();
    }

    // Initialize audio if needed
    if (!Audio.isAudioAvailable()) {
        Audio.initAudio();
    }

    // Play each chord with a delay
    appState.chordProgression.forEach((notes, index) => {
        setTimeout(() => {
            // Play via audio
            if (appState.outputMode === 'audio' || appState.outputMode === 'both') {
                Audio.playChord(notes, 80, 400);
            }

            // Play via MIDI
            if ((appState.outputMode === 'midi' || appState.outputMode === 'both') && MIDI.hasOutputDevice()) {
                notes.forEach(note => {
                    MIDI.sendNoteOn(note, 80);
                    setTimeout(() => MIDI.sendNoteOff(note), 350);
                });
            }

            // Highlight current chord
            appState.currentChordIndex = index;
            UI.updatePadDisplay(appState);
            UI.updateChordStatus(appState);
        }, index * 500);
    });

    // Reset to first chord after preview
    setTimeout(() => {
        appState.currentChordIndex = 0;
        UI.updatePadDisplay(appState);
        UI.updateChordStatus(appState);
    }, appState.chordProgression.length * 500 + 200);
}

/**
 * Preview a single chord
 */
function previewChord(chordIndex) {
    if (chordIndex >= appState.chordProgression.length) return;

    const notes = appState.chordProgression[chordIndex];

    // Initialize audio if needed
    if (!Audio.isAudioAvailable()) {
        Audio.initAudio();
    }

    // Play via audio
    if (appState.outputMode === 'audio' || appState.outputMode === 'both') {
        Audio.playChord(notes, 80, 400);
    }

    // Play via MIDI
    if ((appState.outputMode === 'midi' || appState.outputMode === 'both') && MIDI.hasOutputDevice()) {
        notes.forEach(note => {
            MIDI.sendNoteOn(note, 80);
            setTimeout(() => MIDI.sendNoteOff(note), 350);
        });
    }
}

// ============================================================================
// Master Clock Management
// ============================================================================

let masterClockInterval = null;
let clockLossCheckInterval = null;

function startMasterClock() {
    if (masterClockInterval) return;

    // Initialize audio if using audio output
    if (appState.outputMode === 'audio' || appState.outputMode === 'both') {
        if (!Audio.isAudioAvailable()) {
            Audio.initAudio();
        }
        Audio.resumeAudio();
    }

    const tickInterval = 60000 / (appState.clock.bpm * 24);

    MIDI.sendStart();

    appState.clock.isPlaying = true;
    appState.clock.tickCount = 0;
    appState.euclideanStepIndex = 0;

    regeneratePattern();

    UI.updateTransportButtons(true);
    UI.updateClockStatus('playing');

    masterClockInterval = setInterval(() => {
        MIDI.sendClock();
        handleClockTick();
    }, tickInterval);

    console.log(`Master clock started at ${appState.clock.bpm} BPM`);
}

function stopMasterClock() {
    if (masterClockInterval) {
        clearInterval(masterClockInterval);
        masterClockInterval = null;
    }

    MIDI.sendStop();

    appState.clock.isPlaying = false;

    cancelAllScheduledNotes();

    UI.updateTransportButtons(false);
    UI.updateClockStatus('stopped');

    console.log('Master clock stopped');
}

function updateMasterClockTempo() {
    if (appState.clock.mode === 'master' && appState.clock.isPlaying) {
        stopMasterClock();
        startMasterClock();
    }
}

// ============================================================================
// Slave Clock Management
// ============================================================================

function handleIncomingClockTick() {
    appState.clock.lastTickTime = performance.now();
    handleClockTick();
}

function handleTransportMessage(message) {
    switch (message) {
        case 'start':
            appState.clock.isPlaying = true;
            appState.clock.tickCount = 0;
            appState.euclideanStepIndex = 0;
            regeneratePattern();
            UI.updateTransportButtons(true);
            UI.updateClockStatus('synced');
            break;

        case 'stop':
            appState.clock.isPlaying = false;
            cancelAllScheduledNotes();
            UI.updateTransportButtons(false);
            UI.updateClockStatus('stopped');
            break;

        case 'continue':
            appState.clock.isPlaying = true;
            UI.updateTransportButtons(true);
            UI.updateClockStatus('synced');
            break;
    }
}

function startClockLossDetection() {
    if (clockLossCheckInterval) return;

    clockLossCheckInterval = setInterval(() => {
        if (appState.clock.mode === 'slave' && appState.clock.isPlaying) {
            const timeSinceLastTick = performance.now() - appState.clock.lastTickTime;
            if (timeSinceLastTick > 100) {
                UI.updateClockStatus('lost');
            }
        }
    }, 50);
}

function stopClockLossDetection() {
    if (clockLossCheckInterval) {
        clearInterval(clockLossCheckInterval);
        clockLossCheckInterval = null;
    }
}

// ============================================================================
// Clock Tick Handler
// ============================================================================

function handleClockTick() {
    if (!appState.clock.isPlaying) return;

    appState.clock.tickCount++;

    const chordChanged = Arpeggiator.checkChordAdvancement(appState);
    if (chordChanged) {
        UI.updatePadDisplay(appState);
        UI.updateChordStatus(appState);
    }

    const ticksPerStep = Arpeggiator.calculateTicksPerStep(appState.euclidean.steps);

    if (appState.clock.tickCount % ticksPerStep === 0) {
        executeStep();
    }
}

function executeStep() {
    const note = Arpeggiator.selectNote(appState);

    if (note !== null) {
        const velocity = Arpeggiator.calculateVelocity(appState);
        const stepDuration = Arpeggiator.calculateStepDuration(
            appState.clock.bpm,
            appState.euclidean.steps
        );
        const gateLength = Arpeggiator.calculateGateLength(appState, stepDuration);
        const humanizationOffset = Arpeggiator.calculateHumanization(appState.humanization);

        const delay = Math.max(0, humanizationOffset);

        setTimeout(() => {
            if (!appState.clock.isPlaying) return;

            // Play via MIDI
            if ((appState.outputMode === 'midi' || appState.outputMode === 'both') && MIDI.hasOutputDevice()) {
                MIDI.sendNoteOn(note, velocity);
            }

            // Play via Audio
            if (appState.outputMode === 'audio' || appState.outputMode === 'both') {
                Audio.playNote(note, velocity, gateLength);
            }

            appState.lastPlayedNote = note;

            // Schedule note off for MIDI
            if ((appState.outputMode === 'midi' || appState.outputMode === 'both') && MIDI.hasOutputDevice()) {
                const noteOffHandle = setTimeout(() => {
                    MIDI.sendNoteOff(note);
                    appState.scheduledNotes = appState.scheduledNotes.filter(s => s.note !== note);
                }, gateLength);

                appState.scheduledNotes.push({ note, handle: noteOffHandle });
            }
        }, delay);
    }

    UI.highlightCurrentStep(appState);

    appState.euclideanStepIndex = (appState.euclideanStepIndex + 1) % appState.euclidean.steps;
}

function cancelAllScheduledNotes() {
    appState.scheduledNotes.forEach(scheduled => {
        clearTimeout(scheduled.handle);
        MIDI.sendNoteOff(scheduled.note);
    });
    appState.scheduledNotes = [];

    MIDI.stopAllNotes();
    Audio.stopAllNotes();
}

// ============================================================================
// Pattern Management
// ============================================================================

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
        console.log(`Pattern: ${state.euclidean.hits}/${state.euclidean.steps}`);
    },

    onClockModeChange: (state) => {
        if (state.clock.isPlaying) {
            stopMasterClock();
        }

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
        console.log(`Chord progression: ${state.chordProgression.length} chords`);
    },

    onInputSelect: (deviceId) => {
        MIDI.selectInputDevice(deviceId);
    },

    onOutputSelect: (deviceId) => {
        MIDI.selectOutputDevice(deviceId);
    },

    onChordClick: (chordIndex) => {
        previewChord(chordIndex);
        appState.currentChordIndex = chordIndex;
        UI.updatePadDisplay(appState);
        UI.updateChordStatus(appState);
    },
};

// ============================================================================
// Generator UI Bindings
// ============================================================================

function bindGeneratorControls() {
    const keySelect = document.getElementById('key-select');
    const modeSelect = document.getElementById('mode-select');
    const categorySelect = document.getElementById('progression-category');
    const progressionSelect = document.getElementById('progression-select');
    const generateBtn = document.getElementById('generate-progression');
    const previewBtn = document.getElementById('preview-progression');
    const outputModeSelect = document.getElementById('output-mode');

    // Populate progression select based on category
    function populateProgressions() {
        const category = categorySelect.value;
        const progs = MusicTheory.progressions[category] || [];

        progressionSelect.innerHTML = '';
        progs.forEach((prog, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = prog.name;
            progressionSelect.appendChild(option);
        });

        appState.generator.category = category;
        appState.generator.progressionIndex = 0;
    }

    if (keySelect) {
        keySelect.addEventListener('change', (e) => {
            appState.generator.key = parseInt(e.target.value);
        });
    }

    if (modeSelect) {
        modeSelect.addEventListener('change', (e) => {
            appState.generator.mode = e.target.value;
        });
    }

    if (categorySelect) {
        categorySelect.addEventListener('change', populateProgressions);
        populateProgressions(); // Initial population
    }

    if (progressionSelect) {
        progressionSelect.addEventListener('change', (e) => {
            appState.generator.progressionIndex = parseInt(e.target.value);
        });
    }

    if (generateBtn) {
        generateBtn.addEventListener('click', generateProgression);
    }

    if (previewBtn) {
        previewBtn.addEventListener('click', previewProgression);
    }

    // Output mode handling
    if (outputModeSelect) {
        outputModeSelect.addEventListener('change', (e) => {
            appState.outputMode = e.target.value;

            const midiConfig = document.getElementById('midi-config');
            const audioConfig = document.getElementById('audio-config');

            if (midiConfig) {
                midiConfig.style.display = (e.target.value === 'midi' || e.target.value === 'both') ? 'flex' : 'none';
            }
            if (audioConfig) {
                audioConfig.style.display = (e.target.value === 'audio' || e.target.value === 'both') ? 'flex' : 'none';
            }

            // Initialize audio if needed
            if (e.target.value === 'audio' || e.target.value === 'both') {
                Audio.initAudio();
            }
        });
    }

    // Audio controls
    const waveformSelect = document.getElementById('synth-waveform');
    const volumeSlider = document.getElementById('synth-volume');

    if (waveformSelect) {
        waveformSelect.addEventListener('change', (e) => {
            Audio.setWaveform(e.target.value);
        });
    }

    if (volumeSlider) {
        volumeSlider.addEventListener('input', (e) => {
            const volume = parseInt(e.target.value) / 100;
            Audio.setMasterVolume(volume);
            document.getElementById('synth-volume-value').textContent = e.target.value;
        });
    }
}

// ============================================================================
// Initialization
// ============================================================================

async function initialize() {
    console.log('Ouarpeggiator initializing...');

    // Generate initial pattern
    regeneratePattern();

    // Initialize MIDI
    if (MIDI.isWebMIDIAvailable()) {
        const access = await MIDI.initMIDI();

        if (access) {
            UI.populateMIDIDevices(
                MIDI.getInputDevices(),
                MIDI.getOutputDevices()
            );
            UI.bindMIDIDeviceSelectors(uiCallbacks);
        }
    } else {
        console.warn('WebMIDI not supported - using Web Audio only');
        appState.outputMode = 'audio';

        const outputModeSelect = document.getElementById('output-mode');
        if (outputModeSelect) {
            outputModeSelect.value = 'audio';
            outputModeSelect.dispatchEvent(new Event('change'));
        }
    }

    // Initialize Audio (lazily - will activate on first use)
    // Audio.initAudio(); // Commented - will init on user interaction

    // Bind generator controls
    bindGeneratorControls();

    // Initialize UI
    UI.initializeUI(appState, uiCallbacks);

    // Generate initial progression
    generateProgression();

    console.log('Ouarpeggiator ready');
}

// ============================================================================
// Start Application
// ============================================================================

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}

// Expose for debugging
window.ouarpeggiatorState = appState;
window.ouarpeggiatorDebug = {
    startMasterClock,
    stopMasterClock,
    executeStep,
    regeneratePattern,
    generateProgression,
    previewProgression,
    MusicTheory,
    Audio,
};
