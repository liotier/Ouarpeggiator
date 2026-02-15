/**
 * Audio Module
 *
 * Web Audio API implementation for sound output.
 * Provides synthesizer fallback for users without MIDI hardware.
 *
 * This module is designed to be compatible with the AkaiMPC
 * Chord Progression Generator for parallel maintenance.
 */

// ============================================================================
// Audio Context Management
// ============================================================================

let audioContext = null;
let masterGain = null;
let isInitialized = false;

// Active voices for polyphonic playback
const activeVoices = new Map();

// Default synth settings
const synthSettings = {
    waveform: 'triangle',  // 'sine', 'triangle', 'sawtooth', 'square'
    attack: 0.02,
    decay: 0.1,
    sustain: 0.3,
    release: 0.3,
    masterVolume: 0.5,
    filterFreq: 2000,
    filterQ: 1,
};

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize the Web Audio context
 * Must be called after user interaction (browser requirement)
 * @returns {boolean} - Success
 */
export function initAudio() {
    if (isInitialized) return true;

    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();

        // Create master gain
        masterGain = audioContext.createGain();
        masterGain.gain.value = synthSettings.masterVolume;
        masterGain.connect(audioContext.destination);

        isInitialized = true;
        console.log('Web Audio initialized');
        return true;
    } catch (error) {
        console.error('Failed to initialize Web Audio:', error);
        return false;
    }
}

/**
 * Resume audio context if suspended
 * Required for browsers that suspend audio until user interaction
 */
export async function resumeAudio() {
    if (audioContext && audioContext.state === 'suspended') {
        await audioContext.resume();
    }
}

/**
 * Check if audio is available
 * @returns {boolean}
 */
export function isAudioAvailable() {
    return isInitialized && audioContext !== null;
}

/**
 * Get current audio context state
 * @returns {string} - 'running', 'suspended', or 'closed'
 */
export function getAudioState() {
    return audioContext ? audioContext.state : 'closed';
}

// ============================================================================
// Synth Settings
// ============================================================================

/**
 * Set synthesizer waveform
 * @param {string} waveform - 'sine', 'triangle', 'sawtooth', 'square'
 */
export function setWaveform(waveform) {
    if (['sine', 'triangle', 'sawtooth', 'square'].includes(waveform)) {
        synthSettings.waveform = waveform;
    }
}

/**
 * Set master volume
 * @param {number} volume - 0 to 1
 */
export function setMasterVolume(volume) {
    synthSettings.masterVolume = Math.max(0, Math.min(1, volume));
    if (masterGain) {
        masterGain.gain.value = synthSettings.masterVolume;
    }
}

/**
 * Set ADSR envelope
 * @param {Object} envelope - { attack, decay, sustain, release }
 */
export function setEnvelope(envelope) {
    if (envelope.attack !== undefined) synthSettings.attack = envelope.attack;
    if (envelope.decay !== undefined) synthSettings.decay = envelope.decay;
    if (envelope.sustain !== undefined) synthSettings.sustain = envelope.sustain;
    if (envelope.release !== undefined) synthSettings.release = envelope.release;
}

/**
 * Set filter parameters
 * @param {number} freq - Cutoff frequency in Hz
 * @param {number} q - Filter Q/resonance
 */
export function setFilter(freq, q) {
    synthSettings.filterFreq = freq;
    synthSettings.filterQ = q;
}

// ============================================================================
// MIDI to Frequency Conversion
// ============================================================================

/**
 * Convert MIDI note to frequency
 * @param {number} midiNote - MIDI note number (0-127)
 * @returns {number} - Frequency in Hz
 */
export function midiToFrequency(midiNote) {
    return 440 * Math.pow(2, (midiNote - 69) / 12);
}

// ============================================================================
// Note Playback
// ============================================================================

/**
 * Play a note with the synthesizer
 * @param {number} midiNote - MIDI note number
 * @param {number} velocity - Velocity (0-127)
 * @param {number} duration - Duration in milliseconds (optional, for auto note-off)
 * @returns {Object} - Voice object for manual control
 */
export function playNote(midiNote, velocity = 100, duration = null) {
    if (!isInitialized || !audioContext) {
        initAudio();
    }

    if (!audioContext) return null;

    // Resume if suspended
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }

    const now = audioContext.currentTime;
    const freq = midiToFrequency(midiNote);
    const velocityGain = (velocity / 127) * 0.8;

    // Create oscillator
    const oscillator = audioContext.createOscillator();
    oscillator.type = synthSettings.waveform;
    oscillator.frequency.value = freq;

    // Create filter
    const filter = audioContext.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = synthSettings.filterFreq;
    filter.Q.value = synthSettings.filterQ;

    // Create gain for envelope
    const gainNode = audioContext.createGain();
    gainNode.gain.value = 0;

    // Connect: oscillator -> filter -> gain -> master
    oscillator.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(masterGain);

    // Apply ADSR envelope
    const { attack, decay, sustain } = synthSettings;

    // Attack
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(velocityGain, now + attack);

    // Decay to sustain
    gainNode.gain.linearRampToValueAtTime(velocityGain * sustain, now + attack + decay);

    // Start oscillator
    oscillator.start(now);

    // Store voice
    const voice = {
        oscillator,
        gainNode,
        filter,
        midiNote,
        startTime: now,
    };

    // Stop any existing voice on this note
    if (activeVoices.has(midiNote)) {
        stopNote(midiNote);
    }

    activeVoices.set(midiNote, voice);

    // Auto note-off if duration specified
    if (duration) {
        setTimeout(() => {
            stopNote(midiNote);
        }, duration);
    }

    return voice;
}

