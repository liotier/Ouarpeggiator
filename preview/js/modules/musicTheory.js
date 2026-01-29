/**
 * Music Theory Module
 *
 * Core music theory logic for chord generation, scale analysis,
 * and voice leading optimization.
 *
 * This module is designed to be compatible with the AkaiMPC
 * Chord Progression Generator for parallel maintenance.
 */

// ============================================================================
// Constants
// ============================================================================

export const keys = [
    'C', 'C♯/D♭', 'D', 'D♯/E♭', 'E', 'F',
    'F♯/G♭', 'G', 'G♯/A♭', 'A', 'A♯/B♭', 'B'
];

export const modes = {
    // Standard Western Modes
    'Major': [0, 2, 4, 5, 7, 9, 11],
    'Minor': [0, 2, 3, 5, 7, 8, 10],
    'Dorian': [0, 2, 3, 5, 7, 9, 10],
    'Phrygian': [0, 1, 3, 5, 7, 8, 10],
    'Lydian': [0, 2, 4, 6, 7, 9, 11],
    'Mixolydian': [0, 2, 4, 5, 7, 9, 10],
    'Locrian': [0, 1, 3, 5, 6, 8, 10],

    // Extended Minor Modes
    'Harmonic Minor': [0, 2, 3, 5, 7, 8, 11],
    'Melodic Minor': [0, 2, 3, 5, 7, 9, 11],

    // Pentatonic & Blues
    'Pentatonic Major': [0, 2, 4, 7, 9],
    'Pentatonic Minor': [0, 3, 5, 7, 10],
    'Blues': [0, 3, 5, 6, 7, 10],

    // Symmetric Scales
    'Whole Tone': [0, 2, 4, 6, 8, 10],
    'Diminished (H-W)': [0, 1, 3, 4, 6, 7, 9, 10],
    'Diminished (W-H)': [0, 2, 3, 5, 6, 8, 9, 11],
    'Augmented': [0, 3, 4, 7, 8, 11],

    // Jazz Scales
    'Bebop Dominant': [0, 2, 4, 5, 7, 9, 10, 11],
    'Bebop Major': [0, 2, 4, 5, 7, 8, 9, 11],
    'Altered': [0, 1, 3, 4, 6, 8, 10],

    // World Scales - Maqamat
    'Hijaz': [0, 1, 4, 5, 7, 8, 10],
    'Bayati': [0, 1.5, 3, 5, 7, 8, 10],
    'Rast': [0, 2, 3.5, 5, 7, 9, 10.5],
    'Saba': [0, 1.5, 3, 4, 6, 8, 10],
    'Nahawand': [0, 2, 3, 5, 7, 8, 11],

    // World Scales - Indian Ragas
    'Bhairav': [0, 1, 4, 5, 7, 8, 11],
    'Yaman': [0, 2, 4, 6, 7, 9, 11],
    'Kafi': [0, 2, 3, 5, 7, 9, 10],
    'Asavari': [0, 2, 3, 5, 7, 8, 10],
    'Todi': [0, 1, 3, 6, 7, 8, 11],
    'Purvi': [0, 1, 4, 6, 7, 8, 11],
    'Marwa': [0, 1, 4, 6, 7, 9, 11],

    // World Scales - Other
    'Hungarian Minor': [0, 2, 3, 6, 7, 8, 11],
    'Hungarian Major': [0, 3, 4, 6, 7, 9, 10],
    'Double Harmonic': [0, 1, 4, 5, 7, 8, 11],
    'Neapolitan Minor': [0, 1, 3, 5, 7, 8, 11],
    'Neapolitan Major': [0, 1, 3, 5, 7, 9, 11],
    'Persian': [0, 1, 4, 5, 6, 8, 11],
    'Japanese': [0, 1, 5, 7, 8],
    'Hirajoshi': [0, 2, 3, 7, 8],
    'Kumoi': [0, 2, 3, 7, 9],
};

