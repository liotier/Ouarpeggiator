/**
 * Ouarpeggiator - Main Application Module
 *
 * Euclidean rhythm arpeggiator with integrated chord progression generator.
 */

import { euclidean, rotatePattern } from './euclidean.js';
import * as MIDI from './midi.js';
import * as MusicTheory from './modules/musicTheory.js';
import * as Audio from './modules/audio.js';
import * as PianoRoll from './pianoRoll.js';
import * as EuclideanCircle from './euclideanCircle.js';
import * as MIDIDiagnostics from './midiDiagnostics.js';
import ChordProgressionSequencer from './chordProgressionSequencer.js';

// ============================================================================
// Juno-106 Integration
// ============================================================================

let junoWindow = null;
const JUNO_URL = 'https://liotier.github.io/Juno-106_maintenance-and-performance-improvements/';

// ============================================================================
// Application State
// ============================================================================

const appState = {
    // Generation mode
    generationMode: 'template',  // 'template' | 'scale'

    // Generator settings
    key: 0,
    mode: 'Major',
    progressionTemplate: 'I V vi IV',

    // Output mode
    outputMode: 'audio',  // 'audio' | 'midi'

    // Chord progression (16 pads)
    chordProgression: [],
    currentChordIndex: 0,

    // Variants (multiple voicing options)
    variants: [],
    currentVariantIndex: 0,

    // Chord matcher
    selectedChords: [],

    // Euclidean pattern
    euclidean: {
        hits: 7,
        steps: 16,
        rotation: 0,
        pattern: [],
    },
    octaveSpread: 1,

    // Timing
    bpm: 120,
    isPlaying: false,
    tickCount: 0,
    barsPerChord: 4,
    humanization: 0,

    // Playback mode
    playbackMode: 'arpeggio',  // 'arpeggio' | 'stab'

    // Chord variation
    harmonicAdherence: 70,  // 0-100, how strictly to follow harmonic rules

    // Note variation (arpeggio mode only)
    harmonicVariation: 0,
    rhythmicVariation: 0,
    voiceLeading: 'smooth',
    lastPlayedNote: null,

    // Chord stab settings
    strumSpeed: 0,  // 0-100ms delay between notes
    strumDirection: 'up',  // 'up' | 'down' | 'alternating'

    // Chord progression sequencing (Stab Mode only)
    chordSequencing: {
        enabled: true,  // Enable chord progression in stab mode
        stepsLocked: true,  // Lock steps to main euclidean (false = independent/flams)
        euclidean: {
            hits: 4,    // Chord changes per pattern
            steps: 16,  // Independent steps (when unlocked)
            rotation: 0,
            pattern: [],
        },
        stepIndex: 0,  // Current position in chord change pattern
    },

    // Velocity/Gate
    velocity: { mode: 'fixed', fixed: 100, randomMin: 60, randomMax: 110, curveType: 'linear-ascending', curveMin: 60, curveMax: 120 },
    gate: { mode: 'fixed', fixed: 0.8, randomMin: 0.5, randomMax: 0.9, curveType: 'linear-ascending', curveMin: 0.3, curveMax: 0.95 },
    curveSyncRotation: false,  // Sync curve start to Euclidean rotation

    // Runtime
    euclideanStepIndex: 0,

    // Generation tracking
    hasGeneratedOnce: false,

    // UI initialization tracking
    pianoRollInitialized: false,
    chordProgressionCircleInitialized: false,
};

// Timing constants
const TIMING = {
    SPARKLE_DURATION: 600,
};

// Trigger sparkle animation on Generate button
function triggerSparkle() {
    const btn = document.getElementById('generateBtn');
    if (btn) {
        btn.classList.add('sparkle');
        setTimeout(() => btn.classList.remove('sparkle'), TIMING.SPARKLE_DURATION);
    }
}

// ============================================================================
// Chord Matcher
// ============================================================================

function toggleChordMatcher() {
    const matcher = document.getElementById('chordMatcher');
    matcher.classList.toggle('expanded');
}

// Expose globally for onclick
window.toggleChordMatcher = toggleChordMatcher;

function addChordRequirement() {
    const noteSelect = document.getElementById('chordNote');
    const qualitySelect = document.getElementById('chordQuality');

    if (!noteSelect.value || !qualitySelect.value) return;

    const note = noteSelect.value;
    const quality = qualitySelect.value;

    const chord = {
        note,
        quality,
        name: note + (quality === 'major' ? '' : quality)
    };

    appState.selectedChords.push(chord);
    renderSelectedChords();
    updateSuggestions();

    // Reset selects
    noteSelect.value = '';
    qualitySelect.value = '';
}

// Expose globally for onclick
window.addChordRequirement = addChordRequirement;

function removeChordRequirement(index) {
    appState.selectedChords.splice(index, 1);
    renderSelectedChords();
    updateSuggestions();
}

// Expose globally for onclick
window.removeChordRequirement = removeChordRequirement;

function clearChordRequirements() {
    appState.selectedChords = [];
    renderSelectedChords();
    updateSuggestions();
}

// Expose globally for onclick
window.clearChordRequirements = clearChordRequirements;

function renderSelectedChords() {
    const container = document.getElementById('selectedChords');
    container.innerHTML = appState.selectedChords.map((chord, i) =>
        `<span class="chord-tag">${chord.name}<button onclick="removeChordRequirement(${i})">×</button></span>`
    ).join('');
}

function updateSuggestions() {
    const container = document.getElementById('suggestionList');
    const suggestionsContainer = document.getElementById('keyModeSuggestions');

    if (appState.selectedChords.length === 0) {
        suggestionsContainer.style.display = 'none';
        return;
    }

    suggestionsContainer.style.display = 'block';

    // Simple suggestion logic - find keys that contain all selected chords
    const suggestions = [];
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

    for (let key = 0; key < 12; key++) {
        ['Major', 'Minor'].forEach(mode => {
            suggestions.push({
                key,
                mode,
                name: `${noteNames[key]} ${mode}`
            });
        });
    }

    container.innerHTML = suggestions.slice(0, 8).map(s =>
        `<span class="suggestion-item compatible" onclick="applySuggestion(${s.key}, '${s.mode}')">${s.name}</span>`
    ).join(' ');
}

function applySuggestion(key, mode) {
    document.getElementById('keySelect').value = key;
    appState.key = key;

    if (mode === 'Major' || mode === 'Minor') {
        document.getElementById('modeSelect').value = mode;
        appState.mode = mode;
    }
}

window.applySuggestion = applySuggestion;

// ============================================================================
// Generation Mode Toggle
// ============================================================================

function switchGenerationMode(mode) {
    appState.generationMode = mode;

    const paletteContainer = document.getElementById('paletteModeContainer');
    const scaleContainer = document.getElementById('scaleModeContainer');

    if (mode === 'template') {
        paletteContainer.classList.add('active');
        scaleContainer.classList.remove('active');
    } else {
        paletteContainer.classList.remove('active');
        scaleContainer.classList.add('active');
    }
}

// ============================================================================
// Keyboard SVG Generation (from Chord Progression Generator)
// ============================================================================

function generateKeyboardSVG(notes) {
    if (!notes || notes.length === 0) return '';

    // Determine octave range to display - start at the lowest note's octave
    const minNote = Math.min(...notes);
    const startOctave = Math.floor(minNote / 12);
    const startNote = startOctave * 12;

    // Create set of active notes (absolute, not modulo)
    const activeNotes = new Set(notes);

    // Two octaves = 14 white keys
    const whiteKeyPattern = [0, 2, 4, 5, 7, 9, 11];
    const blackKeyPattern = [1, 3, 6, 8, 10];

    let svg = '<svg viewBox="0 0 196 35" xmlns="http://www.w3.org/2000/svg">';

    // Draw two octaves of white keys
    for (let octave = 0; octave < 2; octave++) {
        whiteKeyPattern.forEach((note, i) => {
            const x = (octave * 7 + i) * 14;
            const absoluteNote = startNote + (octave * 12) + note;
            const active = activeNotes.has(absoluteNote);
            svg += `<rect x="${x}" y="0" width="13" height="35" fill="${active ? '#f59e0b' : 'white'}" stroke="#333" stroke-width="1"/>`;
        });
    }

    // Draw two octaves of black keys
    const whiteKeyIndices = [0, 1, 3, 4, 5];
    for (let octave = 0; octave < 2; octave++) {
        blackKeyPattern.forEach((note, i) => {
            const x = (octave * 7 + whiteKeyIndices[i]) * 14 + 8.5;
            const absoluteNote = startNote + (octave * 12) + note;
            const active = activeNotes.has(absoluteNote);
            svg += `<rect x="${x}" y="0" width="10" height="21" fill="${active ? '#dc2626' : '#333'}" stroke="#000" stroke-width="1"/>`;
        });
    }

    svg += '</svg>';
    return svg;
}

// ============================================================================
// Variant Definitions
// ============================================================================

const VARIANT_TYPES = [
    { name: 'Smooth', description: 'Smooth variant: Maximizes common tones, step-wise motion, and contrary motion. Retains the voicings that have the smoothest transitions between chords.', octaveOffset: 0 },
    { name: 'Classic', description: 'Classic variant: Traditional root position voicings with standard voice leading. Clear, familiar harmonic progressions.', octaveOffset: 0 },
    { name: 'Jazz', description: 'Jazz variant: Extended voicings with added tensions (9ths, 11ths, 13ths). Rich harmonic color for sophisticated arrangements.', octaveOffset: 0 },
    { name: 'Modal', description: 'Modal variant: Open voicings in lower register emphasizing modal color tones. Spacious, atmospheric textures.', octaveOffset: -12 },
    { name: 'Experimental', description: 'Experimental variant: Wide intervals, unusual inversions, and unconventional voicings. For adventurous harmonic exploration.', octaveOffset: 12 }
];

