/**
 * Ouarpeggiator - Main entry point
 *
 * Thin orchestrator: imports the feature modules (which wire themselves up),
 * runs initialize() on load, and exposes debug hooks. Application logic lives
 * in the feature modules (appState, chordMatcher, chordProgression, transport,
 * ui, midiSetup) and the shared sequencerCore.
 */

import { appState } from './appState.js';
import * as MIDI from './midi.js';
import * as PianoRoll from './pianoRoll.js';
import * as EuclideanCircle from './euclideanCircle.js';
import { updateSuggestions } from './chordMatcher.js';
import { generateProgression } from './chordProgression.js';
import { regeneratePattern } from './transport.js';
import { bindControls, regenerateChordChangePattern, renderVelocityControls, renderGateControls, updatePlaybackModeUI, renderSequenceMethodControls } from './ui.js';
import { initializeMIDI } from './midiSetup.js';
import { loadSettings, applySettings, restoreOutputSelection, startAutosave } from './persistence.js';

// ============================================================================
// Initialization
// ============================================================================

async function initialize() {
    console.log('Ouarpeggiator initializing...');

    // Bind all controls first (no rendering)
    bindControls();

    // Restore persisted settings (URL > localStorage) into state + controls
    // BEFORE the initial render/generation so everything reflects them.
    const restored = loadSettings();
    if (restored) applySettings(restored);

    // Generate initial progression (priority: render chord palette ASAP)
    generateProgression();

    // Initialize Euclidean circle visualization
    EuclideanCircle.initEuclideanCircle('euclideanCircle');

    // Generate initial pattern
    regeneratePattern();

    // Initialize chord progression sequencing pattern
    regenerateChordChangePattern();

    // Reflect restored playback mode + sequencer method in the UI (safe now
    // that the Euclidean circle is initialized).
    if (restored) {
        updatePlaybackModeUI();
        renderSequenceMethodControls();
    }

    // Render velocity/gate controls
    renderVelocityControls();
    renderGateControls();

    // Initialize suggestions
    updateSuggestions();

    // Initialize MIDI (async, lower priority)
    await initializeMIDI();

    // Now that MIDI devices are populated, restore the output selection
    if (restored) restoreOutputSelection();

    // Initialize piano roll on load so it's visible before first playback
    PianoRoll.initPianoRoll('pianoRollContainer');
    PianoRoll.setOctaveSpread(appState.octaveSpread);
    appState.pianoRollInitialized = true;

    // Start autosave (localStorage + URL) on any control interaction
    startAutosave();

    console.log('Ouarpeggiator ready');
}

// Start
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}

// Register service worker for offline / installable PWA (relative path so it
// works under the GitHub Pages sub-path, e.g. /Ouarpeggiator/preview/).
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('service-worker.js').catch(err => {
            console.warn('Service worker registration failed:', err);
        });
    });
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
