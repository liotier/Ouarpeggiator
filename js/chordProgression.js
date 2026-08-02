/**
 * Chord Progression Generation & Rendering
 *
 * Generates chord progressions (template / scale modes) with multiple voicing
 * variants, renders the 16-pad chord grid + per-chord mini-keyboards, and
 * handles pad interaction. Depends on musicTheory for the harmony work.
 */

import { appState, TIMING } from './appState.js';
import * as MusicTheory from './modules/musicTheory.js';
import * as Audio from './modules/audio.js';
import * as MIDI from './midi.js';
import { sendToJuno106, syncChordProgressionToWorker, jumpToChord } from './transport.js';
import { applyTranspose } from './sequencerCore.js';

function triggerSparkle() {
    const btn = document.getElementById('generateBtn');
    if (btn) {
        btn.classList.add('sparkle');
        setTimeout(() => btn.classList.remove('sparkle'), TIMING.SPARKLE_DURATION);
    }
}

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
    const baseSymbol = symbol.replaceAll(/[0-9]+|M7|m7|maj7|°7|ø7/g, '');
    if (CHORD_DESCRIPTIONS[baseSymbol]) {
        return CHORD_DESCRIPTIONS[baseSymbol];
    }

    // Try simplified version
    const simplified = symbol.replaceAll(/7|maj|min|°|ø|\+/g, '');
    if (CHORD_DESCRIPTIONS[simplified]) {
        return CHORD_DESCRIPTIONS[simplified];
    }

    return '';
}

function generateProgression() {
    const key = Number.parseInt(document.getElementById('keySelect').value);
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
                baseChordCount: originalProgressionLength,
                // Literal progression as written (duplicates preserved), voiced
                // for this variant — played verbatim by "in order" chord mode.
                progressionChords: chords.map(c => ({ notes: c.notes.slice(), symbol: c.symbol }))
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
                baseChordCount: 4,
                progressionChords: fallbackChords.map(c => ({ notes: c.notes.slice(), symbol: c.symbol }))
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
        // The distinct scale chords in order, before octave-padding — used by
        // "in order" chord mode (scale mode has no repeats, but keep it uniform).
        const scaleProgressionChords = chords.map(c => ({ notes: c.notes.slice(), symbol: c.symbol }));
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
            baseChordCount,
            progressionChords: scaleProgressionChords
        }];
    }

    // Reset to first variant and update UI
    appState.currentVariantIndex = 0;
    appState.chordProgression = appState.variants[0].chords;
    appState.currentChordIndex = 0;
    // How many pads came from the template (drives "play in order" looping).
    appState.progressionLength = appState.variants[0].baseChordCount || 0;
    appState.orderedProgression = appState.variants[0].progressionChords || [];
    appState.progressionPos = 0;
    appState.hasGeneratedOnce = true;

    // Update variant selector
    updateVariantSelector();
    renderChordGrid();
    syncChordProgressionToWorker();
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
    appState.progressionLength = appState.variants[index].baseChordCount || 0;
    appState.orderedProgression = appState.variants[index].progressionChords || [];
    appState.progressionPos = 0;

    // Update description
    const description = document.getElementById('variantDescription');
    const currentVariant = appState.variants[index];
    if (currentVariant && description) {
        description.textContent = currentVariant.description;
    }

    renderChordGrid();
    syncChordProgressionToWorker();
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
        pad.dataset.role = roleText.replaceAll(/"/g, '&quot;');
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
    const baseSymbol = symbol.replaceAll(/[0-9]+|M7|m7|maj7|°7|ø7/g, '');
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

    // While playing, a pad press jumps the arpeggio/stab to that chord instead
    // of blasting a one-shot preview on top of the running sequence — the
    // sequencer voices the new chord on the next step.
    if (appState.isPlaying) {
        jumpToChord(index);
        return;
    }

    // Stopped: audition the chord as a one-shot preview, matching the live
    // transpose so the preview reflects what will actually play.
    if (!Audio.isAudioAvailable()) {
        Audio.initAudio();
    }

    const notes = chord.notes.map(note => applyTranspose(note, appState));

    if (appState.outputMode === 'audio') {
        Audio.playChord(notes, 80, 400);
    } else if (appState.outputMode === 'midi' && MIDI.hasOutputDevice()) {
        notes.forEach(note => {
            MIDI.sendNoteOn(note, 80);
            setTimeout(() => MIDI.sendNoteOff(note), 350);
        });
    } else if (appState.outputMode === 'juno106') {
        notes.forEach(note => {
            sendToJuno106({ type: 'noteOn', value: note });
            setTimeout(() => sendToJuno106({ type: 'noteOff', value: note }), 350);
        });
    }
}


export {
    triggerSparkle,
    generateProgression,
    updateVariantSelector,
    switchVariant,
    renderChordGrid,
    playChordWithFeedback
};
