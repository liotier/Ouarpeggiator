/**
 * Arpeggiator Engine Module
 *
 * Core logic for note selection, velocity/gate calculation,
 * chord advancement, and variation processing.
 *
 * The arpeggiator traverses chord progressions using Euclidean rhythm
 * patterns, selecting notes via positional mapping with optional
 * harmonic and rhythmic variations.
 */

// ============================================================================
// Note Selection
// ============================================================================

/**
 * Select the next note to play based on current state
 *
 * @param {Object} state - Application state
 * @returns {number|null} - MIDI note number or null for rest
 */
function selectNote(state) {
    const currentChord = state.chordProgression[state.currentChordIndex];
    const pattern = state.euclidean.pattern;

    // Check if current step is a hit in the Euclidean pattern
    if (!pattern[state.euclideanStepIndex]) {
        return null; // Rest - pattern says no hit here
    }

    // Apply rhythmic variation (probabilistic rest insertion)
    if (state.rhythmicVariation > 0 && Math.random() < state.rhythmicVariation) {
        return null; // Rest - variation removed this hit
    }

    // Positional mapping with octave spread
    // Step index maps cyclically through chord tones, with octave offset
    const chordSize = currentChord.length;
    const baseNoteIndex = state.euclideanStepIndex % chordSize;
    const octaveLayer = Math.floor(state.euclideanStepIndex / chordSize) % state.octaveSpread;

    let selectedNote = currentChord[baseNoteIndex] + (octaveLayer * 12);

    // Apply harmonic variation (note substitution from progression pool)
    if (state.harmonicVariation > 0 && Math.random() < state.harmonicVariation) {
        selectedNote = selectSubstituteNote(state, selectedNote);
    }

    return selectedNote;
}

/**
 * Select a substitute note from the chord progression pool
 * Notes are transposed to stay in a similar register to the original
 *
 * @param {Object} state - Application state
 * @param {number} originalNote - The original note that would have played
 * @returns {number} - Substitute note
 */
function selectSubstituteNote(state, originalNote) {
    // Collect all unique notes from the entire progression
    const allNotes = state.chordProgression.flat();

    // Transpose notes to be within an octave of the original
    const transposedOptions = allNotes.map(note => {
        // Bring note to same octave range
        while (note < originalNote - 12) note += 12;
        while (note > originalNote + 12) note -= 12;
        return note;
    });

    // Remove duplicates and select randomly
    const uniqueOptions = [...new Set(transposedOptions)];
    return uniqueOptions[Math.floor(Math.random() * uniqueOptions.length)];
}

// ============================================================================
// Velocity Calculation
// ============================================================================

/**
 * Calculate velocity for the current step
 *
 * @param {Object} state - Application state
 * @returns {number} - Velocity (0-127)
 */
function calculateVelocity(state) {
    const config = state.velocity;
    const progress = state.euclideanStepIndex / state.euclidean.steps;

    let velocity;

    switch (config.mode) {
        case 'fixed':
            velocity = config.fixed;
            break;

        case 'random':
            velocity = config.randomMin +
                Math.random() * (config.randomMax - config.randomMin);
            break;

        case 'curve':
            velocity = applyCurve(
                progress,
                config.curveMin,
                config.curveMax,
                config.curveType
            );
            break;

        default:
            velocity = 100;
    }

    // Clamp to valid MIDI range
    return Math.round(Math.max(0, Math.min(127, velocity)));
}

// ============================================================================
// Gate Length Calculation
// ============================================================================

/**
 * Calculate gate length (note duration) for the current step
 *
 * @param {Object} state - Application state
 * @param {number} stepDuration - Duration of one step in milliseconds
 * @returns {number} - Gate length in milliseconds
 */
function calculateGateLength(state, stepDuration) {
    const config = state.gate;
    const progress = state.euclideanStepIndex / state.euclidean.steps;

    let percentage;

    switch (config.mode) {
        case 'fixed':
            percentage = config.fixed;
            break;

        case 'random':
            percentage = config.randomMin +
                Math.random() * (config.randomMax - config.randomMin);
            break;

        case 'curve':
            percentage = applyCurve(
                progress,
                config.curveMin,
                config.curveMax,
                config.curveType
            );
            break;

        default:
            percentage = 0.8;
    }

    // Clamp percentage to valid range and convert to duration
    percentage = Math.max(0.05, Math.min(1.0, percentage));
    return stepDuration * percentage;
}

// ============================================================================
// Curve Functions
// ============================================================================