// Chord role tooltips based on Roman numeral
const CHORD_ROLE_TOOLTIPS = {
    'I': 'Tonic - home base, resolution point',
    'i': 'Tonic minor - home base in minor key',
    'II': 'Supertonic major - borrowed chord, bright color',
    'ii': 'Supertonic - pre-dominant, leads to V',
    'ii7': 'Supertonic 7th - classic jazz pre-dominant',
    'III': 'Mediant major - borrowed from parallel major',
    'iii': 'Mediant - tonic substitute, softer resolution',
    'iii7': 'Mediant 7th - tonic function with extension',
    'IV': 'Subdominant - pre-dominant, plagal motion',
    'iv': 'Subdominant minor - borrowed chord, melancholy',
    'IVM7': 'Subdominant maj7 - rich pre-dominant',
    'V': 'Dominant - tension, leads to tonic',
    'V7': 'Dominant 7th - stronger pull to tonic',
    'v': 'Minor dominant - modal, weaker resolution',
    'VI': 'Submediant major - borrowed, bright surprise',
    'vi': 'Submediant - relative minor, tonic substitute',
    'vi7': 'Submediant 7th - extended tonic function',
    'VII': 'Subtonic - modal, one step below tonic',
    'vii°': 'Leading-tone - diminished chord, pulls strongly to I',
    '♭II': 'Neapolitan - chromatic pre-dominant',
    '♭II7': 'Tritone sub - jazz substitution for V7',
    '♭III': 'Flat mediant - borrowed from minor',
    '♭VI': 'Flat submediant - borrowed, dramatic',
    '♭VII': 'Flat subtonic - borrowed, rock cadence',
    '♯iv°': 'Raised subdominant dim - passing chord',
    '♯I°': 'Raised tonic dim - chromatic passing',
    '♯II°': 'Raised supertonic dim - chromatic passing'
};

// ============================================================================
// Chord Progression Generation
// ============================================================================

// Chord descriptions based on function/degree
const CHORD_DESCRIPTIONS = {
    'I': 'Tonic - the home chord, gives resolution and stability.',
    'i': 'Tonic - the home chord, gives resolution and stability.',
    'II': 'Secondary dominant - tonicizes V, very common to strengthen cadence.',
    'ii': 'Supertonic - predominant chord, prepares motion to V.',
    'ii7': 'Supertonic 7th - predominant chord, often leading to V.',
    'iii': 'Mediant - weaker predominant or color chord, connects I and IV/vi.',
    'iii7': 'Mediant 7th - extends predominant function.',
    'III': 'Mediant major - borrowed from parallel major.',
    'IV': 'Subdominant - predominant chord, prepares motion to V.',
    'iv': 'Subdominant minor - borrowed chord, adds melancholy color.',
    'IVM7': 'Subdominant maj7 - rich predominant function.',
    'V': 'Dominant - creates tension that resolves to I.',
    'V7': 'Dominant 7th - creates tension that resolves to I.',
    'v': 'Minor dominant - modal, weaker resolution.',
    'VI': 'Submediant major - borrowed, bright surprise.',
    'vi': 'Submediant - relative minor, often used for deceptive cadences.',
    'vi7': 'Submediant 7th - extended tonic function.',
    'VII': 'Harmonic color - adds variety and interest to the progression.',
    'vii°': 'Leading tone - diminished chord, pulls strongly to I.',
    '♭II': 'Borrowed flat-II (Neapolitan), strong predominant, prepares V.',
    '♭II7': 'Tritone sub - jazz substitution for V7.',
    '♭III': 'Borrowed from Mixolydian, gives rock/blues flavor, often moves to I or V.',
    '♭VI': 'Borrowed flat-VI, dramatic color, often moves to V.',
    '♭VII': 'Borrowed from Mixolydian, gives rock/blues flavor, often moves to I or V.',
    '♯iv°': 'Passing diminished - chromatic connector between IV and V.',
    '♯I°': 'Passing diminished - chromatic passing chord.',
    '♯II°': 'Passing diminished - chromatic connector.'
};

function getChordDescription(symbol) {
    if (!symbol) return '';

    // Try exact match
    if (CHORD_DESCRIPTIONS[symbol]) {
        return CHORD_DESCRIPTIONS[symbol];
    }

    // Try base symbol (strip extensions)
    const baseSymbol = symbol.replace(/[0-9]+|M7|m7|maj7|°7|ø7/g, '');
    if (CHORD_DESCRIPTIONS[baseSymbol]) {
        return CHORD_DESCRIPTIONS[baseSymbol];
    }

    // Try simplified version
    const simplified = symbol.replace(/7|maj|min|°|ø|\+/g, '');
    if (CHORD_DESCRIPTIONS[simplified]) {
        return CHORD_DESCRIPTIONS[simplified];
    }

    return '';
}

