/**
 * Ouarpeggiator - Main Application Module
 *
 * Euclidean rhythm arpeggiator with integrated chord progression generator.
 */

import { euclidean, rotatePattern } from './euclidean.js';
import * as MIDI from './midi.js';
import * as Arpeggiator from './arpeggiator.js';
import * as MusicTheory from './modules/musicTheory.js';
import * as Audio from './modules/audio.js';

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
    outputMode: 'audio',  // 'midi' | 'audio' | 'both'

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

    // Variation
    harmonicVariation: 0,
    rhythmicVariation: 0,
    voiceLeading: 'smooth',
    lastPlayedNote: null,

    // Velocity/Gate
    velocity: { mode: 'fixed', fixed: 100, randomMin: 60, randomMax: 110, curveType: 'linear-ascending', curveMin: 60, curveMax: 120 },
    gate: { mode: 'fixed', fixed: 0.8, randomMin: 0.5, randomMax: 0.9, curveType: 'linear-ascending', curveMin: 0.3, curveMax: 0.95 },

    // Runtime
    euclideanStepIndex: 0,
    scheduledNotes: [],

    // Generation tracking
    hasGeneratedOnce: false,
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
    { name: 'Smooth', description: 'Close voicings with minimal voice movement', octaveOffset: 0 },
    { name: 'Classic', description: 'Traditional root position voicings', octaveOffset: 0 },
    { name: 'Jazz', description: 'Extended voicings with added tensions', octaveOffset: 0 },
    { name: 'Modal', description: 'Open voicings emphasizing modal color', octaveOffset: -12 },
    { name: 'Experimental', description: 'Wide intervals and unusual voicings', octaveOffset: 12 }
];

// ============================================================================
// Chord Progression Generation
// ============================================================================

function generateProgression() {
    const key = parseInt(document.getElementById('keySelect').value);
    appState.key = key;

    const noteNames = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

    if (appState.generationMode === 'template') {
        const template = document.getElementById('progressionSelect').value;
        appState.progressionTemplate = template;

        // Generate multiple variants
        appState.variants = VARIANT_TYPES.map(variantType => {
            const scaleDegrees = MusicTheory.getScaleDegrees('Major');
            const generatedChords = MusicTheory.generateProgressionChords(template, key, scaleDegrees, 'Major', 4);

            // Apply variant-specific voicing
            let chords = generatedChords.map(chord => {
                const notes = chord.notes.map(n => n + variantType.octaveOffset);
                return {
                    notes,
                    name: MusicTheory.getChordNameFromNotes(notes),
                    symbol: chord.symbol,
                    type: getChordType(notes)
                };
            });

            // Pad to 16 chords
            while (chords.length < 16) {
                if (chords.length === 0) break;
                chords.push({ ...chords[chords.length % chords.length], empty: chords.length >= 8 });
            }

            return {
                name: variantType.name,
                description: variantType.description,
                chords: chords.slice(0, 16)
            };
        });

        // Update title
        document.getElementById('progressionTitle').textContent =
            `${noteNames[key]} Major: ${template.replace(/ /g, '—')}`;
    } else {
        // Scale Mode: Generate single variant showing all scale chords
        const mode = document.getElementById('modeSelect').value;
        appState.mode = mode;

        const scaleDegrees = MusicTheory.getScaleDegrees(mode);
        let chords = [];

        // Generate all triads in the scale
        for (let degree = 0; degree < 7 && degree < scaleDegrees.length; degree++) {
            const rootNote = 60 + key + scaleDegrees[degree];
            const quality = MusicTheory.getChordQualityForMode(degree, mode);
            const notes = MusicTheory.buildChordRaw(rootNote, quality);

            chords.push({
                notes,
                name: MusicTheory.getChordNameFromNotes(notes),
                symbol: ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'][degree],
                type: quality === 'maj' ? 'major' : quality === 'min' ? 'minor' : quality
            });
        }

        // Pad to 16 chords
        while (chords.length < 16) {
            if (chords.length === 0) break;
            chords.push({ ...chords[chords.length % chords.length], empty: chords.length >= 8 });
        }

        appState.variants = [{
            name: 'Scale',
            description: `All chords from ${mode} scale`,
            chords: chords.slice(0, 16)
        }];

        document.getElementById('progressionTitle').textContent =
            `${noteNames[key]} ${mode}: Scale Exploration`;
    }

    // Reset to first variant and update UI
    appState.currentVariantIndex = 0;
    appState.chordProgression = appState.variants[0].chords;
    appState.currentChordIndex = 0;
    appState.hasGeneratedOnce = true;

    // Update variant selector
    updateVariantSelector();
    renderChordGrid();
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
    grid.innerHTML = '';

    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

    appState.chordProgression.forEach((chord, index) => {
        const pad = document.createElement('div');
        pad.className = 'chord-pad';

        if (chord.empty) {
            pad.classList.add('empty');
        }

        if (index === appState.currentChordIndex && appState.isPlaying) {
            pad.classList.add('current');
        }

        // Get note names for display
        const chordNoteNames = chord.notes ? chord.notes.map(n => noteNames[n % 12]).join(' ') : '';

        // Get quality label
        const qualityLabel = getQualityLabel(chord.type);

        pad.innerHTML = `
            <div class="chord-pad-content">
                <div class="chord-info">
                    <div class="chord-name">${chord.name || '—'}</div>
                    <div class="chord-quality">${qualityLabel}</div>
                    <div class="chord-roman">${chord.symbol || ''}</div>
                </div>
                <span class="pad-number">Pad ${index + 1}</span>
            </div>
            <div class="chord-notes">${chordNoteNames}</div>
            <div class="chord-keyboard">${chord.notes ? generateKeyboardSVG(chord.notes) : ''}</div>
        `;

        // Click to play chord (works whether arpeggiator is running or not)
        pad.addEventListener('click', () => {
            if (!chord.empty && chord.notes) {
                playChordWithFeedback(index, pad);
            }
        });

        grid.appendChild(pad);
    });
}