/**
 * Apply a curve function to map progress (0-1) to a value range
 *
 * @param {number} progress - Position in pattern (0-1)
 * @param {number} min - Minimum output value
 * @param {number} max - Maximum output value
 * @param {string} curveType - Type of curve to apply
 * @returns {number} - Curved value
 */
function applyCurve(progress, min, max, curveType) {
    const range = max - min;
    let factor;

    switch (curveType) {
        case 'linear-ascending':
            factor = progress;
            break;

        case 'linear-descending':
            factor = 1 - progress;
            break;

        case 'exponential':
            // Exponential curve (accelerating)
            factor = Math.pow(progress, 2);
            break;

        case 'logarithmic':
            // Logarithmic curve (decelerating)
            factor = Math.sqrt(progress);
            break;

        case 'sinusoidal':
            // Sine wave: starts low, peaks in middle, ends low
            factor = (Math.sin(progress * Math.PI - Math.PI / 2) + 1) / 2;
            break;

        case 'triangle':
            // Triangle wave: linear up then down
            factor = progress < 0.5 ? progress * 2 : 2 - progress * 2;
            break;

        case 'sawtooth':
            // Same as linear ascending
            factor = progress;
            break;

        case 'reverse-sawtooth':
            // Same as linear descending
            factor = 1 - progress;
            break;

        default:
            factor = progress;
    }

    return min + range * factor;
}

// ============================================================================
// Chord Advancement
// ============================================================================

/**
 * Check and advance to next chord based on bar count
 *
 * @param {Object} state - Application state
 * @returns {boolean} - True if chord changed
 */
function checkChordAdvancement(state) {
    // 96 ticks per bar (24 PPQN * 4 beats)
    const ticksPerBar = 96;
    const ticksPerChordChange = ticksPerBar * state.barsPerChord;

    // Check if it's time to change chord
    if (state.clock.tickCount > 0 &&
        state.clock.tickCount % ticksPerChordChange === 0) {

        const previousChordIndex = state.currentChordIndex;
        const previousChord = state.chordProgression[previousChordIndex];

        // Advance to next chord
        state.currentChordIndex =
            (state.currentChordIndex + 1) % state.chordProgression.length;

        const newChord = state.chordProgression[state.currentChordIndex];

        // Apply voice leading to set initial step position
        applyVoiceLeading(state, previousChord, newChord);

        return true;
    }

    return false;
}

/**
 * Apply voice leading logic when changing chords
 * Adjusts the euclidean step index to favor smooth or far transitions
 *
 * @param {Object} state - Application state
 * @param {number[]} previousChord - Previous chord notes
 * @param {number[]} newChord - New chord notes
 */
function applyVoiceLeading(state, previousChord, newChord) {
    if (state.lastPlayedNote === null) return;

    const lastNote = state.lastPlayedNote;

    if (state.voiceLeading === 'smooth') {
        // Find the note in the new chord closest to the last played note
        let minDistance = Infinity;
        let bestIndex = 0;

        newChord.forEach((note, idx) => {
            // Consider notes in nearby octaves too
            for (let octave = -1; octave <= 1; octave++) {
                const transposedNote = note + (octave * 12);
                const distance = Math.abs(transposedNote - lastNote);
                if (distance < minDistance) {
                    minDistance = distance;
                    bestIndex = idx;
                }
            }
        });

        state.euclideanStepIndex = bestIndex;

    } else if (state.voiceLeading === 'far') {
        // Find the note in the new chord furthest from the last played note
        let maxDistance = -1;
        let bestIndex = 0;

        newChord.forEach((note, idx) => {
            const distance = Math.abs(note - lastNote);
            if (distance > maxDistance) {
                maxDistance = distance;
                bestIndex = idx;
            }
        });

        state.euclideanStepIndex = bestIndex;
    }
    // 'none' - don't modify euclideanStepIndex
}

// ============================================================================
// Humanization
// ============================================================================

/**
 * Calculate humanization offset for timing
 *
 * @param {number} maxOffset - Maximum offset in milliseconds
 * @returns {number} - Random offset within range (can be negative)
 */
function calculateHumanization(maxOffset) {
    if (maxOffset <= 0) return 0;

    // Gaussian-ish distribution centered on 0
    // Using simple uniform for now, could be improved
    return (Math.random() - 0.5) * 2 * maxOffset;
}

// ============================================================================
// Chord Analysis (Recycled from AkaiMPC)
// ============================================================================

/**
 * Analyze chord to determine its type/quality
 * Adapted from AkaiMPC Chord Progression Generator
 *
 * @param {number[]} notes - MIDI note numbers
 * @returns {Object} - Chord analysis result
 */