function generateProgression() {
    const key = parseInt(document.getElementById('keySelect').value);
    appState.key = key;

    if (appState.generationMode === 'template') {
        const templateRaw = document.getElementById('progressionSelect').value;
        appState.progressionTemplate = templateRaw;

        // Get selected option text for the name
        const selectEl = document.getElementById('progressionSelect');
        const selectedOption = selectEl.options[selectEl.selectedIndex];
        const optionText = selectedOption ? selectedOption.textContent : templateRaw;

        // Extract name from option text (e.g., "ii—V—I—vi (Jazz Standard)" -> "Jazz Standard")
        const nameMatch = optionText.match(/\(([^)]+)\)/);
        const progressionName = nameMatch ? nameMatch[1] : '';

        // Generate multiple variants using CPG algorithm
        try {
        console.log('[Ouarpeggiator] Template mode generating:', templateRaw, 'key:', key);
        appState.variants = VARIANT_TYPES.map(variantType => {
            const scaleDegrees = MusicTheory.getScaleDegrees('Major');
            const generatedChords = MusicTheory.generateProgressionChords(templateRaw, key, scaleDegrees, 'Major', 4);
            console.log('[Ouarpeggiator] Generated', generatedChords.length, 'chords for variant', variantType.name);

            // Apply CPG voice leading optimization based on variant type
            let voicedProgression;
            switch (variantType.name) {
                case 'Smooth':
                    voicedProgression = MusicTheory.optimizeSmoothVoiceLeading(generatedChords);
                    break;
                case 'Classic':
                    voicedProgression = MusicTheory.optimizeVoiceLeading(generatedChords);
                    break;
                case 'Jazz':
                    voicedProgression = MusicTheory.applyVoicingStyle(generatedChords, 'close');
                    voicedProgression = MusicTheory.optimizeVoiceLeading(voicedProgression);
                    break;
                case 'Modal':
                    voicedProgression = MusicTheory.applyVoicingStyle(generatedChords, 'open');
                    break;
                case 'Experimental':
                    voicedProgression = MusicTheory.applyVoicingStyle(generatedChords, 'spread');
                    break;
                default:
                    voicedProgression = MusicTheory.optimizeVoiceLeading(generatedChords);
            }

            // Apply variant-specific octave offset and build chord objects
            let chords = voicedProgression.map(chord => {
                const notes = chord.notes.map(n => n + variantType.octaveOffset);
                let chordType = getChordType(notes);

                // Apply Jazz variant chord type conversions
                if (variantType.name === 'Jazz') {
                    if (chordType === 'diminished') {
                        chordType = 'm7b5'; // Half-diminished 7th
                        // Rebuild notes with m7b5 voicing
                        const root = notes[0];
                        const newNotes = MusicTheory.buildChordRaw(root, 'm7b5');
                        notes.length = 0;
                        notes.push(...newNotes);
                    } else if (chordType === 'augmented') {
                        chordType = 'aug7'; // Augmented 7th
                        // Rebuild notes with aug7 voicing
                        const root = notes[0];
                        const newNotes = MusicTheory.buildChordRaw(root, 'aug7');
                        notes.length = 0;
                        notes.push(...newNotes);
                    }
                }

                return {
                    notes,
                    name: chord.chordName || chord.name || MusicTheory.getChordNameFromNotes(notes),
                    symbol: chord.symbol || chord.romanNumeral,
                    type: chordType,
                    description: getChordDescription(chord.symbol || chord.romanNumeral),
                    isProgressionChord: true
                };
            });

            const originalProgressionLength = chords.length;

            // CPG-style Row 1-3 filling with duplicate collapsing (two-pass algorithm)
            // Build complete chord queue from progression
            const allChords = [...chords];
            let chordQueueIndex = 0;

            const getNextChord = () => {
                if (chordQueueIndex < allChords.length) {
                    return allChords[chordQueueIndex++];
                }
                // Cycle through if needed
                if (allChords.length > 0) {
                    chordQueueIndex = 0;
                    return allChords[chordQueueIndex++];
                }
                return null;
            };

            // First pass: Fill all 12 slots unconditionally
            const initialPads = [];
            for (let i = 0; i < 12; i++) {
                const chord = getNextChord();
                if (!chord) break;

                initialPads.push({
                    chord,
                    isProgressionChord: i < originalProgressionLength
                });
            }

            // Second pass: Collapse contiguous duplicates per row and refill
            const rows1to3 = [];
            for (let row = 0; row < 3; row++) {
                const rowStart = row * 4;
                const rowEnd = rowStart + 4;
                const rowPads = [];

                // Collapse duplicates in this row
                for (let i = rowStart; i < rowEnd && i < initialPads.length; i++) {
                    const current = initialPads[i];
                    const previous = rowPads.length > 0 ? rowPads[rowPads.length - 1] : null;

                    // Skip if same chord symbol as previous in this row
                    if (previous && previous.chord.symbol === current.chord.symbol) {
                        continue; // Skip duplicate
                    }

                    rowPads.push(current);
                }

                // Refill row to 4 pads with next available chords
                while (rowPads.length < 4) {
                    const nextChord = getNextChord();
                    if (!nextChord) break;

                    rowPads.push({
                        chord: nextChord,
                        isProgressionChord: false // Refilled slots are extrapolated
                    });
                }

                // Extract chords and mark as extrapolated if needed
                rowPads.forEach(padData => {
                    const chord = {...padData.chord};
                    if (!padData.isProgressionChord) {
                        chord.extrapolated = true;
                    }
                    rows1to3.push(chord);
                });
            }

            // Ensure we have at least 12 chords for rows 1-3
            while (rows1to3.length < 12) {
                const chord = getNextChord();
                if (!chord) break;
                rows1to3.push({...chord, extrapolated: true});
            }

            // CPG-style Row 4: Dynamic generation with secondary dominants, borrowed chords, etc.
            const row4Chords = MusicTheory.selectDynamicRow4Chords(
                rows1to3,
                key,
                scaleDegrees,
                variantType.name,
                'Major'
            );

            // Convert Row 4 candidates to chord format
            const row4 = row4Chords.map(candidate => ({
                notes: candidate.notes,
                name: candidate.chordName,
                symbol: candidate.romanNumeral,
                type: candidate.chordType === 'dom7' ? 'dominant' :
                      candidate.chordType === 'minor' ? 'minor' :
                      candidate.chordType === 'minor7' ? 'minor' :
                      candidate.chordType === 'diminished' ? 'diminished' :
                      candidate.chordType === 'augmented' ? 'augmented' : 'major',
                description: getChordDescription(candidate.romanNumeral),
                extrapolated: true
            }));

            // Combine all 16 pads
            const finalChords = [...rows1to3.slice(0, 12), ...row4.slice(0, 4)];

            // Mark which chords are from original progression
            finalChords.forEach((chord, idx) => {
                chord.isProgressionChord = idx < originalProgressionLength;
            });

            return {
                name: variantType.name,
                description: variantType.description,
                chords: finalChords.slice(0, 16),
                baseChordCount: originalProgressionLength
            };
        });

        // Store the progression name for display
        appState.progressionName = progressionName;
        } catch (error) {
            console.error('[Ouarpeggiator] Progression generation failed:', error);
            // Generate simple triads as fallback so UI doesn't break
            const scaleDegrees = MusicTheory.getScaleDegrees('Major');
            const degrees = [0, 3, 4, 0];
            const symbols = ['I', 'IV', 'V', 'I'];
            const fallbackChords = degrees.map((deg, i) => {
                const notes = MusicTheory.buildChordRaw(60 + key + scaleDegrees[deg], 'major');
                return { notes, name: MusicTheory.getChordNameFromNotes(notes), symbol: symbols[i], type: 'major', description: '', isProgressionChord: true };
            });
            appState.variants = [{
                name: 'Error',
                description: `Generation error: ${error.message} — see browser console`,
                chords: fallbackChords,
                baseChordCount: 4
            }];
        }
    } else {
        // Scale Mode: Generate single variant showing all scale chords
        const mode = document.getElementById('modeSelect').value;
        appState.mode = mode;

        const scaleDegrees = MusicTheory.getScaleDegrees(mode);
        let chords = [];

        const modeSymbols = {
            'Major': ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'],
            'Minor': ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII'],
            'Dorian': ['i', 'ii', 'III', 'IV', 'v', 'vi°', 'VII'],
            'Phrygian': ['i', 'II', 'III', 'iv', 'v°', 'VI', 'vii'],
            'Lydian': ['I', 'II', 'iii', '♯iv°', 'V', 'vi', 'vii'],
            'Mixolydian': ['I', 'ii', 'iii°', 'IV', 'v', 'vi', 'VII'],
            'Locrian': ['i°', 'II', 'iii', 'iv', 'V', 'VI', 'vii']
        };

        const symbols = modeSymbols[mode] || modeSymbols['Major'];

        // Generate all triads in the scale
        for (let degree = 0; degree < 7 && degree < scaleDegrees.length; degree++) {
            const rootNote = 60 + key + scaleDegrees[degree];
            const quality = MusicTheory.getChordQualityForMode(degree, mode);
            const notes = MusicTheory.buildChordRaw(rootNote, quality);
            const symbol = symbols[degree];

            chords.push({
                notes,
                name: MusicTheory.getChordNameFromNotes(notes),
                symbol: symbol,
                type: quality === 'maj' ? 'major' : quality === 'min' ? 'minor' : quality,
                description: getChordDescription(symbol)
            });
        }

        // Pad to 16 chords with octave variations
        const baseChordCount = chords.length;
        while (chords.length < 16) {
            if (chords.length === 0) break;
            const sourceIndex = (chords.length - baseChordCount) % baseChordCount;
            const sourceChord = chords[sourceIndex];

            const invertedNotes = sourceChord.notes.map(n => n + (chords.length >= 14 ? 12 : 0));

            chords.push({
                notes: invertedNotes,
                name: MusicTheory.getChordNameFromNotes(invertedNotes),
                symbol: sourceChord.symbol,
                type: sourceChord.type,
                description: sourceChord.description,
                extrapolated: true
            });
        }

        appState.variants = [{
            name: 'Scale',
            description: `All chords from ${mode} scale`,
            chords: chords.slice(0, 16),
            baseChordCount
        }];
    }

    // Reset to first variant and update UI
    appState.currentVariantIndex = 0;
    appState.chordProgression = appState.variants[0].chords;
    appState.currentChordIndex = 0;
    appState.hasGeneratedOnce = true;

    // Update variant selector
    updateVariantSelector();
    renderChordGrid();
    console.log('[Ouarpeggiator] generateProgression complete:', appState.generationMode, '→', appState.variants.length, 'variant(s),', appState.chordProgression.length, 'chords');
}

function updateVariantSelector() {
    const selector = document.getElementById('variantSelect');
    const description = document.getElementById('variantDescription');

    selector.innerHTML = appState.variants.map((v, i) =>
        `<option value="${i}">${v.name}</option>`
    ).join('');

    selector.value = appState.currentVariantIndex;

    // Update description
    const currentVariant = appState.variants[appState.currentVariantIndex];
    if (currentVariant && description) {
        description.textContent = currentVariant.description;
    }
}

function switchVariant(index) {
    if (index < 0 || index >= appState.variants.length) return;

    appState.currentVariantIndex = index;
    appState.chordProgression = appState.variants[index].chords;
    appState.currentChordIndex = 0;

    // Update description
    const description = document.getElementById('variantDescription');
    const currentVariant = appState.variants[index];
    if (currentVariant && description) {
        description.textContent = currentVariant.description;
    }

    // Update title with new variant name
    updateProgressionTitle();

    renderChordGrid();
}

function getChordType(notes) {
    if (!notes || notes.length < 3) return 'unknown';

    const intervals = notes.map(n => ((n - notes[0]) % 12 + 12) % 12).sort((a, b) => a - b);
    const has = (i) => intervals.includes(i);

    if (has(4) && has(7)) {
        if (has(10)) return 'dominant';
        return 'major';
    }
    if (has(3) && has(7)) return 'minor';
    if (has(3) && has(6)) return 'diminished';
    if (has(4) && has(8)) return 'augmented';
    if (has(5) && has(7)) return 'suspended';

    return 'major';
}

