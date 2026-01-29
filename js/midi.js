/**
 * MIDI Controller Module
 *
 * Handles WebMIDI device management, note I/O, and MIDI clock/transport.
 * Adapted from AkaiMPC Chord Progression Generator with additions for
 * clock master/slave functionality.
 *
 * MIDI Clock: 24 PPQN (Pulses Per Quarter Note)
 * Transport messages: Start (0xFA), Stop (0xFC), Continue (0xFB)
 */

// ============================================================================
// Module State
// ============================================================================

let midiAccess = null;
let midiInput = null;
let midiOutput = null;

// Callback functions for external event handling
let clockCallback = null;
let transportCallback = null;
let noteCallback = null;

// Track active notes for proper cleanup
const activeNotes = new Map(); // note -> { channel, timeoutId }

// ============================================================================
// WebMIDI Initialization
// ============================================================================

/**
 * Initialize WebMIDI and request access
 * @returns {Promise<MIDIAccess|null>} - MIDI access object or null if unavailable
 */
async function initMIDI() {
    if (!navigator.requestMIDIAccess) {
        console.warn('WebMIDI not supported in this browser');
        return null;
    }

    try {
        midiAccess = await navigator.requestMIDIAccess({ sysex: false });

        // Set up device change listener
        midiAccess.onstatechange = handleDeviceChange;

        console.log('WebMIDI initialized successfully');
        return midiAccess;
    } catch (error) {
        console.error('Failed to initialize WebMIDI:', error);
        return null;
    }
}

/**
 * Handle MIDI device connection/disconnection
 * @param {MIDIConnectionEvent} event
 */
function handleDeviceChange(event) {
    console.log(`MIDI device ${event.port.state}: ${event.port.name} (${event.port.type})`);

    // If current device was disconnected, clear reference
    if (event.port.state === 'disconnected') {
        if (event.port === midiInput) {
            midiInput = null;
        }
        if (event.port === midiOutput) {
            midiOutput = null;
        }
    }
}

// ============================================================================
// Device Enumeration
// ============================================================================

/**
 * Get list of available MIDI inputs
 * @returns {Array<{id: string, name: string}>}
 */
function getInputDevices() {
    if (!midiAccess) return [];

    const devices = [];
    midiAccess.inputs.forEach((input) => {
        devices.push({
            id: input.id,
            name: input.name || `Input ${input.id}`
        });
    });
    return devices;
}

/**
 * Get list of available MIDI outputs
 * @returns {Array<{id: string, name: string}>}
 */
function getOutputDevices() {
    if (!midiAccess) return [];

    const devices = [];
    midiAccess.outputs.forEach((output) => {
        devices.push({
            id: output.id,
            name: output.name || `Output ${output.id}`
        });
    });
    return devices;
}

// ============================================================================
// Device Selection
// ============================================================================

/**
 * Select a MIDI input device
 * @param {string} deviceId - The device ID to select
 * @returns {boolean} - Success
 */
function selectInputDevice(deviceId) {
    if (!midiAccess) {
        console.warn('MIDI not initialized');
        return false;
    }

    // Remove listener from previous input
    if (midiInput) {
        midiInput.onmidimessage = null;
    }

    if (!deviceId) {
        midiInput = null;
        return true;
    }

    const input = midiAccess.inputs.get(deviceId);
    if (!input) {
        console.warn(`MIDI input device not found: ${deviceId}`);
        return false;
    }

    midiInput = input;
    midiInput.onmidimessage = handleMIDIMessage;
    console.log(`Selected MIDI input: ${input.name}`);
    return true;
}

/**
 * Select a MIDI output device
 * @param {string} deviceId - The device ID to select
 * @returns {boolean} - Success
 */
function selectOutputDevice(deviceId) {
    if (!midiAccess) {
        console.warn('MIDI not initialized');
        return false;
    }

    if (!deviceId) {
        midiOutput = null;
        return true;
    }

    const output = midiAccess.outputs.get(deviceId);
    if (!output) {
        console.warn(`MIDI output device not found: ${deviceId}`);
        return false;
    }

    midiOutput = output;
    console.log(`Selected MIDI output: ${output.name}`);
    return true;
}

