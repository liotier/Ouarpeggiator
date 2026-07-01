/**
 * Transport / Clock / Playback + Juno-106 output
 *
 * Owns the sequencer clock (main-thread clock worker + the off-thread note
 * scheduler worker used for Juno-106), playback start/stop, per-step output
 * routing (MIDI / Audio / Juno-106), and the note-off queue. Note-generation
 * decisions are delegated to sequencerCore; this module is the "host" that
 * schedules and outputs the notes and drives view updates.
 *
 * NOTE: this module has runtime-safe circular imports with chordProgression
 * (renderChordGrid) and ui (renderChordChangeCircle / regenerateChordChangePattern
 * / updateProgressionPreview) — the sequencer notifies the view. These are only
 * ever called at runtime (never during module evaluation), which ESM supports.
 */

import { appState } from './appState.js';
import {
    isChordChangeTick,
    isStepTick,
    isStabSequencerActive,
    advanceBarChord,
    advanceStabChord,
    computeStepNotes
} from './sequencerCore.js';
import { euclidean, rotatePattern } from './euclidean.js';
import * as MIDI from './midi.js';
import * as Audio from './modules/audio.js';
import * as PianoRoll from './pianoRoll.js';
import * as EuclideanCircle from './euclideanCircle.js';
import ChordProgressionSequencer from './chordProgressionSequencer.js';
import { renderChordGrid } from './chordProgression.js';
import { renderChordChangeCircle, regenerateChordChangePattern, updateProgressionPreview } from './ui.js';

// Juno-106 window integration
let junoWindow = null;
let junoReady = false;          // true once we've received 'juno106:ready'
let junoDisconnectNotified = false;  // avoid spamming the status on every dropped note
const JUNO_URL = 'https://liotier.github.io/Juno-106_maintenance-and-performance-improvements/';
const activeJunoNotes = new Set();

// ============================================================================
// Pattern Management
// ============================================================================

function regeneratePattern() {
    const basePattern = euclidean(appState.euclidean.hits, appState.euclidean.steps);
    appState.euclidean.pattern = rotatePattern(basePattern, appState.euclidean.rotation);
    renderPattern();
    // Push Euclidean changes to the worker for live update (worker regenerates
    // its own pattern from hits/steps/rotation).
    syncWorkerParam({
        euclidean: {
            hits: appState.euclidean.hits,
            steps: appState.euclidean.steps,
            rotation: appState.euclidean.rotation
        }
    });
}

function renderPattern() {
    // Update Euclidean circle visualization
    EuclideanCircle.updatePattern(
        appState.euclidean.steps,
        appState.euclidean.hits,
        appState.euclidean.rotation,
        appState.euclidean.pattern
    );
    // Update current step if playing
    if (appState.isPlaying) {
        EuclideanCircle.setCurrentStep(appState.euclideanStepIndex);
    }
    // Update piano roll Euclidean hit indicators
    if (appState.pianoRollInitialized) {
        PianoRoll.setEuclideanPattern(appState.euclidean.pattern, appState.euclidean.steps);
    }
}

// ============================================================================
// Clock / Transport
// ============================================================================

// ============================================================================
// Timing & Clock (Web Worker based for CPU isolation)
// ============================================================================

let clockWorker = null;
let noteSchedulerWorker = null;  // BroadcastChannel-enabled Worker for Juno-106
let useBroadcastChannel = false;  // Enable when outputMode is juno106
let masterClockInterval = null;
let nextTickTime = 0;
let scheduleAheadTime = 0.2;
let schedulerLookahead = 25;
let currentTick = 0;

// Tick-driven note-off queue (immune to setTimeout throttling in background tabs)
const pendingNoteOffs = [];

// Initialize clock worker
function initClockWorker() {
    if (clockWorker) return;

    try {
        clockWorker = new Worker('js/clockWorker.js');
        clockWorker.onmessage = function(e) {
            if (e.data.type === 'tick' && appState.isPlaying) {
                if (MIDI.hasOutputDevice()) {
                    MIDI.sendClock();
                }
                handleClockTick();
            }
        };
        console.log('Clock worker initialized');
    } catch (error) {
        console.warn('Clock worker unavailable, falling back to main thread:', error);
        clockWorker = null;
    }
}