function renderChordGrid() {
    const grid = document.getElementById('chordGrid');

    // Use DocumentFragment to batch DOM manipulations (reduces reflows from 16 to 1)
    const fragment = document.createDocumentFragment();

    // Find tonic chord for voice leading analysis
    const tonicChord = appState.chordProgression.find(p =>
        p.symbol && p.symbol.toUpperCase().startsWith('I') && !p.symbol.includes('V')
    ) || appState.chordProgression[0];

    appState.chordProgression.forEach((chord, index) => {
        const pad = document.createElement('div');
        const padId = index + 1; // PAD numbers are 1-indexed

        // Determine voice leading class relative to tonic
        let voiceLeadingClass = '';
        if (tonicChord && chord.notes && tonicChord.notes && index !== 0) {
            const vlAnalysis = MusicTheory.analyzeVoiceLeading(tonicChord.notes, chord.notes);
            if (vlAnalysis) {
                if (vlAnalysis.smoothness >= 4) {
                    voiceLeadingClass = 'vl-smooth';
                } else if (vlAnalysis.smoothness >= 2) {
                    voiceLeadingClass = 'vl-moderate';
                } else {
                    voiceLeadingClass = 'vl-leap';
                }
            }
        }

        // Build class list
        const classes = ['chord-pad'];
        if (chord.isProgressionChord) classes.push('progression-chord');
        if (chord.extrapolated) classes.push('extrapolated');
        if (voiceLeadingClass) classes.push(voiceLeadingClass);
        if (index === appState.currentChordIndex && appState.isPlaying) classes.push('current');

        pad.className = classes.join(' ');

        // Get quality label and determine color class
        const qualityLabel = getQualityLabel(chord.type);
        const qualityClass = getQualityClass(chord.type);

        // Get note names with octave for display (e.g., "G3 B3 D4 F4")
        const chordNoteNamesWithOctave = chord.notes
            ? chord.notes.map(n => MusicTheory.getNoteName(n, false, true)).join(' ')
            : '';

        // Get chord role tooltip
        const roleText = getChordRoleTooltip(chord.symbol) || getChordDescription(chord.symbol) || '';

        // Get inversion notation
        const inversionNotation = chord.notes
            ? MusicTheory.getInversionNotation(chord.notes, chord.type, chord.name, chord.symbol)
            : '';
        const displayName = (chord.name || '—') + inversionNotation;

        // Set data attributes (CPG-compatible)
        pad.dataset.notes = chord.notes ? chord.notes.join(',') : '';
        pad.dataset.roman = chord.symbol || '';
        pad.dataset.quality = qualityLabel;
        pad.dataset.role = roleText.replace(/"/g, '&quot;');
        pad.dataset.padId = padId;
        pad.dataset.originalVlClass = voiceLeadingClass;

        // CPG-style two-column layout (no PAD labels - legacy MPC terminology removed)
        pad.innerHTML = `
            <div class="chord-pad-row">
                <div class="chord-text-column">
                    <div class="chord-name">${displayName}</div>
                    <div class="chord-quality ${qualityClass}">${qualityLabel}</div>
                    <div class="chord-roman">${chord.symbol || ''}</div>
                </div>
                <div class="chord-info-column">
                    <div class="chord-role">${roleText}</div>
                    <div class="chord-notes">${chordNoteNamesWithOctave}</div>
                </div>
            </div>
            <div class="chord-keyboard">${chord.notes ? generateKeyboardSVG(chord.notes) : ''}</div>
        `;

        // Click to play chord and show proximity coloring
        pad.addEventListener('click', () => {
            if (chord.notes) {
                playChordWithFeedback(index, pad);
                showChordProximity(index);
            }
        });

        fragment.appendChild(pad);
    });

    // Single DOM update instead of 16 individual appendChild calls
    grid.innerHTML = '';
    grid.appendChild(fragment);
}

function getQualityClass(type) {
    const classes = {
        'major': 'quality-major',
        'minor': 'quality-minor',
        'dominant': 'quality-dominant',
        'diminished': 'quality-diminished',
        'augmented': 'quality-augmented',
        'suspended': 'quality-suspended'
    };
    return classes[type] || 'quality-major';
}

function getChordRoleTooltip(symbol) {
    if (!symbol) return null;

    // Try exact match first
    if (CHORD_ROLE_TOOLTIPS[symbol]) {
        return CHORD_ROLE_TOOLTIPS[symbol];
    }

    // Try base symbol (strip extensions like 7, M7, etc.)
    const baseSymbol = symbol.replace(/[0-9]+|M7|m7|maj7|°7|ø7/g, '');
    if (CHORD_ROLE_TOOLTIPS[baseSymbol]) {
        return CHORD_ROLE_TOOLTIPS[baseSymbol];
    }

    return null;
}

function showChordProximity(referenceIndex) {
    const referenceChord = appState.chordProgression[referenceIndex];
    if (!referenceChord || !referenceChord.notes) return;

    const pads = document.querySelectorAll('.chord-pad');

    pads.forEach((pad, index) => {
        // Clear previous proximity classes
        pad.classList.remove('vl-smooth', 'vl-moderate', 'vl-leap', 'vl-reference');

        if (index === referenceIndex) {
            pad.classList.add('vl-reference');
            return;
        }

        const chord = appState.chordProgression[index];
        if (!chord || !chord.notes) return;

        // Calculate voice leading distance
        const distance = calculateVoiceLeadingDistance(referenceChord.notes, chord.notes);

        if (distance <= 4) {
            pad.classList.add('vl-smooth');
        } else if (distance <= 8) {
            pad.classList.add('vl-moderate');
        } else {
            pad.classList.add('vl-leap');
        }
    });
}

function calculateVoiceLeadingDistance(notes1, notes2) {
    if (!notes1 || !notes2) return 999;

    // Sum of minimum semitone distances between voices
    let totalDistance = 0;
    const len = Math.min(notes1.length, notes2.length);

    for (let i = 0; i < len; i++) {
        // Find closest note in notes2 to notes1[i]
        let minDist = 999;
        for (const note2 of notes2) {
            const dist = Math.abs((notes1[i] % 12) - (note2 % 12));
            const wrappedDist = Math.min(dist, 12 - dist);
            minDist = Math.min(minDist, wrappedDist);
        }
        totalDistance += minDist;
    }

    return totalDistance;
}

function getQualityLabel(type) {
    const labels = {
        // Specific types first (before generic ones)
        'major7': 'Major 7',
        'minor7': 'Minor 7',
        'dom7': 'Dominant 7',
        'dominant': 'Dominant 7',
        'm7b5': 'Half-Diminished',
        'minMaj7': 'Minor-Major 7',
        'dom9': 'Dominant 9',
        'dom13': 'Dominant 13',
        'add9': 'Add 9',
        'minor6': 'Minor 6',
        'major6': 'Major 6',
        'aug7': 'Augmented 7',
        'augMaj7': 'Augmented Major 7',
        'sus2': 'Suspended 2',
        'sus4': 'Suspended 4',
        'quartal': 'Quartal',
        // Generic types last
        'augmented': 'Augmented',
        'suspended': 'Suspended',
        'diminished': 'Diminished',
        'minor': 'Minor',
        'major': 'Major'
    };
    return labels[type] || 'Major';
}

function playChordWithFeedback(index, padElement) {
    const chord = appState.chordProgression[index];
    if (!chord || !chord.notes) return;

    // Visual feedback
    padElement.classList.add('playing');
    setTimeout(() => padElement.classList.remove('playing'), 300);

    // Initialize audio if needed
    if (!Audio.isAudioAvailable()) {
        Audio.initAudio();
    }

    // Play sound
    if (appState.outputMode === 'audio') {
        Audio.playChord(chord.notes, 80, 400);
    } else if (appState.outputMode === 'midi' && MIDI.hasOutputDevice()) {
        chord.notes.forEach(note => {
            MIDI.sendNoteOn(note, 80);
            setTimeout(() => MIDI.sendNoteOff(note), 350);
        });
    }
}

// ============================================================================
// Pattern Management
// ============================================================================

function regeneratePattern() {
    const basePattern = euclidean(appState.euclidean.hits, appState.euclidean.steps);
    appState.euclidean.pattern = rotatePattern(basePattern, appState.euclidean.rotation);
    renderPattern();
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
        noteSchedulerWorker = new Worker('js/noteSchedulerWorker.js');
        noteSchedulerWorker.onmessage = function(e) {
            const { type, note, velocity, gateLength, chordIndex } = e.data;

            if (type === 'noteOn') {
                console.log('[Juno-106] worker→BroadcastChannel noteOn note=' + note + ' vel=' + velocity + ' (NOT sent via postMessage to junoWindow)');
                // Update piano roll visualization
                PianoRoll.addNote(note, velocity, gateLength, chordIndex);
            } else if (type === 'noteOff') {
                console.log('[Juno-106] worker→BroadcastChannel noteOff note=' + note + ' (NOT sent via postMessage to junoWindow)');
                // Remove from piano roll
                PianoRoll.removeNote(note);
            } else if (type === 'tick') {
                // Update UI with current step
                renderPattern();
            }
        };
        console.log('[Juno-106] noteSchedulerWorker initialized — notes will go via BroadcastChannel("ouarpeggiator-notes"), NOT postMessage to junoWindow');
        useBroadcastChannel = true;
    } catch (error) {
        console.warn('Note scheduler worker unavailable:', error);
        noteSchedulerWorker = null;
        useBroadcastChannel = false;
    }
}

function startPlayback() {
    if (appState.isPlaying) return;

    // Lazy-load piano roll on first playback
    if (!appState.pianoRollInitialized) {
        PianoRoll.initPianoRoll('pianoRollContainer');
        PianoRoll.setOctaveSpread(appState.octaveSpread);
        appState.pianoRollInitialized = true;
    }

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
                    playbackMode: appState.playbackMode,
                    octaveSpread: appState.octaveSpread,
                    harmonicVariation: appState.harmonicVariation,
                    rhythmicVariation: appState.rhythmicVariation,
                    humanization: appState.humanization,
                    velocity: appState.velocity,
                    gate: appState.gate,
                    strumSpeed: appState.strumSpeed,
                    strumDirection: appState.strumDirection,
                    outputMode: appState.outputMode
                }
            });

            // Start worker
            noteSchedulerWorker.postMessage({ type: 'start' });
            console.log('[Juno-106] playback started via BroadcastChannel Worker — sendToJuno106/postMessage path is BYPASSED');
            console.log('[Juno-106] junoWindow reference:', junoWindow, 'closed:', junoWindow ? junoWindow.closed : 'n/a');
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

    appState.tickCount++;

    // Check chord advancement
    const ticksPerBar = 96;
    const ticksPerChordChange = ticksPerBar * appState.barsPerChord;

    if (appState.tickCount > 0 && appState.tickCount % ticksPerChordChange === 0) {
        // Use harmonic selection to choose next chord
        const currentChord = appState.chordProgression[appState.currentChordIndex];
        const currentChordObj = { notes: currentChord?.notes || [] };
        const paletteObjs = appState.chordProgression.map(c => ({ notes: c?.notes || [] }));

        appState.currentChordIndex = MusicTheory.selectNextChordHarmonically(
            currentChordObj,
            paletteObjs,
            appState.harmonicAdherence,
            appState.currentChordIndex
        );
        renderChordGrid();
    }

    // Check for step trigger
    const ticksPerStep = Math.floor(96 / appState.euclidean.steps);

    if (appState.tickCount % ticksPerStep === 0) {
        executeStep();
    }
}