/**
 * Get currently selected input device
 * @returns {MIDIInput|null}
 */
function getSelectedInput() {
    return midiInput;
}

/**
 * Get currently selected output device
 * @returns {MIDIOutput|null}
 */
function getSelectedOutput() {
    return midiOutput;
}

// ============================================================================
// MIDI Message Handling
// ============================================================================

/**
 * Handle incoming MIDI messages
 * @param {MIDIMessageEvent} event
 */
function handleMIDIMessage(event) {
    const [status, data1, data2] = event.data;

    // System Real-Time Messages (no channel)
    switch (status) {
        case 0xF8: // Timing Clock
            if (clockCallback) {
                clockCallback();
            }
            return;

        case 0xFA: // Start
            if (transportCallback) {
                transportCallback('start');
            }
            return;

        case 0xFB: // Continue
            if (transportCallback) {
                transportCallback('continue');
            }
            return;

        case 0xFC: // Stop
            if (transportCallback) {
                transportCallback('stop');
            }
            return;

        case 0xFE: // Active Sensing (ignore)
        case 0xFF: // System Reset (ignore)
            return;
    }

    // Channel Voice Messages
    const messageType = status & 0xF0;
    const channel = status & 0x0F;

    switch (messageType) {
        case 0x90: // Note On
            if (data2 > 0 && noteCallback) {
                noteCallback('on', data1, data2, channel);
            } else if (data2 === 0 && noteCallback) {
                // Note On with velocity 0 = Note Off
                noteCallback('off', data1, 0, channel);
            }
            break;

        case 0x80: // Note Off
            if (noteCallback) {
                noteCallback('off', data1, data2, channel);
            }
            break;
    }
}

// ============================================================================
// Callback Registration
// ============================================================================

/**
 * Set callback for MIDI clock ticks
 * @param {Function|null} callback - Called on each clock tick (24 PPQN)
 */
function setClockCallback(callback) {
    clockCallback = callback;
}

/**
 * Set callback for transport messages
 * @param {Function|null} callback - Called with 'start', 'stop', or 'continue'
 */
function setTransportCallback(callback) {
    transportCallback = callback;
}

/**
 * Set callback for note messages
 * @param {Function|null} callback - Called with (type, note, velocity, channel)
 */
function setNoteCallback(callback) {
    noteCallback = callback;
}

// ============================================================================
// Note Output
// ============================================================================

/**
 * Send a Note On message
 * @param {number} note - MIDI note number (0-127)
 * @param {number} velocity - Velocity (0-127)
 * @param {number} channel - MIDI channel (0-15)
 */
function sendNoteOn(note, velocity, channel = 0) {
    if (!midiOutput) return;

    const status = 0x90 | (channel & 0x0F);
    midiOutput.send([status, note & 0x7F, velocity & 0x7F]);
}

/**
 * Send a Note Off message
 * @param {number} note - MIDI note number (0-127)
 * @param {number} channel - MIDI channel (0-15)
 */
function sendNoteOff(note, channel = 0) {
    if (!midiOutput) return;

    const status = 0x80 | (channel & 0x0F);
    midiOutput.send([status, note & 0x7F, 0]);
}

/**
 * Play a note with automatic note-off after duration
 * @param {number} note - MIDI note number
 * @param {number} velocity - Velocity
 * @param {number} duration - Duration in milliseconds
 * @param {number} channel - MIDI channel
 * @returns {number} - Timeout ID for cancellation
 */
function playNote(note, velocity, duration, channel = 0) {
    sendNoteOn(note, velocity, channel);

    // Cancel any existing timeout for this note
    const existingEntry = activeNotes.get(note);
    if (existingEntry) {
        clearTimeout(existingEntry.timeoutId);
    }

    const timeoutId = setTimeout(() => {
        sendNoteOff(note, channel);
        activeNotes.delete(note);
    }, duration);

    activeNotes.set(note, { channel, timeoutId });
    return timeoutId;
}

/**
 * Stop all currently playing notes
 */