export const progressions = {
    'Pop/Rock': [
        { name: 'I—V—vi—IV (Axis)', chords: 'I V vi IV' },
        { name: 'I—IV—V—IV', chords: 'I IV V IV' },
        { name: 'I—vi—IV—V (50s)', chords: 'I vi IV V' },
        { name: 'vi—IV—I—V', chords: 'vi IV I V' },
        { name: 'I—V—vi—iii—IV', chords: 'I V vi iii IV' },
        { name: 'I—IV—vi—V', chords: 'I IV vi V' },
        { name: 'I—iii—IV—V', chords: 'I iii IV V' },
    ],
    'Blues/Soul': [
        { name: '12-Bar Blues', chords: 'I I I I IV IV I I V IV I V' },
        { name: 'Quick Change Blues', chords: 'I IV I I IV IV I I V IV I V' },
        { name: 'Minor Blues', chords: 'i i i i iv iv i i V iv i V' },
        { name: 'Jazz Blues', chords: 'I7 IV7 I7 I7 IV7 IV7 I7 VI7 ii7 V7 I7 V7' },
        { name: 'Soul/Gospel I—IV', chords: 'I IV I IV' },
    ],
    'Jazz/Functional': [
        { name: 'ii—V—I', chords: 'ii7 V7 Imaj7' },
        { name: 'I—vi—ii—V (Rhythm Changes A)', chords: 'Imaj7 vi7 ii7 V7' },
        { name: 'iii—vi—ii—V', chords: 'iii7 vi7 ii7 V7' },
        { name: 'Imaj7—IV—iii—vi', chords: 'Imaj7 IVmaj7 iii7 vi7' },
        { name: 'Minor ii—V—i', chords: 'iiø7 V7 i7' },
        { name: 'Coltrane Changes', chords: 'Imaj7 V7/III IIImaj7 V7/bVI bVImaj7 V7/bII bIImaj7 V7' },
    ],
    'Modal': [
        { name: 'Dorian Vamp', chords: 'i7 IV7' },
        { name: 'Mixolydian Vamp', chords: 'I7 bVII' },
        { name: 'Phrygian Vamp', chords: 'i bII' },
        { name: 'Lydian Float', chords: 'Imaj7 II' },
        { name: 'Aeolian i—VI—VII', chords: 'i VI VII' },
        { name: 'Locrian Tension', chords: 'iø7 bII' },
    ],
    'Modal Interchange': [
        { name: 'I—bVII—IV', chords: 'I bVII IV' },
        { name: 'I—bVI—bVII', chords: 'I bVI bVII' },
        { name: 'i—bVI—bIII—bVII', chords: 'i bVI bIII bVII' },
        { name: 'I—iv—I', chords: 'I iv I' },
        { name: 'I—bIII—IV', chords: 'I bIII IV' },
    ],
    'Classical': [
        { name: 'Pachelbel Canon', chords: 'I V vi iii IV I IV V' },
        { name: 'Andalusian Cadence', chords: 'i VII VI V' },
        { name: 'Circle of Fifths', chords: 'I IV vii° iii vi ii V I' },
        { name: 'Romanesca', chords: 'I V vi III IV I IV V' },
        { name: 'La Folia', chords: 'i V i VII III VII i V i' },
    ],
    'Contemporary': [
        { name: 'Quartal Stack', chords: 'Isus4 IVsus4 Vsus4' },
        { name: 'Chromatic Mediant', chords: 'I bIII I III' },
        { name: 'Tritone Sub', chords: 'ii7 bII7 Imaj7' },
        { name: 'Neo-Soul', chords: 'Imaj9 IVmaj9 iii9 vi9' },
    ],
};