function executeStep() {
    // CHORD PROGRESSION ADVANCEMENT (Stab Mode only)
    if (appState.playbackMode === 'stab' && appState.chordSequencing.enabled) {
        // Check if we should advance to next chord
        const changePattern = appState.chordSequencing.euclidean.pattern;
        const changeStepIndex = appState.chordSequencing.stepIndex;

        if (changePattern[changeStepIndex]) {
            // This is a chord change trigger - get next chord from sequencer
            const nextChordIndex = ChordProgressionSequencer.getNextChord(appState.chordProgression);
            appState.currentChordIndex = nextChordIndex;
            renderChordGrid(); // Update visual current chord
        }

        // Advance chord change step index
        // IMPORTANT: Use chord change steps, not main steps (for polyrhythm/flams)
        appState.chordSequencing.stepIndex = (appState.chordSequencing.stepIndex + 1) % appState.chordSequencing.euclidean.steps;
        renderChordChangeCircle();
    }

    // NOTE/STAB PLAYBACK
    const pattern = appState.euclidean.pattern;
    const chord = appState.chordProgression[appState.currentChordIndex];

    if (!chord || !chord.notes || chord.empty) {
        appState.euclideanStepIndex = (appState.euclideanStepIndex + 1) % appState.euclidean.steps;
        renderPattern();
        return;
    }

    // Check if current step is a hit
    if (!pattern[appState.euclideanStepIndex]) {
        appState.euclideanStepIndex = (appState.euclideanStepIndex + 1) % appState.euclidean.steps;
        renderPattern();
        return;
    }

    // Apply rhythmic variation (both modes)
    if (appState.rhythmicVariation > 0 && Math.random() * 100 < appState.rhythmicVariation) {
        appState.euclideanStepIndex = (appState.euclideanStepIndex + 1) % appState.euclidean.steps;
        renderPattern();
        return;
    }

    // Calculate velocity
    let velocity = appState.velocity.fixed;
    if (appState.velocity.mode === 'random') {
        velocity = appState.velocity.randomMin + Math.random() * (appState.velocity.randomMax - appState.velocity.randomMin);
    }
    velocity = Math.round(Math.max(1, Math.min(127, velocity)));

    // Calculate gate
    const stepDuration = (60000 / appState.bpm) / (appState.euclidean.steps / 4);
    let gatePercent = appState.gate.fixed;
    if (appState.gate.mode === 'random') {
        gatePercent = appState.gate.randomMin + Math.random() * (appState.gate.randomMax - appState.gate.randomMin);
    }
    const gateLength = stepDuration * gatePercent;

    // Humanization
    const humanOffset = (Math.random() - 0.5) * 2 * appState.humanization;

    if (appState.playbackMode === 'stab') {
        // CHORD STAB MODE: Play all notes with optional strum
        executeChordStab(chord.notes, velocity, gateLength, humanOffset);
    } else {
        // ARPEGGIO MODE: Play single note
        executeArpeggioNote(chord, velocity, gateLength, humanOffset);
    }

    appState.euclideanStepIndex = (appState.euclideanStepIndex + 1) % appState.euclidean.steps;
    renderPattern();
}

/**
 * Execute a single arpeggio note
 */
function executeArpeggioNote(chord, velocity, gateLength, humanOffset) {
    const chordSize = chord.notes.length;
    const baseNoteIndex = appState.euclideanStepIndex % chordSize;
    const octaveLayer = Math.floor(appState.euclideanStepIndex / chordSize) % appState.octaveSpread;
    let note = chord.notes[baseNoteIndex] + (octaveLayer * 12);

    // Apply harmonic variation (note substitution)
    if (appState.harmonicVariation > 0 && Math.random() * 100 < appState.harmonicVariation) {
        const allNotes = appState.chordProgression.filter(c => c.notes).flatMap(c => c.notes);
        if (allNotes.length > 0) {
            let substitute = allNotes[Math.floor(Math.random() * allNotes.length)];
            while (substitute < note - 12) substitute += 12;
            while (substitute > note + 12) substitute -= 12;
            note = substitute;
        }
    }

    // When tab is hidden, setTimeout is throttled to ~1s — play immediately
    if (document.hidden || humanOffset <= 0) {
        playNote(note, velocity, gateLength);
        appState.lastPlayedNote = note;
    } else {
        setTimeout(() => {
            if (!appState.isPlaying) return;
            playNote(note, velocity, gateLength);
            appState.lastPlayedNote = note;
        }, humanOffset);
    }
}

/**
 * Execute a chord stab (all notes, with optional strum delay)
 */
function executeChordStab(notes, velocity, gateLength, humanOffset) {
    // Determine strum order
    let orderedNotes = [...notes];
    if (appState.strumDirection === 'down') {
        orderedNotes.reverse();
    } else if (appState.strumDirection === 'alternating') {
        // Alternate based on step index
        if (appState.euclideanStepIndex % 2 === 1) {
            orderedNotes.reverse();
        }
    }

    // Calculate delay between notes
    const strumDelay = appState.strumSpeed / Math.max(1, orderedNotes.length - 1);

    // When tab is hidden, setTimeout is throttled to ~1s — play immediately
    if (document.hidden) {
        orderedNotes.forEach((note) => {
            playNote(note, velocity, gateLength);
        });
        appState.lastPlayedNote = orderedNotes[0];
    } else {
        setTimeout(() => {
            if (!appState.isPlaying) return;

            orderedNotes.forEach((note, idx) => {
                const noteDelay = idx * strumDelay;
                setTimeout(() => {
                    if (!appState.isPlaying) return;
                    playNote(note, velocity, gateLength);
                }, noteDelay);
            });

            // Track the root note as last played
            appState.lastPlayedNote = orderedNotes[0];
        }, Math.max(0, humanOffset));
    }
}

// ============================================================================
// Juno-106 Helper Functions
// ============================================================================

function launchJuno106() {
    if (junoWindow && !junoWindow.closed) return;
    junoWindow = window.open(JUNO_URL, 'juno106');
    console.log('[Juno-106] window opened, reference:', junoWindow);
    window.addEventListener('message', function onReady(e) {
        if (e.origin === 'https://liotier.github.io' && e.data === 'juno106:ready') {
            window.removeEventListener('message', onReady);
            console.log('[Juno-106] ready — junoWindow:', junoWindow, 'closed:', junoWindow ? junoWindow.closed : 'n/a');
            console.log('[Juno-106] NOTE: notes will be sent via BroadcastChannel (worker) or postMessage (fallback) depending on worker availability');
        }
    });
}