// Initialize note scheduler worker (BroadcastChannel for Juno-106)
function initNoteSchedulerWorker() {
    if (noteSchedulerWorker) return;

    try {
        noteSchedulerWorker = new Worker('js/noteSchedulerWorker.js', { type: 'module' });
        noteSchedulerWorker.onmessage = function(e) {
            const { type, note, velocity, gateLength, chordIndex } = e.data;

            if (type === 'noteOn') {
                sendToJuno106({ type: 'noteOn', value: note });
                // Update piano roll visualization
                PianoRoll.addNote(note, velocity, gateLength, chordIndex);
            } else if (type === 'noteOff') {
                sendToJuno106({ type: 'noteOff', value: note });
                // Remove from piano roll
                PianoRoll.removeNote(note);
            } else if (type === 'chordUpdate') {
                // Worker advanced the chord progression — mirror it for the UI.
                // chordSequencingStepIndex is only present when the Stab Mode
                // Euclidean chord sequencer fired (vs. the bar-based advance).
                appState.currentChordIndex = e.data.currentChordIndex;
                renderChordGrid();
                if (e.data.chordSequencingStepIndex !== undefined) {
                    appState.chordSequencing.stepIndex = e.data.chordSequencingStepIndex;
                    renderChordChangeCircle();
                }
            } else if (type === 'tick') {
                // Mirror the worker's step position so the Euclidean circle's
                // current-step highlight actually advances (previously left
                // stuck at its startPlayback() value).
                appState.euclideanStepIndex = e.data.euclideanStepIndex;
                renderPattern();
            }
        };
        useBroadcastChannel = true;
    } catch (error) {
        console.warn('Note scheduler worker unavailable:', error);
        noteSchedulerWorker = null;
        useBroadcastChannel = false;
    }
}

function startPlayback() {
    if (appState.isPlaying) return;


    // Initialize audio if browser tone is selected
    if (appState.outputMode === 'audio') {
        if (!Audio.isAudioAvailable()) {
            Audio.initAudio();
        }
        Audio.resumeAudio();
    }

    // Initialize chord progression sequencing (Stab Mode only)
    if (appState.playbackMode === 'stab' && appState.chordSequencing.enabled) {
        regenerateChordChangePattern();
        ChordProgressionSequencer.reset();
        appState.chordSequencing.stepIndex = 0;
        updateProgressionPreview();
    }

    appState.isPlaying = true;
    appState.tickCount = 0;
    appState.euclideanStepIndex = 0;

    regeneratePattern();

    // Start piano roll
    PianoRoll.startPianoRoll();
    PianoRoll.setBPM(appState.bpm);

    // Start Euclidean circle animation
    EuclideanCircle.setPlaying(true);

    document.getElementById('startBtn').disabled = true;
    document.getElementById('stopBtn').disabled = false;
    document.getElementById('clockStatus').textContent = 'Playing';
    document.getElementById('clockStatus').classList.add('playing');
    document.getElementById('clockStatus').classList.remove('stopped');

    if (MIDI.hasOutputDevice()) {
        MIDI.sendStart();
    }

    // Try to use BroadcastChannel Worker for Juno-106 (bypasses main thread entirely)
    if (appState.outputMode === 'juno106') {
        // Ensure the Juno-106 window is open (idempotent). Covers the case where
        // juno106 was restored from persistence without going through the
        // output-mode change handler — this Start click is a valid user gesture,
        // so the popup won't be blocked.
        launchJuno106();

        initNoteSchedulerWorker();

        if (noteSchedulerWorker) {
            // Send full state to worker
            noteSchedulerWorker.postMessage({
                type: 'updateState',
                data: {
                    bpm: appState.bpm,
                    euclidean: appState.euclidean,
                    euclideanStepIndex: appState.euclideanStepIndex,
                    chordProgression: appState.chordProgression,
                    currentChordIndex: appState.currentChordIndex,
                    barsPerChord: appState.barsPerChord,
                    harmonicAdherence: appState.harmonicAdherence,
                    playbackMode: appState.playbackMode,
                    octaveSpread: appState.octaveSpread,
                    harmonicVariation: appState.harmonicVariation,
                    rhythmicVariation: appState.rhythmicVariation,
                    humanization: appState.humanization,
                    velocity: appState.velocity,
                    gate: appState.gate,
                    curveSyncRotation: appState.curveSyncRotation,
                    strumSpeed: appState.strumSpeed,
                    strumDirection: appState.strumDirection,
                    outputMode: appState.outputMode,
                    chordSequencing: appState.chordSequencing,
                    sequencerSettings: {
                        method: ChordProgressionSequencer.method,
                        patternLength: ChordProgressionSequencer.patternLength,
                        lockPattern: ChordProgressionSequencer.lockPattern,
                        rootMelodyPattern: ChordProgressionSequencer.rootMelodyPattern,
                        circleFifthsDirection: ChordProgressionSequencer.circleFifthsDirection,
                        voiceLeadingOptimization: ChordProgressionSequencer.voiceLeadingOptimization
                    }
                }
            });

            // Start worker
            noteSchedulerWorker.postMessage({ type: 'start' });
            return;  // Don't start clock worker
        }
    }

    // Fallback: use regular clock worker for timing (unaffected by main thread CPU load)
    initClockWorker();

    if (clockWorker) {
        // Web Worker available - best option for CPU isolation
        clockWorker.postMessage({
            type: 'start',
            data: { bpm: appState.bpm }
        });
    } else {
        // Fallback: setTimeout-based scheduling
        const audioTime = Audio.getCurrentTime();
        if (audioTime !== null) {
            nextTickTime = audioTime;
            currentTick = 0;
        }

        masterClockInterval = setInterval(() => {
            const audioTime = Audio.getCurrentTime();

            if (audioTime === null) {
                if (MIDI.hasOutputDevice()) {
                    MIDI.sendClock();
                }
                handleClockTick();
                return;
            }

            while (nextTickTime < audioTime + scheduleAheadTime) {
                scheduleTickAtTime(nextTickTime);
                nextTickTime += 60 / (appState.bpm * 24);
                currentTick++;
            }
        }, schedulerLookahead);
    }
}