// Chord type intervals (semitones from root)
const chordIntervals = {
    // Triads
    'maj': [0, 4, 7],
    'min': [0, 3, 7],
    'm': [0, 3, 7],
    'dim': [0, 3, 6],
    '°': [0, 3, 6],
    'aug': [0, 4, 8],
    '+': [0, 4, 8],
    'sus2': [0, 2, 7],
    'sus4': [0, 5, 7],
    'sus': [0, 5, 7],

    // Seventh Chords
    'maj7': [0, 4, 7, 11],
    '7': [0, 4, 7, 10],
    'min7': [0, 3, 7, 10],
    'm7': [0, 3, 7, 10],
    'dim7': [0, 3, 6, 9],
    '°7': [0, 3, 6, 9],
    'ø7': [0, 3, 6, 10],
    'm7b5': [0, 3, 6, 10],
    'minmaj7': [0, 3, 7, 11],
    'mM7': [0, 3, 7, 11],
    'aug7': [0, 4, 8, 10],
    '+7': [0, 4, 8, 10],
    'augmaj7': [0, 4, 8, 11],

    // Extended Chords
    'maj9': [0, 4, 7, 11, 14],
    '9': [0, 4, 7, 10, 14],
    'min9': [0, 3, 7, 10, 14],
    'm9': [0, 3, 7, 10, 14],
    'add9': [0, 4, 7, 14],
    'madd9': [0, 3, 7, 14],
    '11': [0, 4, 7, 10, 14, 17],
    'min11': [0, 3, 7, 10, 14, 17],
    'm11': [0, 3, 7, 10, 14, 17],
    '13': [0, 4, 7, 10, 14, 21],
    'maj13': [0, 4, 7, 11, 14, 21],

    // Sixth Chords
    '6': [0, 4, 7, 9],
    'min6': [0, 3, 7, 9],
    'm6': [0, 3, 7, 9],
    '6/9': [0, 4, 7, 9, 14],

    // Altered Chords
    '7b9': [0, 4, 7, 10, 13],
    '7#9': [0, 4, 7, 10, 15],
    '7b5': [0, 4, 6, 10],
    '7#5': [0, 4, 8, 10],
    '7alt': [0, 4, 8, 10, 13],

    // Power Chord
    '5': [0, 7],
};

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Get the semitone offset for a key
 * @param {string} key - Key name (e.g., 'C', 'F♯/G♭')
 * @returns {number} - Semitone offset (0-11)
 */
export function getKeyOffset(key) {
    const index = keys.indexOf(key);
    return index >= 0 ? index : 0;
}

/**
 * Get scale degrees for a mode
 * @param {string} modeName - Name of the mode
 * @returns {number[]} - Array of semitone intervals
 */
export function getScaleDegrees(modeName) {
    return modes[modeName] || modes['Major'];
}

/**
 * Determine chord quality for a scale degree in a given mode
 * @param {number} degree - Scale degree (0-6)
 * @param {string} mode - Mode name
 * @returns {string} - Chord quality
 */
export function getChordQualityForMode(degree, mode) {
    const qualities = {
        'Major': ['maj', 'min', 'min', 'maj', 'maj', 'min', 'dim'],
        'Minor': ['min', 'dim', 'maj', 'min', 'min', 'maj', 'maj'],
        'Dorian': ['min', 'min', 'maj', 'maj', 'min', 'dim', 'maj'],
        'Phrygian': ['min', 'maj', 'maj', 'min', 'dim', 'maj', 'min'],
        'Lydian': ['maj', 'maj', 'min', 'dim', 'maj', 'min', 'min'],
        'Mixolydian': ['maj', 'min', 'dim', 'maj', 'min', 'min', 'maj'],
        'Locrian': ['dim', 'maj', 'min', 'min', 'maj', 'maj', 'min'],
        'Harmonic Minor': ['min', 'dim', 'aug', 'min', 'maj', 'maj', 'dim'],
        'Melodic Minor': ['min', 'min', 'aug', 'maj', 'maj', 'dim', 'dim'],
    };

    const modeQualities = qualities[mode] || qualities['Major'];
    return modeQualities[degree % modeQualities.length];
}

