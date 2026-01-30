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

// Chord type intervals (semitones from root) - Complete CPG-compatible set
const chordIntervals = {
    // Triads
    'major': [0, 4, 7],
    'maj': [0, 4, 7],
    'minor': [0, 3, 7],
    'min': [0, 3, 7],
    'm': [0, 3, 7],
    'diminished': [0, 3, 6],
    'dim': [0, 3, 6],
    '°': [0, 3, 6],
    'augmented': [0, 4, 8],
    'aug': [0, 4, 8],
    '+': [0, 4, 8],
    'sus2': [0, 2, 7],
    'sus4': [0, 5, 7],
    'sus': [0, 5, 7],

    // Seventh Chords
    'major7': [0, 4, 7, 11],
    'maj7': [0, 4, 7, 11],
    'dom7': [0, 4, 7, 10],
    '7': [0, 4, 7, 10],
    'minor7': [0, 3, 7, 10],
    'min7': [0, 3, 7, 10],
    'm7': [0, 3, 7, 10],
    'dim7': [0, 3, 6, 9],
    '°7': [0, 3, 6, 9],
    'm7b5': [0, 3, 6, 10],
    'ø7': [0, 3, 6, 10],
    'minMaj7': [0, 3, 7, 11],
    'minmaj7': [0, 3, 7, 11],
    'mM7': [0, 3, 7, 11],
    'aug7': [0, 4, 8, 10],
    '+7': [0, 4, 8, 10],
    'augMaj7': [0, 4, 8, 11],
    'augmaj7': [0, 4, 8, 11],

    // Extended Chords
    'major9': [0, 4, 7, 11, 14],
    'maj9': [0, 4, 7, 11, 14],
    'minor9': [0, 3, 7, 10, 14],
    'min9': [0, 3, 7, 10, 14],
    'm9': [0, 3, 7, 10, 14],
    'dom9': [0, 4, 7, 10, 14],
    '9': [0, 4, 7, 10, 14],
    'dom7b9': [0, 4, 7, 10, 13],
    '7b9': [0, 4, 7, 10, 13],
    'dom7sharp9': [0, 4, 7, 10, 15],
    '7#9': [0, 4, 7, 10, 15],
    'add9': [0, 4, 7, 14],
    'minAdd9': [0, 3, 7, 14],
    'madd9': [0, 3, 7, 14],
    'add11': [0, 4, 7, 17],
    'major11': [0, 4, 7, 11, 14, 17],
    'minor11': [0, 3, 7, 10, 14, 17],
    'm11': [0, 3, 7, 10, 14, 17],
    'dom11': [0, 4, 7, 10, 14, 17],
    '11': [0, 4, 7, 10, 14, 17],
    'major13': [0, 4, 7, 11, 14, 21],
    'maj13': [0, 4, 7, 11, 14, 21],
    'minor13': [0, 3, 7, 10, 14, 21],
    'dom13': [0, 4, 7, 10, 14, 21],
    '13': [0, 4, 7, 10, 14, 21],
    'dom7alt': [0, 4, 8, 10, 15],
    '7alt': [0, 4, 8, 10, 13],
    'dom7b5': [0, 4, 6, 10],
    '7b5': [0, 4, 6, 10],
    '7#5': [0, 4, 8, 10],

    // Sixth Chords
    'major6': [0, 4, 7, 9],
    '6': [0, 4, 7, 9],
    'minor6': [0, 3, 7, 9],
    'min6': [0, 3, 7, 9],
    'm6': [0, 3, 7, 9],
    'maj6/9': [0, 4, 7, 9, 14],
    '6/9': [0, 4, 7, 9, 14],

    // Quartal Voicings
    'quartal': [0, 5, 10],
    'quartal4': [0, 5, 10, 15],

    // Shell Voicings (root, 3rd, 7th)
    'shell7': [0, 4, 11],
    'shellm7': [0, 3, 10],
    'shelldom7': [0, 4, 10],

    // Rootless Voicings (for jazz piano)
    'rootless7A': [4, 7, 11, 14],
    'rootlessm7A': [3, 7, 10, 14],
    'rootlessdom7A': [4, 7, 10, 14],
    'rootless7B': [11, 14, 16, 19],
    'rootlessm7B': [10, 14, 15, 19],
    'rootlessdom7B': [10, 14, 16, 19],

    // Augmented 6th Chords
    'It6': [0, 4, 10],
    'Fr6': [0, 4, 6, 10],
    'Ger6': [0, 4, 7, 10],

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
// Voice Leading - Complete CPG-compatible implementation
// ============================================================================

/**
 * Generate all inversions of a chord (CPG-compatible)
 * @param {number[]} chordNotes - Original chord notes
 * @returns {number[][]} - Array of all inversions
 */
export function generateInversions(chordNotes) {
    const inversions = [];
    const baseChord = [...chordNotes];

    // Root position
    inversions.push([...baseChord]);

    // First inversion (move root up an octave)
    if (baseChord.length >= 2) {
        const firstInv = [...baseChord];
        firstInv[0] += 12;
        inversions.push(firstInv.sort((a, b) => a - b));
    }

    // Second inversion (move root and third up an octave)
    if (baseChord.length >= 3) {
        const secondInv = [...baseChord];
        secondInv[0] += 12;
        secondInv[1] += 12;
        inversions.push(secondInv.sort((a, b) => a - b));
    }

    // Drop voicings (move top note down an octave)
    if (baseChord.length >= 3) {
        const drop2 = [...baseChord];
        drop2[drop2.length - 1] -= 12;
        inversions.push(drop2.sort((a, b) => a - b));
    }

    return inversions;
}

/**
 * Calculate voice leading distance between two chords (CPG-compatible)
 * Uses a simplified version of the Hungarian algorithm approach
 * @param {number[]} chord1Notes - First chord notes
 * @param {number[]} chord2Notes - Second chord notes
 * @returns {number} - Total semitone distance
 */
export function calculateVoiceLeadingDistance(chord1Notes, chord2Notes) {
    if (!chord1Notes || !chord2Notes || !chord1Notes.length || !chord2Notes.length) return 0;

    const maxLength = Math.max(chord1Notes.length, chord2Notes.length);
    const notes1 = [...chord1Notes];
    const notes2 = [...chord2Notes];

    // Pad shorter chord
    while (notes1.length < maxLength) notes1.push(notes1[notes1.length - 1] + 12);
    while (notes2.length < maxLength) notes2.push(notes2[notes2.length - 1] + 12);

    // Simple greedy assignment for voice leading distance
    const sorted1 = [...notes1].sort((a, b) => a - b);
    const sorted2 = [...notes2].sort((a, b) => a - b);

    let totalDistance = 0;
    for (let i = 0; i < maxLength; i++) {
        totalDistance += Math.abs(sorted1[i] - sorted2[i]);
    }

    return totalDistance;
}

/**
 * Build a voicing from a bass note using pitch classes
 * @param {number} bassNote - Bass MIDI note
 * @param {number[]} pitchClasses - Pitch classes to include
 * @returns {number[]} - Voicing notes
 */
function buildVoicingFromBass(bassNote, pitchClasses) {
    const voicing = [bassNote];
    let currentNote = bassNote;

    for (let i = 1; i < pitchClasses.length; i++) {
        const targetPC = pitchClasses[i];
        let nextNote = currentNote + 1;
        while ((nextNote % 12) !== targetPC) {
            nextNote++;
        }
        voicing.push(nextNote);
        currentNote = nextNote;
    }

    return voicing;
}

/**
 * Generate smooth voicings for a chord (CPG-compatible)
 * @param {number[]} chordNotes - Original chord notes
 * @returns {number[][]} - Array of possible voicings
 */
function generateSmoothVoicings(chordNotes) {
    const voicings = [];
    const sorted = [...chordNotes].sort((a, b) => a - b);
    const pitchClasses = sorted.map(n => n % 12);
    const uniquePCs = [...new Set(pitchClasses)];

    // Try different bass notes within a reasonable range (C3 to C5)
    for (let bassNote = 48; bassNote <= 72; bassNote++) {
        if (uniquePCs.includes(bassNote % 12)) {
            const voicing = buildVoicingFromBass(bassNote, uniquePCs);
            if (voicing.length === uniquePCs.length) {
                voicings.push(voicing);
            }
        }
    }

    return voicings;
}

/**
 * Score voice leading between two voicings (CPG-compatible)
 * Lower score = smoother voice leading
 * @param {number[]} currentNotes - Current chord notes
 * @param {number[]} previousNotes - Previous chord notes
 * @returns {Object} - Score and breakdown
 */
function scoreVoiceLeading(currentNotes, previousNotes) {
    if (!previousNotes || previousNotes.length === 0) {
        const lowest = Math.min(...currentNotes);
        const highest = Math.max(...currentNotes);
        const rangePenalty = (lowest < 48 || highest > 84) ? 20 : 0;
        return { score: rangePenalty, breakdown: { range: rangePenalty } };
    }

    let score = 0;
    const breakdown = {};

    const maxLen = Math.max(currentNotes.length, previousNotes.length);
    const curr = [...currentNotes].sort((a, b) => a - b);
    const prev = [...previousNotes].sort((a, b) => a - b);

    while (curr.length < maxLen) curr.push(curr[curr.length - 1] + 12);
    while (prev.length < maxLen) prev.push(prev[prev.length - 1] + 12);

    const movements = [];
    const used = new Set();

    prev.forEach(prevNote => {
        let minDist = Infinity;
        let bestIdx = -1;

        curr.forEach((currNote, idx) => {
            if (!used.has(idx)) {
                const dist = Math.abs(currNote - prevNote);
                if (dist < minDist) {
                    minDist = dist;
                    bestIdx = idx;
                }
            }
        });

        if (bestIdx >= 0) {
            movements.push({ from: prevNote, to: curr[bestIdx], distance: minDist });
            used.add(bestIdx);
        }
    });

    // Total voice movement
    const totalMovement = movements.reduce((sum, m) => sum + m.distance, 0);
    score += totalMovement;
    breakdown.totalMovement = totalMovement;

    // Common tones bonus
    const commonTones = movements.filter(m => m.distance === 0).length;
    const commonToneBonus = commonTones * -5;
    score += commonToneBonus;
    breakdown.commonTones = commonToneBonus;

    // Stepwise motion bonus
    const stepwiseMotions = movements.filter(m => m.distance > 0 && m.distance <= 2).length;
    const stepwiseBonus = stepwiseMotions * -2;
    score += stepwiseBonus;
    breakdown.stepwise = stepwiseBonus;

    // Contrary motion bonus
    let contraryMotionCount = 0;
    for (let i = 0; i < movements.length; i++) {
        for (let j = i + 1; j < movements.length; j++) {
            const dir1 = Math.sign(movements[i].to - movements[i].from);
            const dir2 = Math.sign(movements[j].to - movements[j].from);
            if (dir1 !== 0 && dir2 !== 0 && dir1 !== dir2) {
                contraryMotionCount++;
            }
        }
    }
    const contraryMotionBonus = contraryMotionCount * -3;
    score += contraryMotionBonus;
    breakdown.contraryMotion = contraryMotionBonus;

    // Range penalty
    const outOfRange = curr.filter(n => n < 48 || n > 84).length;
    const rangePenalty = outOfRange * 10;
    score += rangePenalty;
    breakdown.range = rangePenalty;

    // Large leap penalty
    const leapPenalty = movements.reduce((sum, m) => {
        if (m.distance > 4) {
            return sum + (m.distance - 4) * 2;
        }
        return sum;
    }, 0);
    score += leapPenalty;
    breakdown.leaps = leapPenalty;

    return { score, breakdown };
}

/**
 * Find best voicing for standard voice leading (CPG-compatible)
 * @param {number[]} targetChordNotes - Target chord notes
 * @param {number[]} previousChordNotes - Previous chord notes
 * @returns {number[]} - Best voicing
 */
export function findBestVoicing(targetChordNotes, previousChordNotes) {
    if (!previousChordNotes) {
        return targetChordNotes;
    }

    const inversions = generateInversions(targetChordNotes);
    let bestInversion = targetChordNotes;
    let minDistance = Infinity;

    inversions.forEach(inversion => {
        const distance = calculateVoiceLeadingDistance(previousChordNotes, inversion);
        if (distance < minDistance) {
            minDistance = distance;
            bestInversion = inversion;
        }
    });

    return bestInversion;
}

/**
 * Find best smooth voicing (CPG-compatible) - for Smooth variant
 * @param {number[]} targetChordNotes - Target chord notes
 * @param {number[]} previousChordNotes - Previous chord notes
 * @returns {number[]} - Best smooth voicing
 */
function findBestSmoothVoicing(targetChordNotes, previousChordNotes) {
    if (!previousChordNotes) {
        const sorted = [...targetChordNotes].sort((a, b) => a - b);
        const bass = sorted[0];
        const targetBass = 60;
        const offset = targetBass - bass;
        return sorted.map(n => n + offset);
    }

    const voicings = generateSmoothVoicings(targetChordNotes);
    let bestVoicing = targetChordNotes;
    let bestScore = Infinity;

    voicings.forEach(voicing => {
        const { score } = scoreVoiceLeading(voicing, previousChordNotes);
        if (score < bestScore) {
            bestScore = score;
            bestVoicing = voicing;
        }
    });

    return bestVoicing;
}

/**
 * Apply close voicing (CPG-compatible)
 * @param {number[]} chordNotes - Chord notes
 * @returns {number[]} - Close voiced notes
 */
export function applyCloseVoicing(chordNotes) {
    if (chordNotes.length === 0) return chordNotes;

    const sorted = [...chordNotes].sort((a, b) => a - b);
    const bass = sorted[0];
    const pitchClasses = sorted.map(note => note % 12);

    const closeVoiced = [bass];
    let currentNote = bass;

    for (let i = 1; i < pitchClasses.length; i++) {
        const targetPC = pitchClasses[i];
        let nextNote = currentNote + 1;
        while ((nextNote % 12) !== targetPC) {
            nextNote++;
        }
        closeVoiced.push(nextNote);
        currentNote = nextNote;
    }

    return closeVoiced;
}

/**
 * Apply open voicing (CPG-compatible)
 * @param {number[]} chordNotes - Chord notes
 * @returns {number[]} - Open voiced notes
 */
export function applyOpenVoicing(chordNotes) {
    if (chordNotes.length < 3) return chordNotes;

    const sorted = [...chordNotes].sort((a, b) => a - b);
    const openVoiced = [...sorted];

    if (openVoiced.length >= 3) {
        openVoiced[openVoiced.length - 2] -= 12;
    }

    return openVoiced.sort((a, b) => a - b);
}

/**
 * Apply spread voicing (CPG-compatible)
 * @param {number[]} chordNotes - Chord notes
 * @returns {number[]} - Spread voiced notes
 */
export function applySpreadVoicing(chordNotes) {
    if (chordNotes.length < 3) return chordNotes;

    const sorted = [...chordNotes].sort((a, b) => a - b);
    const bass = sorted[0];
    const pitchClasses = sorted.map(note => note % 12);

    const spreadVoiced = [bass];
    let octaveOffset = 0;

    for (let i = 1; i < pitchClasses.length; i++) {
        const targetPC = pitchClasses[i];
        octaveOffset += (i === 1) ? 7 : 5;
        let nextNote = bass + octaveOffset;
        while ((nextNote % 12) !== targetPC) {
            nextNote++;
        }
        spreadVoiced.push(nextNote);
    }

    return spreadVoiced.sort((a, b) => a - b);
}

/**
 * Apply voicing style to a chord progression (CPG-compatible)
 * @param {Array} chordProgression - Array of chord objects
 * @param {string} voicingType - 'close', 'open', or 'spread'
 * @returns {Array} - Progression with applied voicing style
 */
export function applyVoicingStyle(chordProgression, voicingType = 'default') {
    if (voicingType === 'default') return chordProgression;

    return chordProgression.map(chord => {
        let voicedNotes = chord.notes;

        switch (voicingType) {
            case 'close':
                voicedNotes = applyCloseVoicing(chord.notes);
                break;
            case 'open':
                voicedNotes = applyOpenVoicing(chord.notes);
                break;
            case 'spread':
                voicedNotes = applySpreadVoicing(chord.notes);
                break;
        }

        return {
            ...chord,
            notes: voicedNotes
        };
    });
}

/**
 * Optimize voice leading for a chord progression (CPG-compatible)
 * Standard version using inversions
 * @param {Array} chords - Array of chord objects with notes
 * @returns {Array} - Chords with optimized voicings
 */
export function optimizeVoiceLeading(chords) {
    if (chords.length === 0) return chords;

    const optimized = [];
    let previousNotes = null;

    chords.forEach((chord, index) => {
        const optimizedNotes = findBestVoicing(chord.notes, previousNotes);
        optimized.push({
            ...chord,
            notes: optimizedNotes
        });
        previousNotes = optimizedNotes;
    });

    return optimized;
}

/**
 * Optimize smooth voice leading (CPG-compatible) - for Smooth variant
 * Uses comprehensive scoring with common tones, stepwise motion, contrary motion
 * @param {Array} chords - Array of chord objects with notes
 * @returns {Array} - Chords with smooth voicings
 */
export function optimizeSmoothVoiceLeading(chords) {
    if (chords.length === 0) return chords;

    const optimized = [];
    let previousNotes = null;

    chords.forEach((chord, index) => {
        const optimizedNotes = findBestSmoothVoicing(chord.notes, previousNotes);
        optimized.push({
            ...chord,
            notes: optimizedNotes
        });
        previousNotes = optimizedNotes;
    });

    return optimized;
}

/**
 * Analyze voice leading between two chords (CPG-compatible)
 * @param {number[]} notes1 - First chord notes
 * @param {number[]} notes2 - Second chord notes
 * @returns {Object} - Voice leading analysis
 */
export function analyzeVoiceLeading(notes1, notes2) {
    if (!notes1 || !notes2 || notes1.length === 0 || notes2.length === 0) {
        return null;
    }

    const pc1 = notes1.map(n => n % 12);
    const pc2 = notes2.map(n => n % 12);
    const commonTones = pc1.filter(pc => pc2.includes(pc));
    const movements = [];

    for (let i = 0; i < Math.min(notes1.length, notes2.length); i++) {
        const interval = Math.abs(notes2[i] - notes1[i]);
        movements.push(interval === 0 ? 'common tone' :
            interval <= 2 ? 'step motion' :
                interval <= 4 ? 'skip' : 'leap');
    }

    return {
        commonTones: commonTones.length,
        stepMotion: movements.filter(m => m === 'step motion').length,
        smoothness: commonTones.length + movements.filter(m => m === 'step motion').length
    };
}

/**
 * Get inversion notation for display (CPG-compatible)
 * @param {number[]} notes - Chord notes
 * @param {string} chordType - Chord type
 * @param {string} chordName - Chord name
 * @param {string} romanNumeral - Roman numeral
 * @returns {string} - Inversion notation (e.g., '/E3')
 */
export function getInversionNotation(notes, chordType, chordName, romanNumeral = '') {
    if (!notes || notes.length < 3) return '';

    const sorted = [...notes].sort((a, b) => a - b);
    const bassPitchClass = sorted[0] % 12;
    const pitchClasses = notes.map(n => n % 12);
    const pitchClassSet = new Set(pitchClasses);

    let thirdInterval, fifthInterval;

    if (chordType && (chordType.includes('minor') || chordType.includes('min') || chordType === 'm')) {
        thirdInterval = 3;
        fifthInterval = 7;
    } else if (chordType && (chordType.includes('dim') || chordType === '°')) {
        thirdInterval = 3;
        fifthInterval = 6;
    } else {
        thirdInterval = 4;
        fifthInterval = 7;
    }

    let rootPitchClass = null;

    for (const pc of pitchClassSet) {
        const third = (pc + thirdInterval) % 12;
        const fifth = (pc + fifthInterval) % 12;

        if (pitchClassSet.has(third) && pitchClassSet.has(fifth)) {
            rootPitchClass = pc;
            break;
        }
    }

    if (rootPitchClass === null) {
        rootPitchClass = bassPitchClass;
    }

    if (bassPitchClass === rootPitchClass) {
        return '';
    }

    const bassNote = sorted[0];
    const bassNoteName = getNoteName(bassNote, false, false);
    const bassOctave = Math.floor(bassNote / 12) - 1;

    return '/' + bassNoteName + bassOctave;
}

// ============================================================================
// Row 4 Dynamic Chord Generation (CPG-compatible)
// ============================================================================

/**
 * Get chord name from root note and chord type
 * @param {number} rootNote - Root MIDI note
 * @param {string} chordType - Chord type
 * @param {number} keyOffset - Key offset
 * @param {string} displayRoman - Optional display Roman numeral
 * @returns {string} - Chord name
 */
export function getChordName(rootNote, chordType, keyOffset, displayRoman = '') {
    const rootName = getNoteName(rootNote, false, false);
    const suffixes = {
        'major': '',
        'minor': 'm',
        'dom7': '7',
        'major7': 'maj7',
        'minor7': 'm7',
        'diminished': 'dim',
        'augmented': 'aug',
        'm7b5': 'm7♭5',
        'It6': 'It+6',
        'Fr6': 'Fr+6',
        'Ger6': 'Ger+6'
    };
    return rootName + (suffixes[chordType] || '');
}

/**
 * Analyze existing chords for Row 4 generation (CPG-compatible)
 * @param {Array} existingChords - Chords from rows 1-3
 * @returns {Object} - Analysis of existing harmony
 */
export function analyzeExistingChords(existingChords) {
    const analysis = {
        hasDominant7: false,
        hasSubdominant: false,
        roots: [],
        romanNumerals: new Set()
    };

    existingChords.forEach(chord => {
        if (chord.notes && chord.notes[0]) {
            analysis.roots.push(chord.notes[0] % 12);
        }
        if (chord.symbol) {
            analysis.romanNumerals.add(chord.symbol);
            if (chord.symbol.includes('V7')) {
                analysis.hasDominant7 = true;
            }
            if (chord.symbol.toLowerCase().includes('ii') || chord.symbol.includes('IV')) {
                analysis.hasSubdominant = true;
            }
        }
    });

    return analysis;
}

/**
 * Generate Row 4 chord candidates (CPG-compatible)
 * @param {number} keyOffset - Key offset
 * @param {number[]} scaleDegrees - Scale degrees
 * @param {Object} analysis - Analysis of existing chords
 * @param {string} variantType - Variant type
 * @returns {Array} - Candidate chords
 */
export function generateRow4Candidates(keyOffset, scaleDegrees, analysis, variantType) {
    const candidates = [];
    const baseNote = 60 + keyOffset;

    // ♭VII (borrowed from mixolydian/minor)
    const flatSeven = (scaleDegrees[0] + 10) % 12;
    candidates.push({
        root: flatSeven,
        notes: buildChordRaw(baseNote + flatSeven, 'major'),
        chordType: 'major',
        chordName: getChordName(baseNote + flatSeven, 'major', keyOffset),
        romanNumeral: '♭VII',
        quality: 'Major',
        category: 'borrowed',
        commonUsage: 0.9
    });

    // ♭VI (borrowed from minor)
    const flatSix = (scaleDegrees[0] + 8) % 12;
    candidates.push({
        root: flatSix,
        notes: buildChordRaw(baseNote + flatSix, 'major'),
        chordType: 'major',
        chordName: getChordName(baseNote + flatSix, 'major', keyOffset),
        romanNumeral: '♭VI',
        quality: 'Major',
        category: 'borrowed',
        commonUsage: 0.8
    });

    // V7 (dominant seventh)
    if (!analysis.hasDominant7 && scaleDegrees.length > 4) {
        const fifth = scaleDegrees[4 % scaleDegrees.length];
        candidates.push({
            root: fifth,
            notes: buildChordRaw(baseNote + fifth, 'dom7'),
            chordType: 'dom7',
            chordName: getChordName(baseNote + fifth, 'dom7', keyOffset),
            romanNumeral: 'V7',
            quality: 'Dominant 7',
            category: 'dominant',
            commonUsage: 1.0
        });
    }

    // ii7 (subdominant seventh)
    if (!analysis.hasSubdominant && scaleDegrees.length > 1) {
        const second = scaleDegrees[1 % scaleDegrees.length];
        candidates.push({
            root: second,
            notes: buildChordRaw(baseNote + second, 'minor7'),
            chordType: 'minor7',
            chordName: getChordName(baseNote + second, 'minor7', keyOffset),
            romanNumeral: 'ii7',
            quality: 'Minor 7',
            category: 'subdominant',
            commonUsage: 0.85
        });
    }

    // iv (minor subdominant - borrowed from parallel minor)
    if (scaleDegrees.length > 3) {
        const fourth = scaleDegrees[3 % scaleDegrees.length];
        candidates.push({
            root: fourth,
            notes: buildChordRaw(baseNote + fourth, 'minor'),
            chordType: 'minor',
            chordName: getChordName(baseNote + fourth, 'minor', keyOffset),
            romanNumeral: 'iv',
            quality: 'Minor',
            category: 'borrowed',
            commonUsage: 0.85
        });
    }

    // Secondary dominants (V7/x chords)
    if (scaleDegrees.length > 1) {
        // V7/V
        const vOfV = scaleDegrees[1 % scaleDegrees.length];
        candidates.push({
            root: vOfV,
            notes: buildChordRaw(baseNote + vOfV, 'dom7'),
            chordType: 'dom7',
            chordName: getChordName(baseNote + vOfV, 'dom7', keyOffset),
            romanNumeral: 'V7/V',
            quality: 'Dominant 7',
            category: 'secondary',
            commonUsage: 0.7
        });

        // V7/ii
        const vOfii = (scaleDegrees[0] + 9) % 12;
        candidates.push({
            root: vOfii,
            notes: buildChordRaw(baseNote + vOfii, 'dom7'),
            chordType: 'dom7',
            chordName: getChordName(baseNote + vOfii, 'dom7', keyOffset),
            romanNumeral: 'V7/ii',
            quality: 'Dominant 7',
            category: 'secondary',
            commonUsage: 0.5
        });

        // V7/vi
        const vOfvi = (scaleDegrees[0] + 4) % 12;
        candidates.push({
            root: vOfvi,
            notes: buildChordRaw(baseNote + vOfvi, 'dom7'),
            chordType: 'dom7',
            chordName: getChordName(baseNote + vOfvi, 'dom7', keyOffset),
            romanNumeral: 'V7/vi',
            quality: 'Dominant 7',
            category: 'secondary',
            commonUsage: 0.5
        });

        // V7/IV
        const vOfIV = scaleDegrees[0];
        candidates.push({
            root: vOfIV,
            notes: buildChordRaw(baseNote + vOfIV, 'dom7'),
            chordType: 'dom7',
            chordName: getChordName(baseNote + vOfIV, 'dom7', keyOffset),
            romanNumeral: 'V7/IV',
            quality: 'Dominant 7',
            category: 'secondary',
            commonUsage: 0.4
        });
    }

    // Augmented 6th chords (Classic and Jazz)
    if (variantType === 'Classic' || variantType === 'Jazz') {
        candidates.push({
            root: flatSix,
            notes: buildChordRaw(baseNote + flatSix, 'It6'),
            chordType: 'It6',
            chordName: getChordName(baseNote + flatSix, 'It6', keyOffset, 'It+6'),
            romanNumeral: 'It+6',
            quality: 'Italian 6th',
            category: 'augmented6th',
            commonUsage: 0.3
        });

        candidates.push({
            root: flatSix,
            notes: buildChordRaw(baseNote + flatSix, 'Ger6'),
            chordType: 'Ger6',
            chordName: getChordName(baseNote + flatSix, 'Ger6', keyOffset, 'Ger+6'),
            romanNumeral: 'Ger+6',
            quality: 'German 6th',
            category: 'augmented6th',
            commonUsage: 0.3
        });

        candidates.push({
            root: flatSix,
            notes: buildChordRaw(baseNote + flatSix, 'Fr6'),
            chordType: 'Fr6',
            chordName: getChordName(baseNote + flatSix, 'Fr6', keyOffset, 'Fr+6'),
            romanNumeral: 'Fr+6',
            quality: 'French 6th',
            category: 'augmented6th',
            commonUsage: 0.2
        });
    }

    // ♭III (borrowed)
    const flatThree = (scaleDegrees[0] + 3) % 12;
    candidates.push({
        root: flatThree,
        notes: buildChordRaw(baseNote + flatThree, 'major'),
        chordType: 'major',
        chordName: getChordName(baseNote + flatThree, 'major', keyOffset),
        romanNumeral: '♭III',
        quality: 'Major',
        category: 'borrowed',
        commonUsage: 0.5
    });

    // ♭II (Neapolitan)
    const neapolitan = (scaleDegrees[0] + 1) % 12;
    candidates.push({
        root: neapolitan,
        notes: buildChordRaw(baseNote + neapolitan, 'major'),
        chordType: 'major',
        chordName: getChordName(baseNote + neapolitan, 'major', keyOffset),
        romanNumeral: '♭II',
        quality: 'Major',
        category: 'chromatic',
        commonUsage: 0.4
    });

    // Jazz-specific: Tritone substitution
    if (variantType === 'Jazz' && scaleDegrees.length > 4) {
        const tritone = (scaleDegrees[4] + 6) % 12;
        candidates.push({
            root: tritone,
            notes: buildChordRaw(baseNote + tritone, 'dom7'),
            chordType: 'dom7',
            chordName: getChordName(baseNote + tritone, 'dom7', keyOffset, 'SubV7'),
            romanNumeral: 'SubV7',
            quality: 'Dominant 7',
            category: 'substitution',
            commonUsage: 0.5
        });
    }

    // Modal-specific: Lydian II
    if (variantType === 'Modal') {
        const lydianTwo = (scaleDegrees[0] + 2) % 12;
        candidates.push({
            root: lydianTwo,
            notes: buildChordRaw(baseNote + lydianTwo, 'major'),
            chordType: 'major',
            chordName: getChordName(baseNote + lydianTwo, 'major', keyOffset),
            romanNumeral: 'II',
            quality: 'Major',
            category: 'modal',
            commonUsage: 0.3
        });
    }

    return candidates;
}

/**
 * Score a candidate chord for Row 4 selection (CPG-compatible)
 * @param {Object} candidate - Candidate chord
 * @param {Object} analysis - Analysis of existing chords
 * @param {number[]} existingRoots - Roots of existing chords
 * @returns {number} - Score
 */
function scoreCandidate(candidate, analysis, existingRoots) {
    let score = candidate.commonUsage * 10;

    // Bonus for avoiding duplicate roots
    if (!existingRoots.includes(candidate.root)) {
        score += 5;
    }

    // Bonus for filling gaps in harmony
    if (candidate.category === 'dominant' && !analysis.hasDominant7) {
        score += 3;
    }
    if (candidate.category === 'subdominant' && !analysis.hasSubdominant) {
        score += 3;
    }

    return score;
}

/**
 * Select dynamic Row 4 chords (CPG-compatible)
 * @param {Array} existingChords - Chords from rows 1-3
 * @param {number} keyOffset - Key offset
 * @param {number[]} scaleDegrees - Scale degrees
 * @param {string} variantType - Variant type
 * @returns {Array} - Selected Row 4 chords
 */
export function selectDynamicRow4Chords(existingChords, keyOffset, scaleDegrees, variantType) {
    const analysis = analyzeExistingChords(existingChords);
    const candidates = generateRow4Candidates(keyOffset, scaleDegrees, analysis, variantType);
    const existingRoots = existingChords.map(c => c.notes && c.notes[0] ? c.notes[0] % 12 : 0);

    // Score and sort candidates
    const scoredCandidates = candidates.map(candidate => ({
        ...candidate,
        score: scoreCandidate(candidate, analysis, existingRoots)
    }));

    scoredCandidates.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return b.commonUsage - a.commonUsage;
    });

    // Take top 4, ensuring some diversity in categories
    const selected = [];
    const usedCategories = new Set();

    // First pass: get highest scoring from each unique category
    for (const chord of scoredCandidates) {
        if (selected.length >= 4) break;
        if (!usedCategories.has(chord.category) || selected.length < 2) {
            selected.push(chord);
            usedCategories.add(chord.category);
        }
    }

    // Fill remaining slots with highest scores
    for (const chord of scoredCandidates) {
        if (selected.length >= 4) break;
        if (!selected.includes(chord)) {
            selected.push(chord);
        }
    }

    return selected;
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
    getChordName,
    calculateVoiceLeadingDistance,
    generateInversions,
    findBestVoicing,
    optimizeVoiceLeading,
    optimizeSmoothVoiceLeading,
    applyCloseVoicing,
    applyOpenVoicing,
    applySpreadVoicing,
    applyVoicingStyle,
    analyzeVoiceLeading,
    getInversionNotation,
    analyzeExistingChords,
    generateRow4Candidates,
    selectDynamicRow4Chords,
};