function stopAllNotes() {
    // Send note-off for all active notes
    activeNotes.forEach(({ channel }, note) => {
        sendNoteOff(note, channel);
    });
    activeNotes.clear();

    // Also send All Notes Off on all channels (CC 123)
    if (midiOutput) {
        for (let ch = 0; ch < 16; ch++) {
            midiOutput.send([0xB0 | ch, 123, 0]);
        }
    }
}

// ============================================================================
// Clock Output (Master Mode)
// ============================================================================

/**
 * Send a MIDI Clock tick
 */
function sendClock() {
    if (!midiOutput) return;
    midiOutput.send([0xF8]);
}

/**
 * Send Start message
 */
function sendStart() {
    if (!midiOutput) return;
    midiOutput.send([0xFA]);
}

/**
 * Send Stop message
 */
function sendStop() {
    if (!midiOutput) return;
    midiOutput.send([0xFC]);
}

/**
 * Send Continue message
 */
function sendContinue() {
    if (!midiOutput) return;
    midiOutput.send([0xFB]);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Convert MIDI note number to frequency in Hz
 * @param {number} note - MIDI note number
 * @returns {number} - Frequency in Hz
 */
function midiToFrequency(note) {
    return 440 * Math.pow(2, (note - 69) / 12);
}

/**
 * Convert frequency to nearest MIDI note number
 * @param {number} frequency - Frequency in Hz
 * @returns {number} - MIDI note number
 */
function frequencyToMidi(frequency) {
    return Math.round(12 * Math.log2(frequency / 440) + 69);
}

/**
 * Get note name from MIDI number
 * @param {number} note - MIDI note number
 * @param {boolean} includeOctave - Whether to include octave number
 * @returns {string} - Note name (e.g., "C4", "F#3")
 */
function midiToNoteName(note, includeOctave = true) {
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const noteName = noteNames[note % 12];
    const octave = Math.floor(note / 12) - 1;
    return includeOctave ? `${noteName}${octave}` : noteName;
}

/**
 * Parse note name to MIDI number
 * @param {string} name - Note name (e.g., "C4", "F#3", "Bb2")
 * @returns {number|null} - MIDI note number or null if invalid
 */
function noteNameToMidi(name) {
    const match = name.match(/^([A-Ga-g])([#b]?)(-?\d+)$/);
    if (!match) return null;

    const noteMap = { 'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11 };
    let note = noteMap[match[1].toUpperCase()];
    if (note === undefined) return null;

    if (match[2] === '#') note += 1;
    if (match[2] === 'b') note -= 1;

    const octave = parseInt(match[3]) + 1;
    return (octave * 12) + note;
}

/**
 * Check if WebMIDI is available
 * @returns {boolean}
 */
function isWebMIDIAvailable() {
    return !!navigator.requestMIDIAccess;
}

/**
 * Check if MIDI has been initialized
 * @returns {boolean}
 */
function isMIDIInitialized() {
    return midiAccess !== null;
}

/**
 * Check if an output device is selected
 * @returns {boolean}
 */
function hasOutputDevice() {
    return midiOutput !== null;
}

/**
 * Check if an input device is selected
 * @returns {boolean}
 */
function hasInputDevice() {
    return midiInput !== null;
}

// ============================================================================
// Exports
// ============================================================================

export {
    // Initialization
    initMIDI,
    isWebMIDIAvailable,
    isMIDIInitialized,

    // Device management
    getInputDevices,
    getOutputDevices,
    selectInputDevice,
    selectOutputDevice,
    getSelectedInput,
    getSelectedOutput,
    hasInputDevice,
    hasOutputDevice,

    // Callbacks
    setClockCallback,
    setTransportCallback,
    setNoteCallback,

    // Note output
    sendNoteOn,
    sendNoteOff,
    playNote,
    stopAllNotes,

    // Clock/Transport output (master mode)
    sendClock,
    sendStart,
    sendStop,
    sendContinue,

    // Utilities
    midiToFrequency,
    frequencyToMidi,
    midiToNoteName,
    noteNameToMidi
};