function sendToJuno106(msg) {
    if (!junoWindow || junoWindow.closed) {
        console.warn('[Juno-106] sendToJuno106: window not available, msg dropped:', msg);
        return;
    }
    console.log('[Juno-106] sendToJuno106 postMessage →', JSON.stringify(msg), 'targetOrigin: https://liotier.github.io');
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
        console.log('[Juno-106] playNote (main-thread fallback path) noteOn note=' + note + ' vel=' + velocity);
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

// ============================================================================
// MIDI Device Management
// ============================================================================

async function initializeMIDI() {
    // Initialize diagnostics UI first
    MIDIDiagnostics.initMIDIDiagnostics();

    if (!MIDI.isWebMIDIAvailable()) {
        console.log('WebMIDI not available');
        MIDIDiagnostics.logError('WebMIDI API not available in this browser');
        MIDIDiagnostics.updateAllStatus();
        populateMIDIDevices();  // Still add Juno-106 option!
        return;
    }

    const access = await MIDI.initMIDI();
    if (!access) {
        console.log('Failed to initialize MIDI');
        MIDIDiagnostics.logError('Failed to initialize MIDI - permission denied or error occurred');
        MIDIDiagnostics.updateAllStatus();
        populateMIDIDevices();  // Still add Juno-106 option!
        return;
    }

    MIDIDiagnostics.logSuccess('MIDI initialized successfully');
    MIDIDiagnostics.updateAllStatus();
    populateMIDIDevices();

    // Re-populate on device change
    access.onstatechange = (event) => {
        MIDIDiagnostics.logMIDIEvent(`Device ${event.port.state}: ${event.port.name}`, 'info');
        setTimeout(populateMIDIDevices, 100);
    };
}

function populateMIDIDevices() {
    const outputSelect = document.getElementById('outputMode');
    if (!outputSelect) return;

    const outputs = MIDI.getOutputDevices();
    const inputs = MIDI.getInputDevices();

    // Preserve current selection
    const currentValue = outputSelect.value;

    // Clear and add Browser tone as first option
    outputSelect.innerHTML = '<option value="audio">Browser tone</option>';

    // Add MIDI devices
    outputs.forEach(device => {
        const option = document.createElement('option');
        option.value = `midi:${device.id}`;
        option.textContent = device.name;
        outputSelect.appendChild(option);
    });

    // Add Juno-106 option
    const junoOption = document.createElement('option');
    junoOption.value = 'juno106';
    junoOption.textContent = 'Juno-106 (new window)';
    outputSelect.appendChild(junoOption);

    // Restore selection if still valid
    if (currentValue && Array.from(outputSelect.options).some(o => o.value === currentValue)) {
        outputSelect.value = currentValue;
    }

    // Enhanced diagnostic logging
    console.log(`[MIDI] WebMIDI initialized: ${MIDI.isMIDIInitialized()}`);
    console.log(`[MIDI] Found ${outputs.length} output device(s)`, outputs.length > 0 ? outputs.map(d => d.name) : '(none)');
    console.log(`[MIDI] Found ${inputs.length} input device(s)`, inputs.length > 0 ? inputs.map(d => d.name) : '(none)');

    if (outputs.length === 0 && inputs.length === 0) {
        console.warn('[MIDI] No devices detected. Possible causes:');
        console.warn('  - No MIDI devices connected');
        console.warn('  - Browser permissions not granted');
        console.warn('  - MIDI drivers not installed/running');
        console.warn('  - Virtual MIDI ports not configured');
    }

    // Update diagnostics UI
    MIDIDiagnostics.updateDeviceLists();
}

// ============================================================================
// UI Bindings
// ============================================================================

function bindControls() {
    // Generation mode toggle
    document.getElementById('paletteModeRadio').addEventListener('change', function() {
        if (this.checked) {
            switchGenerationMode('template');
            if (appState.hasGeneratedOnce) {
                triggerSparkle();
                generateProgression();
            }
        }
    });

    document.getElementById('scaleModeRadio').addEventListener('change', function() {
        if (this.checked) {
            switchGenerationMode('scale');
            if (appState.hasGeneratedOnce) {
                triggerSparkle();
                generateProgression();
            }
        }
    });

    // Key select - auto-regenerate on change
    document.getElementById('keySelect').addEventListener('change', function() {
        appState.key = parseInt(this.value);
        if (appState.hasGeneratedOnce) {
            triggerSparkle();
            generateProgression();
        }
    });

    // Progression select - auto-regenerate on change
    document.getElementById('progressionSelect').addEventListener('change', function() {
        appState.progressionTemplate = this.value;
        if (appState.hasGeneratedOnce) {
            triggerSparkle();
            generateProgression();
        }
    });

    // Mode select - auto-regenerate on change
    document.getElementById('modeSelect').addEventListener('change', function() {
        appState.mode = this.value;
        if (appState.hasGeneratedOnce) {
            triggerSparkle();
            generateProgression();
        }
    });

    // Generate button
    document.getElementById('generateBtn').addEventListener('click', generateProgression);

    // Variant selector
    document.getElementById('variantSelect').addEventListener('change', function() {
        switchVariant(parseInt(this.value));
    });

    // Output mode - now directly includes MIDI devices
    document.getElementById('outputMode').addEventListener('change', function() {
        const value = this.value;
        const audioConfig = document.getElementById('audioConfig');

        if (value === 'audio') {
            // Browser tone selected
            appState.outputMode = 'audio';
            MIDI.selectOutputDevice(''); // Deselect MIDI device
            audioConfig.style.display = 'block';
            Audio.initAudio();
        } else if (value.startsWith('midi:')) {
            // MIDI device selected
            const deviceId = value.substring(5);
            appState.outputMode = 'midi';
            MIDI.selectOutputDevice(deviceId);
            audioConfig.style.display = 'none';
        } else if (value === 'juno106') {
            // Juno-106 selected
            appState.outputMode = 'juno106';
            MIDI.selectOutputDevice('');
            audioConfig.style.display = 'none';
            launchJuno106();
        }
    });

    // Synth waveform
    document.getElementById('synthWaveform').addEventListener('change', function() {
        Audio.setWaveform(this.value);
    });

    // Pattern controls
    document.getElementById('hitsSlider').addEventListener('input', function() {
        appState.euclidean.hits = parseInt(this.value);
        document.getElementById('hitsValue').textContent = this.value;
        regeneratePattern();
        regenerateChordChangePattern();
    });

    document.getElementById('stepsSlider').addEventListener('input', function() {
        appState.euclidean.steps = parseInt(this.value);
        document.getElementById('stepsValue').textContent = this.value;
        document.getElementById('rotationSlider').max = appState.euclidean.steps - 1;

        // Sync chord progression steps ONLY if locked
        if (appState.chordSequencing.stepsLocked) {
            appState.chordSequencing.euclidean.steps = appState.euclidean.steps;
        }

        // Constrain hits to not exceed steps
        const hitsSlider = document.getElementById('hitsSlider');
        hitsSlider.max = appState.euclidean.steps;
        if (appState.euclidean.hits > appState.euclidean.steps) {
            appState.euclidean.hits = appState.euclidean.steps;
            hitsSlider.value = appState.euclidean.steps;
            document.getElementById('hitsValue').textContent = appState.euclidean.steps;
        }

        regeneratePattern();
        regenerateChordChangePattern();
    });

    document.getElementById('rotationSlider').addEventListener('input', function() {
        appState.euclidean.rotation = parseInt(this.value);
        document.getElementById('rotationValue').textContent = this.value;
        regeneratePattern();
    });

    document.getElementById('octaveSpread').addEventListener('input', function() {
        appState.octaveSpread = parseInt(this.value);
        document.getElementById('octaveValue').textContent = this.value;
        // Update piano roll pitch range if initialized
        if (appState.pianoRollInitialized) {
            PianoRoll.setOctaveSpread(appState.octaveSpread);
        }
    });

    // Timing
    document.getElementById('bpmSlider').addEventListener('input', function() {
        appState.bpm = parseInt(this.value);
        document.getElementById('bpmValue').textContent = this.value;

        // Update piano roll BPM
        PianoRoll.setBPM(appState.bpm);

        // Restart if playing
        if (appState.isPlaying) {
            stopPlayback();
            startPlayback();
        }
    });

    document.querySelectorAll('.bars-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.bars-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            appState.barsPerChord = parseInt(this.dataset.value);
        });
    });

    document.getElementById('humanization').addEventListener('input', function() {
        appState.humanization = parseInt(this.value);
        document.getElementById('humanizationValue').textContent = this.value;
    });

    // Transport
    document.getElementById('startBtn').addEventListener('click', startPlayback);
    document.getElementById('stopBtn').addEventListener('click', stopPlayback);

    // Playback Mode Toggle (Arpeggio/Chord Stab)
    document.getElementById('arpeggioModeRadio').addEventListener('change', function() {
        if (this.checked) {
            appState.playbackMode = 'arpeggio';
            updatePlaybackModeUI();
        }
    });

    document.getElementById('stabModeRadio').addEventListener('change', function() {
        if (this.checked) {
            appState.playbackMode = 'stab';
            updatePlaybackModeUI();
        }
    });

    // Chord Variation - Harmonic Adherence
    document.getElementById('harmonicAdherence').addEventListener('input', function() {
        appState.harmonicAdherence = parseInt(this.value);
        document.getElementById('harmonicAdherenceValue').textContent = this.value + '%';
    });

    // Note Variation
    document.getElementById('harmonicVariation').addEventListener('input', function() {
        appState.harmonicVariation = parseInt(this.value);
        document.getElementById('harmonicValue').textContent = this.value + '%';
    });

    // Strum controls (for Chord Stab mode)
    document.getElementById('strumSpeed')?.addEventListener('input', function() {
        appState.strumSpeed = parseInt(this.value);
        document.getElementById('strumSpeedValue').textContent = this.value;
    });

    document.querySelectorAll('.strum-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.strum-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            appState.strumDirection = this.dataset.value;
        });
    });

    document.getElementById('rhythmicVariation').addEventListener('input', function() {
        appState.rhythmicVariation = parseInt(this.value);
        document.getElementById('rhythmicValue').textContent = this.value + '%';
    });

    document.querySelectorAll('.voice-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.voice-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            appState.voiceLeading = this.dataset.value;
        });
    });

    // Velocity/Gate modes
    document.getElementById('velocityMode').addEventListener('change', function() {
        appState.velocity.mode = this.value;
        renderVelocityControls();
    });

    document.getElementById('gateMode').addEventListener('change', function() {
        appState.gate.mode = this.value;
        renderGateControls();
    });

    // Curve rotation sync
    document.getElementById('curveSyncRotation').addEventListener('change', function() {
        appState.curveSyncRotation = this.checked;
    });

    // Chord Progression Controls (Stab Mode)
    bindChordProgressionControls();
}

/**
 * Bind chord progression sequencing controls
 */