function getQualityLabel(type) {
    const labels = {
        'major': 'Major',
        'minor': 'Minor',
        'dominant': 'Dominant 7',
        'diminished': 'Diminished',
        'augmented': 'Augmented',
        'suspended': 'Suspended'
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
    if (appState.outputMode === 'audio' || appState.outputMode === 'both') {
        Audio.playChord(chord.notes, 80, 400);
    }

    if ((appState.outputMode === 'midi' || appState.outputMode === 'both') && MIDI.hasOutputDevice()) {
        chord.notes.forEach(note => {
            MIDI.sendNoteOn(note, 80);
            setTimeout(() => MIDI.sendNoteOff(note), 350);
        });
    }
}

function previewChord(index) {
    const chord = appState.chordProgression[index];
    if (!chord || !chord.notes) return;

    // Initialize audio if needed
    if (!Audio.isAudioAvailable()) {
        Audio.initAudio();
    }

    if (appState.outputMode === 'audio' || appState.outputMode === 'both') {
        Audio.playChord(chord.notes, 80, 400);
    }

    if ((appState.outputMode === 'midi' || appState.outputMode === 'both') && MIDI.hasOutputDevice()) {
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
    const display = document.getElementById('patternDisplay');
    display.innerHTML = '';

    appState.euclidean.pattern.forEach((isHit, index) => {
        const step = document.createElement('div');
        step.className = 'step' + (isHit ? ' hit' : '');
        if (index === appState.euclideanStepIndex) {
            step.classList.add('active');
        }
        display.appendChild(step);
    });
}

// ============================================================================
// Clock / Transport
// ============================================================================

let masterClockInterval = null;

function startPlayback() {
    if (appState.isPlaying) return;

    // Initialize audio
    if (appState.outputMode === 'audio' || appState.outputMode === 'both') {
        if (!Audio.isAudioAvailable()) {
            Audio.initAudio();
        }
        Audio.resumeAudio();
    }

    const tickInterval = 60000 / (appState.bpm * 24);

    appState.isPlaying = true;
    appState.tickCount = 0;
    appState.euclideanStepIndex = 0;

    regeneratePattern();

    document.getElementById('startBtn').disabled = true;
    document.getElementById('stopBtn').disabled = false;
    document.getElementById('clockStatus').textContent = 'Playing';
    document.getElementById('clockStatus').classList.add('playing');
    document.getElementById('clockStatus').classList.remove('stopped');

    if (MIDI.hasOutputDevice()) {
        MIDI.sendStart();
    }

    masterClockInterval = setInterval(() => {
        if (MIDI.hasOutputDevice()) {
            MIDI.sendClock();
        }
        handleClockTick();
    }, tickInterval);
}

function stopPlayback() {
    if (masterClockInterval) {
        clearInterval(masterClockInterval);
        masterClockInterval = null;
    }

    appState.isPlaying = false;

    // Stop all notes
    appState.scheduledNotes.forEach(s => {
        clearTimeout(s.handle);
        if (MIDI.hasOutputDevice()) MIDI.sendNoteOff(s.note);
    });
    appState.scheduledNotes = [];

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

function handleClockTick() {
    if (!appState.isPlaying) return;

    appState.tickCount++;

    // Check chord advancement
    const ticksPerBar = 96;
    const ticksPerChordChange = ticksPerBar * appState.barsPerChord;

    if (appState.tickCount > 0 && appState.tickCount % ticksPerChordChange === 0) {
        appState.currentChordIndex = (appState.currentChordIndex + 1) % appState.chordProgression.length;
        renderChordGrid();
    }

    // Check for step trigger
    const ticksPerStep = Math.floor(96 / appState.euclidean.steps);

    if (appState.tickCount % ticksPerStep === 0) {
        executeStep();
    }
}

function executeStep() {
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

    // Apply rhythmic variation
    if (appState.rhythmicVariation > 0 && Math.random() * 100 < appState.rhythmicVariation) {
        appState.euclideanStepIndex = (appState.euclideanStepIndex + 1) % appState.euclidean.steps;
        renderPattern();
        return;
    }

    // Select note
    const chordSize = chord.notes.length;
    const baseNoteIndex = appState.euclideanStepIndex % chordSize;
    const octaveLayer = Math.floor(appState.euclideanStepIndex / chordSize) % appState.octaveSpread;
    let note = chord.notes[baseNoteIndex] + (octaveLayer * 12);

    // Apply harmonic variation
    if (appState.harmonicVariation > 0 && Math.random() * 100 < appState.harmonicVariation) {
        const allNotes = appState.chordProgression.filter(c => c.notes).flatMap(c => c.notes);
        if (allNotes.length > 0) {
            const substitute = allNotes[Math.floor(Math.random() * allNotes.length)];
            while (substitute < note - 12) substitute += 12;
            while (substitute > note + 12) substitute -= 12;
            note = substitute;
        }
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

    setTimeout(() => {
        if (!appState.isPlaying) return;

        // Play note
        if ((appState.outputMode === 'midi' || appState.outputMode === 'both') && MIDI.hasOutputDevice()) {
            MIDI.sendNoteOn(note, velocity);
        }

        if (appState.outputMode === 'audio' || appState.outputMode === 'both') {
            Audio.playNote(note, velocity, gateLength);
        }

        appState.lastPlayedNote = note;

        // Schedule note off for MIDI
        if ((appState.outputMode === 'midi' || appState.outputMode === 'both') && MIDI.hasOutputDevice()) {
            const handle = setTimeout(() => {
                MIDI.sendNoteOff(note);
                appState.scheduledNotes = appState.scheduledNotes.filter(s => s.note !== note);
            }, gateLength);
            appState.scheduledNotes.push({ note, handle });
        }
    }, Math.max(0, humanOffset));

    appState.euclideanStepIndex = (appState.euclideanStepIndex + 1) % appState.euclidean.steps;
    renderPattern();
}

// ============================================================================
// MIDI Device Management
// ============================================================================

async function initializeMIDI() {
    if (!MIDI.isWebMIDIAvailable()) {
        console.log('WebMIDI not available');
        return;
    }

    const access = await MIDI.initMIDI();
    if (!access) {
        console.log('Failed to initialize MIDI');
        return;
    }

    populateMIDIDevices();

    // Re-populate on device change
    access.onstatechange = () => {
        setTimeout(populateMIDIDevices, 100);
    };
}

function populateMIDIDevices() {
    const outputSelect = document.getElementById('midiOutputSelect');
    if (!outputSelect) return;

    const outputs = MIDI.getOutputDevices();

    // Clear existing options and add default
    outputSelect.innerHTML = '<option value="">Browser beep (no MIDI)</option>';

    outputs.forEach(device => {
        const option = document.createElement('option');
        option.value = device.id;
        option.textContent = device.name;
        outputSelect.appendChild(option);
    });

    console.log(`Found ${outputs.length} MIDI output devices`);
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

    // Output mode
    document.getElementById('outputMode').addEventListener('change', function() {
        appState.outputMode = this.value;

        const midiConfig = document.getElementById('midiOutputConfig');
        const audioConfig = document.getElementById('audioConfig');

        midiConfig.style.display = (this.value === 'midi' || this.value === 'both') ? 'block' : 'none';
        audioConfig.style.display = (this.value === 'audio' || this.value === 'both') ? 'block' : 'none';

        if (this.value === 'audio' || this.value === 'both') {
            Audio.initAudio();
        }
    });

    // MIDI output select
    document.getElementById('midiOutputSelect').addEventListener('change', function() {
        MIDI.selectOutputDevice(this.value);
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
    });

    document.getElementById('stepsSlider').addEventListener('input', function() {
        appState.euclidean.steps = parseInt(this.value);
        document.getElementById('stepsValue').textContent = this.value;
        document.getElementById('rotationSlider').max = appState.euclidean.steps - 1;
        regeneratePattern();
    });

    document.getElementById('rotationSlider').addEventListener('input', function() {
        appState.euclidean.rotation = parseInt(this.value);
        document.getElementById('rotationValue').textContent = this.value;
        regeneratePattern();
    });

    document.getElementById('octaveSpread').addEventListener('input', function() {
        appState.octaveSpread = parseInt(this.value);
        document.getElementById('octaveValue').textContent = this.value;
    });

    // Timing
    document.getElementById('bpmSlider').addEventListener('input', function() {
        appState.bpm = parseInt(this.value);
        document.getElementById('bpmValue').textContent = this.value;

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

    // Variation
    document.getElementById('harmonicVariation').addEventListener('input', function() {
        appState.harmonicVariation = parseInt(this.value);
        document.getElementById('harmonicValue').textContent = this.value + '%';
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
    } else {
        container.innerHTML = '<span>Curve mode</span>';
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
    } else {
        container.innerHTML = '<span>Curve mode</span>';
    }
}

// ============================================================================
// Initialization
// ============================================================================

async function initialize() {
    console.log('Ouarpeggiator initializing...');

    // Initialize MIDI
    await initializeMIDI();

    // Bind all controls
    bindControls();

    // Generate initial pattern
    regeneratePattern();

    // Render velocity/gate controls
    renderVelocityControls();
    renderGateControls();

    // Generate initial progression
    generateProgression();

    // Initialize suggestions
    updateSuggestions();

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