// ============================================================================
// Chord Building
// ============================================================================

/**
 * Build a chord from a root note and chord type
 * @param {number} rootNote - MIDI note number for root
 * @param {string} chordType - Chord type (e.g., 'maj', 'min7')
 * @returns {number[]} - Array of MIDI note numbers
 */
export function buildChordRaw(rootNote, chordType) {
    const intervals = chordIntervals[chordType] || chordIntervals['maj'];
    return intervals.map(interval => rootNote + interval);
}

/**
 * Build a chord with voicing optimization
 * @param {number} rootNote - MIDI note number for root
 * @param {string} chordType - Chord type
 * @param {Object} options - Voicing options
 * @returns {number[]} - Array of MIDI note numbers
 */
export function buildChord(rootNote, chordType, options = {}) {
    const {
        inversion = 0,
        spread = false,
        dropVoicing = null,
        maxNotes = null,
    } = options;

    let notes = buildChordRaw(rootNote, chordType);

    // Apply inversion
    if (inversion > 0) {
        for (let i = 0; i < inversion && i < notes.length; i++) {
            notes[i] += 12;
        }
        notes.sort((a, b) => a - b);
    }

    // Apply drop voicing (drop 2, drop 3, etc.)
    if (dropVoicing && notes.length >= dropVoicing + 1) {
        const dropIndex = notes.length - dropVoicing;
        notes[dropIndex] -= 12;
        notes.sort((a, b) => a - b);
    }

    // Spread voicing (open position)
    if (spread && notes.length >= 3) {
        for (let i = 1; i < notes.length; i += 2) {
            notes[i] += 12;
        }
        notes.sort((a, b) => a - b);
    }

    // Limit number of notes
    if (maxNotes && notes.length > maxNotes) {
        notes = notes.slice(0, maxNotes);
    }

    return notes;
}

// ============================================================================
// Roman Numeral Parsing
// ============================================================================

/**
 * Parse a Roman numeral chord symbol
 * @param {string} symbol - Roman numeral (e.g., 'IV', 'viio7', 'bIII')
 * @returns {Object} - Parsed chord info
 */
export function parseRomanNumeral(symbol) {
    const result = {
        degree: 0,
        quality: 'maj',
        isMinor: false,
        accidental: 0,
        extension: '',
        slash: null,
    };

    let remaining = symbol.trim();

    // Check for slash chord
    const slashIndex = remaining.indexOf('/');
    if (slashIndex > 0) {
        result.slash = remaining.substring(slashIndex + 1);
        remaining = remaining.substring(0, slashIndex);
    }

    // Check for accidentals (b or #)
    while (remaining.startsWith('b') || remaining.startsWith('♭')) {
        result.accidental -= 1;
        remaining = remaining.substring(1);
    }
    while (remaining.startsWith('#') || remaining.startsWith('♯')) {
        result.accidental += 1;
        remaining = remaining.substring(1);
    }

    // Parse Roman numeral
    const numerals = {
        'I': 0, 'II': 1, 'III': 2, 'IV': 3, 'V': 4, 'VI': 5, 'VII': 6,
        'i': 0, 'ii': 1, 'iii': 2, 'iv': 3, 'v': 4, 'vi': 5, 'vii': 6,
    };

    // Find the longest matching numeral
    let numeralStr = '';
    for (const numeral of Object.keys(numerals).sort((a, b) => b.length - a.length)) {
        if (remaining.toUpperCase().startsWith(numeral.toUpperCase())) {
            numeralStr = remaining.substring(0, numeral.length);
            remaining = remaining.substring(numeral.length);
            break;
        }
    }

    if (numeralStr) {
        result.degree = numerals[numeralStr.toUpperCase()];
        result.isMinor = numeralStr === numeralStr.toLowerCase();
    }

    // Parse quality/extension
    result.extension = remaining;

    // Determine quality from extension and case
    if (remaining.includes('maj7') || remaining.includes('M7')) {
        result.quality = 'maj7';
    } else if (remaining.includes('m7b5') || remaining.includes('ø')) {
        result.quality = 'm7b5';
    } else if (remaining.includes('dim7') || remaining.includes('°7')) {
        result.quality = 'dim7';
    } else if (remaining.includes('dim') || remaining.includes('°')) {
        result.quality = 'dim';
    } else if (remaining.includes('aug') || remaining.includes('+')) {
        result.quality = 'aug';
    } else if (remaining.includes('m7') || remaining.includes('min7')) {
        result.quality = 'm7';
    } else if (remaining.includes('7')) {
        result.quality = '7';
    } else if (remaining.includes('sus4')) {
        result.quality = 'sus4';
    } else if (remaining.includes('sus2')) {
        result.quality = 'sus2';
    } else if (remaining.includes('m') || remaining.includes('min') || result.isMinor) {
        result.quality = 'min';
    } else {
        result.quality = 'maj';
    }

    return result;
}