function bindChordProgressionControls() {
    // Steps lock toggle
    const unlockCheckbox = document.getElementById('unlockChordSteps');
    const stepsSliderContainer = document.getElementById('chordStepsSliderContainer');

    if (unlockCheckbox) {
        unlockCheckbox.addEventListener('change', function() {
            appState.chordSequencing.stepsLocked = !this.checked;

            // Show/hide independent steps slider
            if (stepsSliderContainer) {
                stepsSliderContainer.style.display = this.checked ? 'block' : 'none';
            }

            // If locking, sync steps back to main
            if (!this.checked) {
                appState.chordSequencing.euclidean.steps = appState.euclidean.steps;
                regenerateChordChangePattern();
                renderChordChangeCircle();
            }
        });
    }

    // Chord change steps slider (independent mode)
    const stepsSlider = document.getElementById('chordChangeSteps');
    const stepsValue = document.getElementById('chordChangeStepsValue');

    if (stepsSlider) {
        stepsSlider.addEventListener('input', function() {
            appState.chordSequencing.euclidean.steps = parseInt(this.value);
            stepsValue.textContent = this.value;

            // Update max values for dependent sliders
            const pulsesSlider = document.getElementById('chordChangePulses');
            const rotationSlider = document.getElementById('chordChangeRotation');

            if (pulsesSlider) {
                pulsesSlider.max = appState.chordSequencing.euclidean.steps;
                if (appState.chordSequencing.euclidean.hits > appState.chordSequencing.euclidean.steps) {
                    appState.chordSequencing.euclidean.hits = appState.chordSequencing.euclidean.steps;
                    pulsesSlider.value = appState.chordSequencing.euclidean.steps;
                    document.getElementById('chordChangePulsesValue').textContent = appState.chordSequencing.euclidean.steps;
                }
            }

            if (rotationSlider) {
                rotationSlider.max = appState.chordSequencing.euclidean.steps - 1;
            }

            regenerateChordChangePattern();
            renderChordChangeCircle();
        });
    }

    // Chord change Euclidean controls
    const pulsesSlider = document.getElementById('chordChangePulses');
    const pulsesValue = document.getElementById('chordChangePulsesValue');
    const rotationSlider = document.getElementById('chordChangeRotation');
    const rotationValue = document.getElementById('chordChangeRotationValue');

    if (pulsesSlider) {
        pulsesSlider.addEventListener('input', function() {
            appState.chordSequencing.euclidean.hits = parseInt(this.value);
            pulsesValue.textContent = this.value;
            regenerateChordChangePattern();
            renderChordChangeCircle();
        });
    }

    if (rotationSlider) {
        rotationSlider.addEventListener('input', function() {
            appState.chordSequencing.euclidean.rotation = parseInt(this.value);
            rotationValue.textContent = this.value;
            regenerateChordChangePattern();
            renderChordChangeCircle();
        });
    }

    // Sequence method selector
    const methodSelect = document.getElementById('sequenceMethod');
    if (methodSelect) {
        methodSelect.addEventListener('change', function() {
            ChordProgressionSequencer.method = this.value;
            renderSequenceMethodControls();
            updateProgressionPreview();
        });
    }

    // Pattern length
    const lengthSlider = document.getElementById('patternLength');
    const lengthValue = document.getElementById('patternLengthValue');
    if (lengthSlider) {
        lengthSlider.addEventListener('input', function() {
            ChordProgressionSequencer.patternLength = parseInt(this.value);
            lengthValue.textContent = this.value;
            if (!ChordProgressionSequencer.lockPattern) {
                updateProgressionPreview();
            }
        });
    }

    // Lock pattern checkbox
    const lockCheckbox = document.getElementById('lockPattern');
    if (lockCheckbox) {
        lockCheckbox.addEventListener('change', function() {
            ChordProgressionSequencer.lockPattern = this.checked;
        });
    }

    // Regenerate button
    const regenerateBtn = document.getElementById('regeneratePattern');
    if (regenerateBtn) {
        regenerateBtn.addEventListener('click', function() {
            ChordProgressionSequencer.regenerate(appState.chordProgression);
            updateProgressionPreview();
        });
    }

    // Initial render of method-specific controls
    renderSequenceMethodControls();
}

/**
 * Initialize chord change Euclidean circle
 * NOTE: No longer needed - chord rhythm now shown on main circle!
 */
function initializeChordChangeCircle() {
    // Merged into main Euclidean circle - nothing to do here
}

/**
 * Regenerate chord change Euclidean pattern
 */
function regenerateChordChangePattern() {
    const { hits, steps, rotation } = appState.chordSequencing.euclidean;
    const pattern = euclidean(hits, steps);
    appState.chordSequencing.euclidean.pattern = rotatePattern(pattern, rotation);

    // Update main circle with new chord pattern
    renderChordChangeCircle();
}

/**
 * Render chord change Euclidean circle visualization
 * NOTE: Chord rhythm now shown on main circle as outer gold diamonds!
 */
function renderChordChangeCircle() {
    // Update main Euclidean circle with chord rhythm data
    const { hits, steps, pattern } = appState.chordSequencing.euclidean;
    const currentStep = appState.chordSequencing.stepIndex;

    // Call main circle's updateChordPattern function
    EuclideanCircle.updateChordPattern(steps, hits, pattern, currentStep);
}

/**
 * Render method-specific controls for selected sequencing method
 */
function renderSequenceMethodControls() {
    const container = document.getElementById('sequenceMethodControls');
    if (!container) return;

    const method = ChordProgressionSequencer.method;
    let html = '<div class="control-row">';

    switch (method) {
        case 'root-melody':
            html += `
                <div class="filter-group">
                    <label>Pattern</label>
                    <select id="rootMelodyPattern">
                        <option value="ascending" ${ChordProgressionSequencer.rootMelodyPattern === 'ascending' ? 'selected' : ''}>Ascending</option>
                        <option value="descending" ${ChordProgressionSequencer.rootMelodyPattern === 'descending' ? 'selected' : ''}>Descending</option>
                        <option value="up-down" ${ChordProgressionSequencer.rootMelodyPattern === 'up-down' ? 'selected' : ''}>Up-Down</option>
                        <option value="down-up" ${ChordProgressionSequencer.rootMelodyPattern === 'down-up' ? 'selected' : ''}>Down-Up</option>
                        <option value="converging" ${ChordProgressionSequencer.rootMelodyPattern === 'converging' ? 'selected' : ''}>Converging</option>
                        <option value="diverging" ${ChordProgressionSequencer.rootMelodyPattern === 'diverging' ? 'selected' : ''}>Diverging</option>
                        <option value="random-walk" ${ChordProgressionSequencer.rootMelodyPattern === 'random-walk' ? 'selected' : ''}>Random Walk</option>
                    </select>
                </div>
            `;
            break;

        case 'circle-fifths':
            html += `
                <div class="filter-group">
                    <label>Direction</label>
                    <select id="circleFifthsDirection">
                        <option value="clockwise" ${ChordProgressionSequencer.circleFifthsDirection === 'clockwise' ? 'selected' : ''}>Clockwise</option>
                        <option value="counter-clockwise" ${ChordProgressionSequencer.circleFifthsDirection === 'counter-clockwise' ? 'selected' : ''}>Counter-clockwise</option>
                        <option value="random" ${ChordProgressionSequencer.circleFifthsDirection === 'random' ? 'selected' : ''}>Random</option>
                    </select>
                </div>
            `;
            break;

        case 'voice-leading':
            html += `
                <div class="filter-group">
                    <label>Optimization</label>
                    <select id="voiceLeadingOptimization">
                        <option value="smooth" ${ChordProgressionSequencer.voiceLeadingOptimization === 'smooth' ? 'selected' : ''}>Smooth (Minimal)</option>
                        <option value="interesting" ${ChordProgressionSequencer.voiceLeadingOptimization === 'interesting' ? 'selected' : ''}>Interesting (Moderate)</option>
                        <option value="contrasting" ${ChordProgressionSequencer.voiceLeadingOptimization === 'contrasting' ? 'selected' : ''}>Contrasting (Maximal)</option>
                    </select>
                </div>
            `;
            break;

        case 'random':
        case 'functional':
        default:
            html += '<div class="filter-group"><small style="color: var(--muted);">No additional parameters</small></div>';
            break;
    }

    html += '</div>';
    container.innerHTML = html;

    // Bind newly created controls
    const rootMelodySelect = document.getElementById('rootMelodyPattern');
    if (rootMelodySelect) {
        rootMelodySelect.addEventListener('change', function() {
            ChordProgressionSequencer.rootMelodyPattern = this.value;
            updateProgressionPreview();
        });
    }

    const circleFifthsSelect = document.getElementById('circleFifthsDirection');
    if (circleFifthsSelect) {
        circleFifthsSelect.addEventListener('change', function() {
            ChordProgressionSequencer.circleFifthsDirection = this.value;
            updateProgressionPreview();
        });
    }

    const voiceLeadingSelect = document.getElementById('voiceLeadingOptimization');
    if (voiceLeadingSelect) {
        voiceLeadingSelect.addEventListener('change', function() {
            ChordProgressionSequencer.voiceLeadingOptimization = this.value;
            updateProgressionPreview();
        });
    }
}

/**
 * Update progression preview display
 */
function updateProgressionPreview() {
    const previewEl = document.getElementById('progressionPreviewText');
    if (!previewEl) return;

    if (!appState.chordProgression || appState.chordProgression.length === 0) {
        previewEl.textContent = 'Generate chords first';
        return;
    }

    // Regenerate sequence if not locked
    if (!ChordProgressionSequencer.lockPattern) {
        ChordProgressionSequencer.regenerate(appState.chordProgression);
    }

    // Get preview string from sequencer
    const preview = ChordProgressionSequencer.getPreviewString(appState.chordProgression);
    previewEl.textContent = preview;
}

/**
 * Update UI based on playback mode (arpeggio/stab)
 */
function updatePlaybackModeUI() {
    const noteVariationSection = document.getElementById('noteVariationSection');
    const stabControls = document.getElementById('stabControls');
    const octaveSpreadGroup = document.getElementById('octaveSpreadGroup');
    const chordProgressionSection = document.getElementById('chordProgressionSection');
    const chordRhythmControls = document.getElementById('chordRhythmControls');

    if (appState.playbackMode === 'stab') {
        // Chord Stab mode: show strum controls, disable note-level variation, show chord progression
        noteVariationSection?.classList.add('disabled');
        if (stabControls) stabControls.style.display = 'flex';
        // Octave spread now works in stab mode! (spreads chord across octaves)
        if (octaveSpreadGroup) octaveSpreadGroup.style.opacity = '1';
        if (chordProgressionSection) chordProgressionSection.style.display = 'block';
        // Show chord rhythm controls next to the circle!
        if (chordRhythmControls) chordRhythmControls.style.display = 'block';

        // Initialize chord change Euclidean circle if not already done
        if (!appState.chordProgressionCircleInitialized) {
            initializeChordChangeCircle();
            appState.chordProgressionCircleInitialized = true;
        }
        // Update main circle to show chord rhythm
        renderChordChangeCircle();
    } else {
        // Arpeggio mode: hide strum controls, enable note-level variation, hide chord progression
        noteVariationSection?.classList.remove('disabled');
        if (stabControls) stabControls.style.display = 'none';
        if (octaveSpreadGroup) octaveSpreadGroup.style.opacity = '1';
        if (chordProgressionSection) chordProgressionSection.style.display = 'none';
        // Hide chord rhythm controls (not needed in arpeggio mode)
        if (chordRhythmControls) chordRhythmControls.style.display = 'none';

        // Clear chord rhythm from main circle (arpeggio mode doesn't need it)
        EuclideanCircle.updateChordPattern(0, 0, [], -1);
    }
}