/**
 * Schedule a tick to execute at a specific time
 * Uses setTimeout with calculated delay from Web Audio time
 */
function scheduleTickAtTime(time) {
    const audioTime = Audio.getCurrentTime();
    if (audioTime === null) {
        // No Web Audio - execute immediately
        if (MIDI.hasOutputDevice()) MIDI.sendClock();
        handleClockTick();
        return;
    }

    const delay = Math.max(0, (time - audioTime) * 1000);  // Convert to ms

    setTimeout(() => {
        if (!appState.isPlaying) return;
        if (MIDI.hasOutputDevice()) {
            MIDI.sendClock();
        }
        handleClockTick();
    }, delay);
}

function stopPlayback() {
    // Stop note scheduler worker if using it
    if (noteSchedulerWorker && useBroadcastChannel) {
        noteSchedulerWorker.postMessage({ type: 'stop' });
    }

    // Stop clock worker if using it
    if (clockWorker) {
        clockWorker.postMessage({ type: 'stop' });
    }

    // Stop fallback timer
    if (masterClockInterval) {
        clearInterval(masterClockInterval);
        masterClockInterval = null;
    }

    appState.isPlaying = false;
    nextTickTime = 0;
    currentTick = 0;

    // Stop piano roll
    PianoRoll.stopPianoRoll();

    // Stop Euclidean circle animation
    EuclideanCircle.setPlaying(false);

    // Stop all pending notes immediately
    pendingNoteOffs.forEach(noff => {
        if (noff.outputMode === 'midi' && MIDI.hasOutputDevice()) {
            MIDI.sendNoteOff(noff.note);
        } else if (noff.outputMode === 'juno106') {
            sendToJuno106({ type: 'noteOff', value: noff.note });
        }
        PianoRoll.removeNote(noff.note);
    });
    pendingNoteOffs.length = 0;

    if (MIDI.hasOutputDevice()) {
        MIDI.sendStop();
        MIDI.stopAllNotes();
    }
    Audio.stopAllNotes();

    // Flush any notes stuck on in Juno-106
    activeJunoNotes.forEach(note => sendToJuno106({ type: 'noteOff', value: note }));
    activeJunoNotes.clear();

    document.getElementById('startBtn').disabled = false;
    document.getElementById('stopBtn').disabled = true;
    document.getElementById('clockStatus').textContent = 'Stopped';
    document.getElementById('clockStatus').classList.remove('playing');
    document.getElementById('clockStatus').classList.add('stopped');
}

/**
 * Process pending note-offs based on elapsed time.
 * Called from the tick handler so it works even when setTimeout is throttled.
 */