/**
 * Generate chord progression from Roman numeral string
 * @param {string} progressionString - Space-separated Roman numerals
 * @param {number} keyOffset - Key offset in semitones
 * @param {number[]} scaleDegrees - Scale degrees for the mode
 * @param {string} mode - Mode name
 * @param {number} baseOctave - Base octave (default 4 = middle C area)
 * @returns {Array} - Array of chord objects
 */
export function generateProgressionChords(progressionString, keyOffset, scaleDegrees, mode, baseOctave = 4) {
    const symbols = progressionString.split(/\s+/).filter(s => s.length > 0);
    const chords = [];

    for (const symbol of symbols) {
        const parsed = parseRomanNumeral(symbol);

        // Calculate root note
        let rootInterval = scaleDegrees[parsed.degree] || 0;
        rootInterval += parsed.accidental;

        const rootNote = (baseOctave + 1) * 12 + keyOffset + rootInterval;

        // Build the chord
        const notes = buildChord(rootNote, parsed.quality);

        chords.push({
            symbol,
            notes,
            rootNote,
            quality: parsed.quality,
            degree: parsed.degree,
            parsed,
        });
    }

    return chords;
}

// ============================================================================
// Note Naming
// ============================================================================

const noteNames = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const noteNamesFlat = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];

/**
 * Get note name from MIDI number
 * @param {number} midiNote - MIDI note number
 * @param {boolean} useFlats - Use flats instead of sharps
 * @param {boolean} includeOctave - Include octave number
 * @returns {string} - Note name
 */
export function getNoteName(midiNote, useFlats = false, includeOctave = true) {
    const names = useFlats ? noteNamesFlat : noteNames;
    const noteName = names[midiNote % 12];
    const octave = Math.floor(midiNote / 12) - 1;
    return includeOctave ? `${noteName}${octave}` : noteName;
}

/**
 * Get chord name from notes
 * @param {number[]} notes - MIDI note numbers
 * @param {boolean} useFlats - Use flats for naming
 * @returns {string} - Chord name
 */
export function getChordNameFromNotes(notes, useFlats = false) {
    if (!notes || notes.length === 0) return '?';

    const rootName = getNoteName(notes[0], useFlats, false);

    // Calculate intervals from root
    const intervals = notes.map(n => ((n - notes[0]) % 12 + 12) % 12).sort((a, b) => a - b);
    const uniqueIntervals = [...new Set(intervals)];

    // Determine chord type
    let suffix = '';
    const has = (i) => uniqueIntervals.includes(i);

    if (has(4) && has(7)) {
        if (has(11)) suffix = 'maj7';
        else if (has(10)) suffix = '7';
        else if (has(9)) suffix = '6';
        else suffix = '';
    } else if (has(3) && has(7)) {
        if (has(10)) suffix = 'm7';
        else if (has(11)) suffix = 'mM7';
        else suffix = 'm';
    } else if (has(3) && has(6)) {
        if (has(9)) suffix = 'dim7';
        else if (has(10)) suffix = 'm7b5';
        else suffix = 'dim';
    } else if (has(4) && has(8)) {
        suffix = 'aug';
    } else if (has(5) && has(7)) {
        suffix = 'sus4';
    } else if (has(2) && has(7)) {
        suffix = 'sus2';
    } else if (has(7) && !has(3) && !has(4)) {
        suffix = '5';
    }

    return rootName + suffix;
}

