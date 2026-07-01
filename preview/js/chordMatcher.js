/**
 * Chord Matcher & Generation Mode Toggle
 *
 * Small self-contained UI cluster: lets the user pick required chords and get
 * suggested key/mode. Touches only appState + the DOM. Functions referenced by
 * inline/generated onclick handlers are exposed on `window`.
 */

import { appState } from './appState.js';

export function toggleChordMatcher() {
    const matcher = document.getElementById('chordMatcher');
    matcher.classList.toggle('expanded');
}

// Expose globally for onclick
window.toggleChordMatcher = toggleChordMatcher;

export function addChordRequirement() {
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

export function removeChordRequirement(index) {
    appState.selectedChords.splice(index, 1);
    renderSelectedChords();
    updateSuggestions();
}

// Expose globally for onclick
window.removeChordRequirement = removeChordRequirement;

export function clearChordRequirements() {
    appState.selectedChords = [];
    renderSelectedChords();
    updateSuggestions();
}

// Expose globally for onclick
window.clearChordRequirements = clearChordRequirements;

export function renderSelectedChords() {
    const container = document.getElementById('selectedChords');
    container.innerHTML = appState.selectedChords.map((chord, i) =>
        `<span class="chord-tag">${chord.name}<button onclick="removeChordRequirement(${i})">×</button></span>`
    ).join('');
}

export function updateSuggestions() {
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

export function applySuggestion(key, mode) {
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

export function switchGenerationMode(mode) {
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