function processPendingNoteOffs() {
    const now = performance.now();
    for (let i = pendingNoteOffs.length - 1; i >= 0; i--) {
        if (now >= pendingNoteOffs[i].offTime) {
            const noff = pendingNoteOffs.splice(i, 1)[0];
            if (noff.outputMode === 'midi' && MIDI.hasOutputDevice()) {
                MIDI.sendNoteOff(noff.note);
            } else if (noff.outputMode === 'juno106') {
                sendToJuno106({ type: 'noteOff', value: noff.note });
            }
            PianoRoll.removeNote(noff.note);
        }
    }
}

function handleClockTick() {
    if (!appState.isPlaying) return;

    // Process note-offs on every tick (not dependent on setTimeout)
    processPendingNoteOffs();

    // tickCount is processed 0-based (incremented at the end), so the first
    // tick is the downbeat (step 0).

    // Bar-based chord advancement (must run before the step trigger so a chord
    // change takes effect on the same tick as the step). Skipped when the
    // Stab-mode chord sequencer is driving chord changes (gold-ring pattern),
    // so the two don't fight for control of the progression.
    if (isChordChangeTick(appState) && !isStabSequencerActive(appState)) {
        if (advanceBarChord(appState)) renderChordGrid();
    }

    if (isStepTick(appState)) {
        executeStep();
    }

    appState.tickCount++;
}

function executeStep() {
    // Stab-mode chord sequencer advancement (shared core decides; host renders)
    const stab = advanceStabChord(appState, ChordProgressionSequencer);
    if (stab.ran) {
        if (stab.changed) renderChordGrid();
        renderChordChangeCircle();
    }

    // Shared core computes the notes for this step and advances the position.
    const result = computeStepNotes(appState);
    if (!result.isRest) {
        result.notes.forEach(scheduleNote);
    }
    renderPattern();
}

/**
 * Schedule a single note event (from the core) for output. Honors the per-note
 * timing offset (humanization + strum). When the tab is hidden, setTimeout is
 * throttled to ~1s, so play immediately and let the offsets collapse.
 */
function scheduleNote(ev) {
    if (document.hidden || ev.offset <= 0) {
        playNote(ev.note, ev.velocity, ev.gateLength);
    } else {
        setTimeout(() => {
            if (!appState.isPlaying) return;
            playNote(ev.note, ev.velocity, ev.gateLength);
        }, ev.offset);
    }
}

// ============================================================================
// Juno-106 Helper Functions
// ============================================================================

/**
 * Show/update the Juno-106 connection status message near the output selector.
 * @param {string} text
 * @param {'pending'|'connected'|'error'} type
 */
function setJunoStatus(text, type) {
    const el = document.getElementById('junoStatus');
    if (!el) return;
    el.textContent = text;
    el.className = 'juno-status ' + type;
    el.hidden = false;
}

function clearJunoStatus() {
    const el = document.getElementById('junoStatus');
    if (el) el.hidden = true;
}

function launchJuno106() {
    if (junoWindow && !junoWindow.closed) return;

    // Starting a fresh window session — any notes tracked against the old
    // session are moot (nothing left to send an off to) and must not be
    // carried over, or we'd send bogus note-offs to the next window.
    activeJunoNotes.clear();
    junoReady = false;
    junoDisconnectNotified = false;

    junoWindow = window.open(JUNO_URL, 'juno106');

    if (!junoWindow) {
        setJunoStatus('Juno-106 popup blocked — allow pop-ups for this site and try again', 'error');
        console.warn('[Juno-106] window.open() returned null — popup likely blocked');
        return;
    }

    setJunoStatus('Opening Juno-106…', 'pending');

    window.addEventListener('message', function onReady(e) {
        if (e.origin === 'https://liotier.github.io' && e.data === 'juno106:ready') {
            window.removeEventListener('message', onReady);
            junoReady = true;
            setJunoStatus('Juno-106 connected', 'connected');
        }
    });
}

/**
 * Push a live parameter change to the note scheduler worker while playing.
 * Only sends user-facing params — never playback-position fields (tickCount,
 * euclideanStepIndex, currentChordIndex), which the worker owns and advances
 * on its own. Lets parameter tweaks take effect without stop/start.
 */
function syncWorkerParam(data) {
    if (appState.isPlaying && noteSchedulerWorker && useBroadcastChannel) {
        noteSchedulerWorker.postMessage({ type: 'updateState', data });
    }
}