// ============================================================================
// Voice Leading
// ============================================================================

/**
 * Calculate voice leading distance between two chords
 * @param {number[]} chord1 - First chord notes
 * @param {number[]} chord2 - Second chord notes
 * @returns {number} - Total semitone distance
 */
export function calculateVoiceLeadingDistance(chord1, chord2) {
    if (!chord1.length || !chord2.length) return 0;

    let totalDistance = 0;
    const len = Math.min(chord1.length, chord2.length);

    // Simple approach: compare notes by position
    const sorted1 = [...chord1].sort((a, b) => a - b);
    const sorted2 = [...chord2].sort((a, b) => a - b);

    for (let i = 0; i < len; i++) {
        totalDistance += Math.abs(sorted1[i] - sorted2[i]);
    }

    return totalDistance;
}

/**
 * Find the best inversion of a chord for voice leading
 * @param {number[]} targetChord - Chord to voice
 * @param {number[]} previousChord - Previous chord for reference
 * @returns {number[]} - Best voiced chord
 */
export function findBestVoicing(targetChord, previousChord) {
    if (!previousChord || previousChord.length === 0) {
        return targetChord;
    }

    let bestVoicing = targetChord;
    let bestDistance = calculateVoiceLeadingDistance(previousChord, targetChord);

    // Try inversions
    for (let inv = 1; inv < targetChord.length; inv++) {
        const inverted = [...targetChord];
        for (let i = 0; i < inv; i++) {
            inverted[i] += 12;
        }
        inverted.sort((a, b) => a - b);

        const distance = calculateVoiceLeadingDistance(previousChord, inverted);
        if (distance < bestDistance) {
            bestDistance = distance;
            bestVoicing = inverted;
        }
    }

    // Try octave shift
    const shiftedUp = targetChord.map(n => n + 12);
    const shiftedDown = targetChord.map(n => n - 12);

    if (calculateVoiceLeadingDistance(previousChord, shiftedUp) < bestDistance) {
        bestVoicing = shiftedUp;
        bestDistance = calculateVoiceLeadingDistance(previousChord, shiftedUp);
    }

    if (calculateVoiceLeadingDistance(previousChord, shiftedDown) < bestDistance) {
        bestVoicing = shiftedDown;
    }

    return bestVoicing;
}

/**
 * Optimize voice leading for a chord progression
 * @param {Array} chords - Array of chord objects with notes
 * @returns {Array} - Chords with optimized voicings
 */
export function optimizeVoiceLeading(chords) {
    if (chords.length === 0) return chords;

    const optimized = [{ ...chords[0] }];

    for (let i = 1; i < chords.length; i++) {
        const previousNotes = optimized[i - 1].notes;
        const currentNotes = chords[i].notes;

        const bestVoicing = findBestVoicing(currentNotes, previousNotes);

        optimized.push({
            ...chords[i],
            notes: bestVoicing,
        });
    }

    return optimized;
}

// ============================================================================
// Exports Summary
// ============================================================================

export default {
    keys,
    modes,
    progressions,
    getKeyOffset,
    getScaleDegrees,
    getChordQualityForMode,
    buildChordRaw,
    buildChord,
    parseRomanNumeral,
    generateProgressionChords,
    getNoteName,
    getChordNameFromNotes,
    calculateVoiceLeadingDistance,
    findBestVoicing,
    optimizeVoiceLeading,
};