function renderVelocityControls() {
    const container = document.getElementById('velocityControls');
    if (appState.velocity.mode === 'fixed') {
        container.innerHTML = `
            <label>Value: <span id="velFixedValue">${appState.velocity.fixed}</span>
                <input type="range" id="velFixed" min="1" max="127" value="${appState.velocity.fixed}">
            </label>
        `;
        document.getElementById('velFixed')?.addEventListener('input', function() {
            appState.velocity.fixed = parseInt(this.value);
            document.getElementById('velFixedValue').textContent = this.value;
        });
    } else if (appState.velocity.mode === 'random') {
        container.innerHTML = `
            <label>Min: ${appState.velocity.randomMin} <input type="range" min="1" max="127" value="${appState.velocity.randomMin}" id="velMin"></label>
            <label>Max: ${appState.velocity.randomMax} <input type="range" min="1" max="127" value="${appState.velocity.randomMax}" id="velMax"></label>
        `;
        document.getElementById('velMin')?.addEventListener('input', function() {
            appState.velocity.randomMin = parseInt(this.value);
        });
        document.getElementById('velMax')?.addEventListener('input', function() {
            appState.velocity.randomMax = parseInt(this.value);
        });
    } else if (appState.velocity.mode === 'curve') {
        container.innerHTML = `
            <label>
                Curve Type:
                <select id="velocityCurveType">
                    <option value="linear-ascending">Linear Ascending</option>
                    <option value="linear-descending">Linear Descending</option>
                    <option value="exponential">Exponential</option>
                    <option value="logarithmic">Logarithmic</option>
                    <option value="sinusoidal">Sinusoidal</option>
                    <option value="triangle">Triangle</option>
                </select>
            </label>
            <label>
                Min: <span id="velocityCurveMinValue">${appState.velocity.curveMin}</span>
                <input type="range" id="velocityCurveMin" min="1" max="127" value="${appState.velocity.curveMin}">
            </label>
            <label>
                Max: <span id="velocityCurveMaxValue">${appState.velocity.curveMax}</span>
                <input type="range" id="velocityCurveMax" min="1" max="127" value="${appState.velocity.curveMax}">
            </label>
        `;
        document.getElementById('velocityCurveType').value = appState.velocity.curveType;
        document.getElementById('velocityCurveType')?.addEventListener('change', function() {
            appState.velocity.curveType = this.value;
        });
        document.getElementById('velocityCurveMin')?.addEventListener('input', function() {
            appState.velocity.curveMin = parseInt(this.value);
            document.getElementById('velocityCurveMinValue').textContent = this.value;
        });
        document.getElementById('velocityCurveMax')?.addEventListener('input', function() {
            appState.velocity.curveMax = parseInt(this.value);
            document.getElementById('velocityCurveMaxValue').textContent = this.value;
        });
    }
}

function renderGateControls() {
    const container = document.getElementById('gateControls');
    const toPercent = v => Math.round(v * 100) + '%';

    if (appState.gate.mode === 'fixed') {
        container.innerHTML = `
            <label>Value: <span id="gateFixedValue">${toPercent(appState.gate.fixed)}</span>
                <input type="range" id="gateFixed" min="0.1" max="1" step="0.05" value="${appState.gate.fixed}">
            </label>
        `;
        document.getElementById('gateFixed')?.addEventListener('input', function() {
            appState.gate.fixed = parseFloat(this.value);
            document.getElementById('gateFixedValue').textContent = toPercent(appState.gate.fixed);
        });
    } else if (appState.gate.mode === 'random') {
        container.innerHTML = `
            <label>Min: ${toPercent(appState.gate.randomMin)} <input type="range" min="0.1" max="1" step="0.05" value="${appState.gate.randomMin}" id="gateMin"></label>
            <label>Max: ${toPercent(appState.gate.randomMax)} <input type="range" min="0.1" max="1" step="0.05" value="${appState.gate.randomMax}" id="gateMax"></label>
        `;
        document.getElementById('gateMin')?.addEventListener('input', function() {
            appState.gate.randomMin = parseFloat(this.value);
        });
        document.getElementById('gateMax')?.addEventListener('input', function() {
            appState.gate.randomMax = parseFloat(this.value);
        });
    } else if (appState.gate.mode === 'curve') {
        container.innerHTML = `
            <label>
                Curve Type:
                <select id="gateCurveType">
                    <option value="linear-ascending">Linear Ascending</option>
                    <option value="linear-descending">Linear Descending</option>
                    <option value="exponential">Exponential</option>
                    <option value="logarithmic">Logarithmic</option>
                    <option value="sinusoidal">Sinusoidal</option>
                    <option value="triangle">Triangle</option>
                </select>
            </label>
            <label>
                Min: <span id="gateCurveMinValue">${toPercent(appState.gate.curveMin)}</span>
                <input type="range" id="gateCurveMin" min="0.05" max="1" step="0.01" value="${appState.gate.curveMin}">
            </label>
            <label>
                Max: <span id="gateCurveMaxValue">${toPercent(appState.gate.curveMax)}</span>
                <input type="range" id="gateCurveMax" min="0.05" max="1" step="0.01" value="${appState.gate.curveMax}">
            </label>
        `;
        document.getElementById('gateCurveType').value = appState.gate.curveType;
        document.getElementById('gateCurveType')?.addEventListener('change', function() {
            appState.gate.curveType = this.value;
        });
        document.getElementById('gateCurveMin')?.addEventListener('input', function() {
            appState.gate.curveMin = parseFloat(this.value);
            document.getElementById('gateCurveMinValue').textContent = toPercent(appState.gate.curveMin);
        });
        document.getElementById('gateCurveMax')?.addEventListener('input', function() {
            appState.gate.curveMax = parseFloat(this.value);
            document.getElementById('gateCurveMaxValue').textContent = toPercent(appState.gate.curveMax);
        });
    }
}

// ============================================================================
// Initialization
// ============================================================================

async function initialize() {
    console.log('Ouarpeggiator initializing...');

    // Bind all controls first (no rendering)
    bindControls();

    // Generate initial progression (priority: render chord palette ASAP)
    generateProgression();

    // Initialize Euclidean circle visualization
    EuclideanCircle.initEuclideanCircle('euclideanCircle');

    // Generate initial pattern
    regeneratePattern();

    // Initialize chord progression sequencing pattern
    regenerateChordChangePattern();

    // Render velocity/gate controls
    renderVelocityControls();
    renderGateControls();

    // Initialize suggestions
    updateSuggestions();

    // Initialize MIDI (async, lower priority)
    await initializeMIDI();

    // Piano roll is initialized lazily on first playback (lowest priority)

    console.log('Ouarpeggiator ready');
}

// Start
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}

// Debug
window.ouarpeggiatorState = appState;
window.ouarpeggiatorMIDI = MIDI;

// MIDI Diagnostics - call from console: ouarpDiagnoseMIDI()
window.ouarpDiagnoseMIDI = function() {
    console.log('=== Ouarpeggiator MIDI Diagnostics ===');
    console.log('Browser:', navigator.userAgent);
    console.log('WebMIDI API available:', MIDI.isWebMIDIAvailable());
    console.log('MIDI initialized:', MIDI.isMIDIInitialized());

    if (!MIDI.isWebMIDIAvailable()) {
        console.error('❌ WebMIDI API not available in this browser');
        console.log('💡 Try Chrome, Edge, or Opera (Firefox requires flag)');
        return;
    }

    if (!MIDI.isMIDIInitialized()) {
        console.error('❌ MIDI not initialized - initialization failed');
        return;
    }

    const inputs = MIDI.getInputDevices();
    const outputs = MIDI.getOutputDevices();

    console.log(`\n📥 MIDI Inputs (${inputs.length}):`);
    if (inputs.length === 0) {
        console.log('  (none detected)');
    } else {
        inputs.forEach((device, i) => {
            console.log(`  ${i + 1}. ${device.name} [${device.id}]`);
        });
    }

    console.log(`\n📤 MIDI Outputs (${outputs.length}):`);
    if (outputs.length === 0) {
        console.log('  (none detected)');
    } else {
        outputs.forEach((device, i) => {
            const selected = MIDI.getSelectedOutput()?.id === device.id ? ' ✓ SELECTED' : '';
            console.log(`  ${i + 1}. ${device.name} [${device.id}]${selected}`);
        });
    }

    if (inputs.length === 0 && outputs.length === 0) {
        console.log('\n🔍 Troubleshooting:');
        console.log('  1. Check if MIDI devices are physically connected');
        console.log('  2. Check if MIDI drivers are installed and running');

        // OS-specific virtual MIDI recommendations
        const ua = navigator.userAgent.toLowerCase();
        if (ua.includes('win')) {
            console.log('  3. Try virtual MIDI ports: loopMIDI (Windows)');
        } else if (ua.includes('mac')) {
            console.log('  3. Try virtual MIDI ports: IAC Driver (macOS, built-in)');
        } else if (ua.includes('linux')) {
            console.log('  3. Try virtual MIDI ports: virmidi (Linux)');
        } else {
            // Fallback for ambiguous user agents
            console.log('  3. Try virtual MIDI ports (loopMIDI/IAC Driver/virmidi)');
        }

        console.log('  4. Reload page after connecting devices');
        console.log('  5. Check browser MIDI permissions in site settings');
    }

    console.log('\n💻 System Check:');
    console.log('  - Secure context (HTTPS/localhost):', window.isSecureContext);
    console.log('  - Page protocol:', window.location.protocol);

    console.log('\n=================================');
};