function analyzeChord(notes) {
    if (!notes || notes.length < 2) {
        return { name: '?', type: 'unknown', rootName: '?' };
    }

    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const root = notes[0] % 12;
    const rootName = noteNames[root];

    // Calculate intervals from root (normalized to single octave)
    const intervals = notes.map(n => ((n - notes[0]) % 12 + 12) % 12).sort((a, b) => a - b);

    // Remove duplicates
    const uniqueIntervals = [...new Set(intervals)];

    // Determine chord type based on intervals
    let type = 'unknown';
    let suffix = '';

    const has = (interval) => uniqueIntervals.includes(interval);

    // Check for common chord types
    if (has(4) && has(7)) {
        // Major third + perfect fifth
        if (has(11)) {
            type = 'major';
            suffix = 'maj7';
        } else if (has(10)) {
            type = 'dominant';
            suffix = '7';
        } else if (has(9)) {
            type = 'major';
            suffix = '6';
        } else if (has(2) && !has(10) && !has(11)) {
            type = 'major';
            suffix = 'add9';
        } else {
            type = 'major';
            suffix = 'maj';
        }
    } else if (has(3) && has(7)) {
        // Minor third + perfect fifth
        if (has(10)) {
            type = 'minor';
            suffix = 'm7';
        } else if (has(11)) {
            type = 'minor';
            suffix = 'm(maj7)';
        } else if (has(9)) {
            type = 'minor';
            suffix = 'm6';
        } else {
            type = 'minor';
            suffix = 'm';
        }
    } else if (has(3) && has(6)) {
        // Minor third + diminished fifth
        if (has(9)) {
            type = 'diminished';
            suffix = 'dim7';
        } else if (has(10)) {
            type = 'diminished';
            suffix = 'm7b5'; // half-diminished
        } else {
            type = 'diminished';
            suffix = 'dim';
        }
    } else if (has(4) && has(8)) {
        // Major third + augmented fifth
        type = 'augmented';
        suffix = 'aug';
    } else if (has(5) && has(7)) {
        // Perfect fourth + perfect fifth (sus4)
        type = 'suspended';
        suffix = 'sus4';
    } else if (has(2) && has(7)) {
        // Major second + perfect fifth (sus2)
        type = 'suspended';
        suffix = 'sus2';
    } else if (has(7) && !has(3) && !has(4)) {
        // Power chord (just root and fifth)
        type = 'power';
        suffix = '5';
    }

    return {
        name: rootName + suffix,
        type: type,
        rootName: rootName,
        root: root,
        intervals: uniqueIntervals
    };
}

/**
 * Get CSS class for chord type (for visual styling)
 *
 * @param {string} type - Chord type from analyzeChord
 * @returns {string} - CSS class name
 */
function getChordClass(type) {
    switch (type) {
        case 'major': return 'major';
        case 'minor': return 'minor';
        case 'dominant': return 'dominant';
        case 'diminished': return 'diminished';
        case 'augmented': return 'augmented';
        case 'suspended': return 'suspended';
        case 'power': return 'power';
        default: return 'unknown';
    }
}

// ============================================================================
// Timing Calculations
// ============================================================================

/**
 * Calculate step duration from BPM and pattern length
 *
 * @param {number} bpm - Beats per minute
 * @param {number} steps - Number of steps in pattern
 * @param {number} stepsPerBeat - How many steps fit in one beat (default: 4 for 16th notes)
 * @returns {number} - Step duration in milliseconds
 */
function calculateStepDuration(bpm, steps, stepsPerBeat = 4) {
    const msPerBeat = 60000 / bpm;
    return msPerBeat / stepsPerBeat;
}

/**
 * Calculate ticks per Euclidean step
 * Based on 24 PPQN and pattern fitting into one bar
 *
 * @param {number} steps - Number of steps in the pattern
 * @returns {number} - MIDI clock ticks per step
 */
function calculateTicksPerStep(steps) {
    // 96 ticks per bar (24 PPQN * 4 beats)
    // Pattern spans one bar
    return Math.floor(96 / steps);
}

// ============================================================================
// Exports
// ============================================================================

export {
    // Note selection
    selectNote,
    selectSubstituteNote,

    // Velocity and gate
    calculateVelocity,
    calculateGateLength,
    applyCurve,

    // Chord handling
    checkChordAdvancement,
    applyVoiceLeading,
    analyzeChord,
    getChordClass,

    // Timing
    calculateHumanization,
    calculateStepDuration,
    calculateTicksPerStep
};