/**
 * Stop a note
 * @param {number} midiNote - MIDI note number
 */
export function stopNote(midiNote) {
    const voice = activeVoices.get(midiNote);
    if (!voice || !audioContext) return;

    const now = audioContext.currentTime;
    const { release } = synthSettings;

    // Release envelope
    voice.gainNode.gain.cancelScheduledValues(now);
    voice.gainNode.gain.setValueAtTime(voice.gainNode.gain.value, now);
    voice.gainNode.gain.linearRampToValueAtTime(0, now + release);

    // Stop oscillator after release
    voice.oscillator.stop(now + release + 0.1);

    // Remove from active voices
    activeVoices.delete(midiNote);
}

/**
 * Stop all notes immediately
 */
export function stopAllNotes() {
    activeVoices.forEach((voice, midiNote) => {
        if (voice.oscillator) {
            try {
                voice.gainNode.gain.setValueAtTime(0, audioContext.currentTime);
                voice.oscillator.stop(audioContext.currentTime + 0.01);
            } catch (e) {
                // Oscillator may already be stopped
            }
        }
    });
    activeVoices.clear();
}

// ============================================================================
// Chord Playback
// ============================================================================

/**
 * Play a chord (multiple notes)
 * @param {number[]} notes - Array of MIDI note numbers
 * @param {number} velocity - Velocity (0-127)
 * @param {number} duration - Duration in milliseconds
 */
export function playChord(notes, velocity = 100, duration = 500) {
    if (!notes || notes.length === 0) return;

    notes.forEach(note => {
        playNote(note, velocity, duration);
    });
}

/**
 * Play a chord with arpeggio (staggered notes)
 * @param {number[]} notes - Array of MIDI note numbers
 * @param {number} velocity - Velocity
 * @param {number} noteDuration - Duration of each note
 * @param {number} stagger - Delay between notes in ms
 */
export function playArpeggio(notes, velocity = 100, noteDuration = 300, stagger = 50) {
    if (!notes || notes.length === 0) return;

    notes.forEach((note, index) => {
        setTimeout(() => {
            playNote(note, velocity, noteDuration);
        }, index * stagger);
    });
}

// ============================================================================
// Preview Functions
// ============================================================================

/**
 * Play a quick preview beep
 * @param {number} midiNote - Note to preview
 */
export function previewNote(midiNote) {
    playNote(midiNote, 80, 200);
}

/**
 * Play a chord preview
 * @param {number[]} notes - Chord notes
 */
export function previewChord(notes) {
    playChord(notes, 80, 400);
}

// ============================================================================
// Metronome
// ============================================================================

let metronomeInterval = null;
let metronomeGain = null;

/**
 * Start metronome
 * @param {number} bpm - Beats per minute
 * @param {number} beatsPerBar - Beats per bar (accent on first beat)
 */
export function startMetronome(bpm, beatsPerBar = 4) {
    stopMetronome();

    if (!audioContext) {
        initAudio();
    }

    let beat = 0;
    const interval = 60000 / bpm;

    const click = () => {
        const isAccent = beat % beatsPerBar === 0;
        const freq = isAccent ? 1000 : 800;
        const volume = isAccent ? 0.3 : 0.15;

        // Create click sound
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();

        osc.type = 'sine';
        osc.frequency.value = freq;

        gain.gain.value = volume;
        gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.05);

        osc.connect(gain);
        gain.connect(masterGain);

        osc.start(audioContext.currentTime);
        osc.stop(audioContext.currentTime + 0.05);

        beat++;
    };

    click(); // First beat immediately
    metronomeInterval = setInterval(click, interval);
}

/**
 * Stop metronome
 */
export function stopMetronome() {
    if (metronomeInterval) {
        clearInterval(metronomeInterval);
        metronomeInterval = null;
    }
}

/**
 * Check if metronome is running
 * @returns {boolean}
 */
export function isMetronomeRunning() {
    return metronomeInterval !== null;
}

// ============================================================================
// Exports
// ============================================================================

export default {
    initAudio,
    resumeAudio,
    isAudioAvailable,
    getAudioState,
    setWaveform,
    setMasterVolume,
    setEnvelope,
    setFilter,
    midiToFrequency,
    playNote,
    stopNote,
    stopAllNotes,
    playChord,
    playArpeggio,
    previewNote,
    previewChord,
    startMetronome,
    stopMetronome,
    isMetronomeRunning,
};