/**
 * Push a freshly generated/switched chord progression to the worker, and force
 * its Stab Mode sequencer to regenerate — a stale sequence holds indices into
 * the OLD palette, which would point at the wrong chords once swapped in.
 */
function syncChordProgressionToWorker() {
    syncWorkerParam({
        chordProgression: appState.chordProgression,
        currentChordIndex: appState.currentChordIndex
    });
    if (appState.isPlaying && noteSchedulerWorker && useBroadcastChannel) {
        noteSchedulerWorker.postMessage({ type: 'regenerateSequencer' });
    }
    // Clear the piano roll's rolling history so it doesn't show a blend of the
    // old and new progressions' notes for the ~6s until the old ones scroll off.
    if (appState.isPlaying) {
        PianoRoll.clearNotes();
    }
}

/**
 * Jump the arpeggio to a specific chord immediately (e.g. clicking a pad while
 * playing). Overrides the sequencer's current position until the next scheduled
 * chord change. The worker owns currentChordIndex during playback, so push the
 * override to it explicitly.
 */
function jumpToChord(index) {
    if (index < 0 || index >= appState.chordProgression.length) return;
    appState.currentChordIndex = index;
    if (appState.isPlaying && noteSchedulerWorker && useBroadcastChannel) {
        noteSchedulerWorker.postMessage({ type: 'updateState', data: { currentChordIndex: index } });
    }
    renderChordGrid();
}

/**
 * Push the Stab Mode chord sequencer's settings (method, pattern length, etc.)
 * to the worker's own ChordProgressionSequencer instance.
 */
function syncSequencerSettings() {
    syncWorkerParam({
        sequencerSettings: {
            method: ChordProgressionSequencer.method,
            patternLength: ChordProgressionSequencer.patternLength,
            lockPattern: ChordProgressionSequencer.lockPattern,
            rootMelodyPattern: ChordProgressionSequencer.rootMelodyPattern,
            circleFifthsDirection: ChordProgressionSequencer.circleFifthsDirection,
            voiceLeadingOptimization: ChordProgressionSequencer.voiceLeadingOptimization
        }
    });
}

function sendToJuno106(msg) {
    if (!junoWindow || junoWindow.closed) {
        // The window was open (or never opened) and is now gone. Any notes
        // still tracked as "on" can't be turned off there anymore, and must
        // not be replayed against a future window, so drop them.
        if (activeJunoNotes.size > 0) activeJunoNotes.clear();
        const wasReady = junoReady;
        junoReady = false;

        if (!junoDisconnectNotified) {
            junoDisconnectNotified = true;
            setJunoStatus(
                wasReady
                    ? 'Juno-106 window was closed — reselect Juno-106 in Output to reconnect'
                    : 'Juno-106 window not available — reselect Juno-106 in Output to retry',
                'error'
            );
        }
        console.warn('[Juno-106] sendToJuno106: window not available, msg dropped:', msg);
        return;
    }
    if (msg.type === 'noteOn') activeJunoNotes.add(msg.value);
    else if (msg.type === 'noteOff') activeJunoNotes.delete(msg.value);
    junoWindow.postMessage(msg, 'https://liotier.github.io');
}

/**
 * Play a single note via MIDI or Audio
 */
function playNote(note, velocity, gateLength) {
    // Add to piano roll visualization
    PianoRoll.addNote(note, velocity, gateLength, appState.currentChordIndex);

    if (appState.outputMode === 'midi' && MIDI.hasOutputDevice()) {
        MIDI.sendNoteOn(note, velocity);
    } else if (appState.outputMode === 'audio') {
        Audio.playNote(note, velocity, gateLength);
    } else if (appState.outputMode === 'juno106') {
        sendToJuno106({ type: 'noteOn', value: note });
    }

    // Schedule note-off via tick-driven queue (immune to background tab throttling).
    // For 'audio' mode the engine handles its own note-off, but we still need
    // to remove the piano roll entry.
    pendingNoteOffs.push({
        note,
        offTime: performance.now() + gateLength,
        outputMode: appState.outputMode
    });
}

export {
    startPlayback,
    stopPlayback,
    regeneratePattern,
    sendToJuno106,
    syncWorkerParam,
    syncChordProgressionToWorker,
    syncSequencerSettings,
    jumpToChord,
    launchJuno106,
    clearJunoStatus,
    noteSchedulerWorker,
    useBroadcastChannel
};
