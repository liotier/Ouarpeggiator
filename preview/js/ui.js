/**
 * UI Module
 *
 * Handles all user interface bindings, dynamic control rendering,
 * and visual feedback updates.
 *
 * Adapted from AkaiMPC Chord Progression Generator with significant
 * extensions for arpeggiator-specific controls.
 */

import { euclidean, rotatePattern, patternToString } from './euclidean.js';
import { analyzeChord, getChordClass } from './arpeggiator.js';

// ============================================================================
// UI State
// ============================================================================

let uiState = {
    animationFrameId: null,
    lastActiveStep: -1,
};

// ============================================================================
// Main Initialization
// ============================================================================

/**
 * Initialize all UI components and bindings
 *
 * @param {Object} state - Application state
 * @param {Object} callbacks - Callback functions for state changes
 */
function initializeUI(state, callbacks) {
    bindPatternControls(state, callbacks);
    bindTimingControls(state, callbacks);
    bindVariationControls(state);
    bindOutputControls(state);
    bindChordProgressionControls(state, callbacks);

    // Initial render
    regeneratePattern(state);
    updatePadDisplay(state);
    renderVelocityControls(state);
    renderGateControls(state);
}

// ============================================================================
// Pattern Controls
// ============================================================================

/**
 * Bind pattern control elements
 */
function bindPatternControls(state, callbacks) {
    const hitsSlider = document.getElementById('hits-slider');
    const stepsSlider = document.getElementById('steps-slider');
    const rotationSlider = document.getElementById('rotation-slider');
    const octaveSlider = document.getElementById('octave-spread');

    if (hitsSlider) {
        hitsSlider.value = state.euclidean.hits;
        document.getElementById('hits-value').textContent = state.euclidean.hits;

        hitsSlider.addEventListener('input', (e) => {
            state.euclidean.hits = parseInt(e.target.value);
            document.getElementById('hits-value').textContent = state.euclidean.hits;

            // Ensure hits <= steps
            if (state.euclidean.hits > state.euclidean.steps) {
                state.euclidean.steps = state.euclidean.hits;
                stepsSlider.value = state.euclidean.steps;
                document.getElementById('steps-value').textContent = state.euclidean.steps;
            }

            regeneratePattern(state);
            callbacks?.onPatternChange?.(state);
        });
    }

    if (stepsSlider) {
        stepsSlider.value = state.euclidean.steps;
        document.getElementById('steps-value').textContent = state.euclidean.steps;

        stepsSlider.addEventListener('input', (e) => {
            state.euclidean.steps = parseInt(e.target.value);
            document.getElementById('steps-value').textContent = state.euclidean.steps;

            // Ensure hits <= steps
            if (state.euclidean.hits > state.euclidean.steps) {
                state.euclidean.hits = state.euclidean.steps;
                hitsSlider.value = state.euclidean.hits;
                document.getElementById('hits-value').textContent = state.euclidean.hits;
            }

            // Update rotation max
            rotationSlider.max = state.euclidean.steps - 1;
            if (state.euclidean.rotation >= state.euclidean.steps) {
                state.euclidean.rotation = 0;
                rotationSlider.value = 0;
                document.getElementById('rotation-value').textContent = 0;
            }

            regeneratePattern(state);
            callbacks?.onPatternChange?.(state);
        });
    }

    if (rotationSlider) {
        rotationSlider.value = state.euclidean.rotation;
        rotationSlider.max = state.euclidean.steps - 1;
        document.getElementById('rotation-value').textContent = state.euclidean.rotation;

        rotationSlider.addEventListener('input', (e) => {
            state.euclidean.rotation = parseInt(e.target.value);
            document.getElementById('rotation-value').textContent = state.euclidean.rotation;
            regeneratePattern(state);
            callbacks?.onPatternChange?.(state);
        });
    }

    if (octaveSlider) {
        octaveSlider.value = state.octaveSpread;
        document.getElementById('octave-value').textContent = state.octaveSpread;

        octaveSlider.addEventListener('input', (e) => {
            state.octaveSpread = parseInt(e.target.value);
            document.getElementById('octave-value').textContent = state.octaveSpread;
        });
    }
}

/**
 * Regenerate Euclidean pattern and update display
 */
function regeneratePattern(state) {
    const basePattern = euclidean(state.euclidean.hits, state.euclidean.steps);
    state.euclidean.pattern = rotatePattern(basePattern, state.euclidean.rotation);
    updatePatternDisplay(state);
}

/**
 * Update pattern visualization
 */
function updatePatternDisplay(state) {
    const display = document.getElementById('pattern-display');
    if (!display) return;

    display.innerHTML = '';

    state.euclidean.pattern.forEach((isHit, index) => {
        const step = document.createElement('div');
        step.className = 'step' + (isHit ? ' hit' : '');
        step.dataset.index = index;

        if (index === state.euclideanStepIndex) {
            step.classList.add('active');
        }

        display.appendChild(step);
    });

    // Update pattern string display if present
    const patternString = document.getElementById('pattern-string');
    if (patternString) {
        patternString.textContent = patternToString(state.euclidean.pattern);
    }
}

/**
 * Highlight current step in pattern display
 */
function highlightCurrentStep(state) {
    const display = document.getElementById('pattern-display');
    if (!display) return;

    const steps = display.querySelectorAll('.step');

    // Remove previous active
    if (uiState.lastActiveStep >= 0 && steps[uiState.lastActiveStep]) {
        steps[uiState.lastActiveStep].classList.remove('active');
    }

    // Add new active
    if (steps[state.euclideanStepIndex]) {
        steps[state.euclideanStepIndex].classList.add('active');
    }

    uiState.lastActiveStep = state.euclideanStepIndex;
}

// ============================================================================
// Timing Controls
// ============================================================================

/**
 * Bind timing control elements
 */
function bindTimingControls(state, callbacks) {
    const clockToggle = document.getElementById('clock-mode-toggle');
    const bpmSlider = document.getElementById('bpm-slider');
    const startBtn = document.getElementById('start-button');
    const stopBtn = document.getElementById('stop-button');
    const barsButtons = document.querySelectorAll('.bars-btn');
    const humanizationSlider = document.getElementById('humanization');

    if (clockToggle) {
        clockToggle.checked = state.clock.mode === 'slave';
        updateClockModeDisplay(state);

        clockToggle.addEventListener('change', (e) => {
            state.clock.mode = e.target.checked ? 'slave' : 'master';
            updateClockModeDisplay(state);
            callbacks?.onClockModeChange?.(state);
        });
    }

    if (bpmSlider) {
        bpmSlider.value = state.clock.bpm;
        document.getElementById('bpm-value').textContent = state.clock.bpm;

        bpmSlider.addEventListener('input', (e) => {
            state.clock.bpm = parseInt(e.target.value);
            document.getElementById('bpm-value').textContent = state.clock.bpm;
            callbacks?.onBPMChange?.(state);
        });
    }

    if (startBtn) {
        startBtn.addEventListener('click', () => {
            callbacks?.onStart?.();
        });
    }

    if (stopBtn) {
        stopBtn.addEventListener('click', () => {
            callbacks?.onStop?.();
        });
    }

    barsButtons.forEach(btn => {
        if (parseInt(btn.dataset.value) === state.barsPerChord) {
            btn.classList.add('active');
        }

        btn.addEventListener('click', () => {
            barsButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.barsPerChord = parseInt(btn.dataset.value);
        });
    });

    if (humanizationSlider) {
        humanizationSlider.value = state.humanization;
        document.getElementById('humanization-value').textContent = state.humanization;

        humanizationSlider.addEventListener('input', (e) => {
            state.humanization = parseInt(e.target.value);
            document.getElementById('humanization-value').textContent = state.humanization;
        });
    }
}

/**
 * Update clock mode display
 */
function updateClockModeDisplay(state) {
    const label = document.getElementById('clock-mode-label');
    const bpmControl = document.getElementById('bpm-control');
    const transport = document.getElementById('transport');

    if (label) {
        label.textContent = state.clock.mode === 'master' ? 'Master' : 'Slave';
    }

    if (bpmControl) {
        bpmControl.style.display = state.clock.mode === 'master' ? 'block' : 'none';
    }

    if (transport) {
        transport.style.display = state.clock.mode === 'master' ? 'flex' : 'none';
    }
}

/**
 * Update clock status indicator
 */
function updateClockStatus(status) {
    const element = document.getElementById('clock-status');
    if (!element) return;

    element.className = 'status ' + status;

    switch (status) {
        case 'playing':
            element.textContent = 'Clock: Playing';
            break;
        case 'stopped':
            element.textContent = 'Clock: Stopped';
            break;
        case 'synced':
            element.textContent = 'Clock: Synced';
            break;
        case 'lost':
            element.textContent = 'Clock: Lost';
            break;
        case 'disconnected':
        default:
            element.textContent = 'Clock: Disconnected';
    }
}

/**
 * Update transport button states
 */
function updateTransportButtons(isPlaying) {
    const startBtn = document.getElementById('start-button');
    const stopBtn = document.getElementById('stop-button');

    if (startBtn) {
        startBtn.disabled = isPlaying;
        startBtn.classList.toggle('active', isPlaying);
    }

    if (stopBtn) {
        stopBtn.disabled = !isPlaying;
    }
}

// ============================================================================
// Variation Controls
// ============================================================================

/**
 * Bind variation control elements
 */
function bindVariationControls(state) {
    const harmonicSlider = document.getElementById('harmonic-variation');
    const rhythmicSlider = document.getElementById('rhythmic-variation');
    const voiceButtons = document.querySelectorAll('.voice-btn');

    if (harmonicSlider) {
        harmonicSlider.value = state.harmonicVariation;
        document.getElementById('harmonic-value').textContent =
            state.harmonicVariation.toFixed(2);

        harmonicSlider.addEventListener('input', (e) => {
            state.harmonicVariation = parseFloat(e.target.value);
            document.getElementById('harmonic-value').textContent =
                state.harmonicVariation.toFixed(2);
        });
    }

    if (rhythmicSlider) {
        rhythmicSlider.value = state.rhythmicVariation;
        document.getElementById('rhythmic-value').textContent =
            state.rhythmicVariation.toFixed(2);

        rhythmicSlider.addEventListener('input', (e) => {
            state.rhythmicVariation = parseFloat(e.target.value);
            document.getElementById('rhythmic-value').textContent =
                state.rhythmicVariation.toFixed(2);
        });
    }

    voiceButtons.forEach(btn => {
        if (btn.dataset.value === state.voiceLeading) {
            btn.classList.add('active');
        }

        btn.addEventListener('click', () => {
            voiceButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.voiceLeading = btn.dataset.value;
        });
    });
}

// ============================================================================
// Output Controls (Velocity/Gate)
// ============================================================================

/**
 * Bind output control elements
 */
function bindOutputControls(state) {
    const velocityMode = document.getElementById('velocity-mode');
    const gateMode = document.getElementById('gate-mode');

    if (velocityMode) {
        velocityMode.value = state.velocity.mode;

        velocityMode.addEventListener('change', (e) => {
            state.velocity.mode = e.target.value;
            renderVelocityControls(state);
        });
    }

    if (gateMode) {
        gateMode.value = state.gate.mode;

        gateMode.addEventListener('change', (e) => {
            state.gate.mode = e.target.value;
            renderGateControls(state);
        });
    }
}

/**
 * Render velocity controls based on mode
 */
function renderVelocityControls(state) {
    const container = document.getElementById('velocity-controls');
    if (!container) return;

    container.innerHTML = '';

    switch (state.velocity.mode) {
        case 'fixed':
            container.innerHTML = `
                <label>
                    Velocity: <span id="velocity-fixed-value">${state.velocity.fixed}</span>
                    <input type="range" id="velocity-fixed" min="1" max="127" value="${state.velocity.fixed}">
                </label>
            `;
            document.getElementById('velocity-fixed').addEventListener('input', (e) => {
                state.velocity.fixed = parseInt(e.target.value);
                document.getElementById('velocity-fixed-value').textContent = state.velocity.fixed;
            });
            break;

        case 'random':
            container.innerHTML = `
                <label>
                    Min: <span id="velocity-min-value">${state.velocity.randomMin}</span>
                    <input type="range" id="velocity-min" min="1" max="127" value="${state.velocity.randomMin}">
                </label>
                <label>
                    Max: <span id="velocity-max-value">${state.velocity.randomMax}</span>
                    <input type="range" id="velocity-max" min="1" max="127" value="${state.velocity.randomMax}">
                </label>
            `;
            document.getElementById('velocity-min').addEventListener('input', (e) => {
                state.velocity.randomMin = parseInt(e.target.value);
                document.getElementById('velocity-min-value').textContent = state.velocity.randomMin;
            });
            document.getElementById('velocity-max').addEventListener('input', (e) => {
                state.velocity.randomMax = parseInt(e.target.value);
                document.getElementById('velocity-max-value').textContent = state.velocity.randomMax;
            });
            break;

        case 'curve':
            container.innerHTML = `
                <label>
                    Curve Type:
                    <select id="velocity-curve-type">
                        <option value="linear-ascending">Linear Ascending</option>
                        <option value="linear-descending">Linear Descending</option>
                        <option value="exponential">Exponential</option>
                        <option value="logarithmic">Logarithmic</option>
                        <option value="sinusoidal">Sinusoidal</option>
                        <option value="triangle">Triangle</option>
                    </select>
                </label>
                <label>
                    Min: <span id="velocity-curve-min-value">${state.velocity.curveMin}</span>
                    <input type="range" id="velocity-curve-min" min="1" max="127" value="${state.velocity.curveMin}">
                </label>
                <label>
                    Max: <span id="velocity-curve-max-value">${state.velocity.curveMax}</span>
                    <input type="range" id="velocity-curve-max" min="1" max="127" value="${state.velocity.curveMax}">
                </label>
            `;
            document.getElementById('velocity-curve-type').value = state.velocity.curveType;
            document.getElementById('velocity-curve-type').addEventListener('change', (e) => {
                state.velocity.curveType = e.target.value;
            });
            document.getElementById('velocity-curve-min').addEventListener('input', (e) => {
                state.velocity.curveMin = parseInt(e.target.value);
                document.getElementById('velocity-curve-min-value').textContent = state.velocity.curveMin;
            });
            document.getElementById('velocity-curve-max').addEventListener('input', (e) => {
                state.velocity.curveMax = parseInt(e.target.value);
                document.getElementById('velocity-curve-max-value').textContent = state.velocity.curveMax;
            });
            break;
    }
}

/**
 * Render gate controls based on mode
 */
function renderGateControls(state) {
    const container = document.getElementById('gate-controls');
    if (!container) return;

    container.innerHTML = '';

    const toPercent = (val) => (val * 100).toFixed(0) + '%';

    switch (state.gate.mode) {
        case 'fixed':
            container.innerHTML = `
                <label>
                    Gate: <span id="gate-fixed-value">${toPercent(state.gate.fixed)}</span>
                    <input type="range" id="gate-fixed" min="0.05" max="1" step="0.01" value="${state.gate.fixed}">
                </label>
            `;
            document.getElementById('gate-fixed').addEventListener('input', (e) => {
                state.gate.fixed = parseFloat(e.target.value);
                document.getElementById('gate-fixed-value').textContent = toPercent(state.gate.fixed);
            });
            break;

        case 'random':
            container.innerHTML = `
                <label>
                    Min: <span id="gate-min-value">${toPercent(state.gate.randomMin)}</span>
                    <input type="range" id="gate-min" min="0.05" max="1" step="0.01" value="${state.gate.randomMin}">
                </label>
                <label>
                    Max: <span id="gate-max-value">${toPercent(state.gate.randomMax)}</span>
                    <input type="range" id="gate-max" min="0.05" max="1" step="0.01" value="${state.gate.randomMax}">
                </label>
            `;
            document.getElementById('gate-min').addEventListener('input', (e) => {
                state.gate.randomMin = parseFloat(e.target.value);
                document.getElementById('gate-min-value').textContent = toPercent(state.gate.randomMin);
            });
            document.getElementById('gate-max').addEventListener('input', (e) => {
                state.gate.randomMax = parseFloat(e.target.value);
                document.getElementById('gate-max-value').textContent = toPercent(state.gate.randomMax);
            });
            break;

        case 'curve':
            container.innerHTML = `
                <label>
                    Curve Type:
                    <select id="gate-curve-type">
                        <option value="linear-ascending">Linear Ascending</option>
                        <option value="linear-descending">Linear Descending</option>
                        <option value="exponential">Exponential</option>
                        <option value="logarithmic">Logarithmic</option>
                        <option value="sinusoidal">Sinusoidal</option>
                        <option value="triangle">Triangle</option>
                    </select>
                </label>
                <label>
                    Min: <span id="gate-curve-min-value">${toPercent(state.gate.curveMin)}</span>
                    <input type="range" id="gate-curve-min" min="0.05" max="1" step="0.01" value="${state.gate.curveMin}">
                </label>
                <label>
                    Max: <span id="gate-curve-max-value">${toPercent(state.gate.curveMax)}</span>
                    <input type="range" id="gate-curve-max" min="0.05" max="1" step="0.01" value="${state.gate.curveMax}">
                </label>
            `;
            document.getElementById('gate-curve-type').value = state.gate.curveType;
            document.getElementById('gate-curve-type').addEventListener('change', (e) => {
                state.gate.curveType = e.target.value;
            });
            document.getElementById('gate-curve-min').addEventListener('input', (e) => {
                state.gate.curveMin = parseFloat(e.target.value);
                document.getElementById('gate-curve-min-value').textContent = toPercent(state.gate.curveMin);
            });
            document.getElementById('gate-curve-max').addEventListener('input', (e) => {
                state.gate.curveMax = parseFloat(e.target.value);
                document.getElementById('gate-curve-max-value').textContent = toPercent(state.gate.curveMax);
            });
            break;
    }
}

// ============================================================================
// Chord Progression Controls
// ============================================================================

/**
 * Bind chord progression control elements
 */
function bindChordProgressionControls(state, callbacks) {
    const loadBtn = document.getElementById('load-chords');
    const chordInput = document.getElementById('chord-input');

    if (loadBtn && chordInput) {
        // Set initial value
        chordInput.value = JSON.stringify(state.chordProgression);

        loadBtn.addEventListener('click', () => {
            try {
                const chords = JSON.parse(chordInput.value);
                if (validateChordProgression(chords)) {
                    state.chordProgression = chords;
                    state.currentChordIndex = 0;
                    updatePadDisplay(state);
                    updateChordStatus(state);
                    showNotification('Chord progression loaded successfully', 'success');
                    callbacks?.onChordsChange?.(state);
                } else {
                    showNotification('Invalid chord format. Expected: [[60,64,67],[57,60,64],...]', 'error');
                }
            } catch (e) {
                showNotification('JSON parsing error: ' + e.message, 'error');
            }
        });
    }

    createPadGrid(state);
}

/**
 * Validate chord progression data structure
 */
function validateChordProgression(data) {
    if (!Array.isArray(data)) return false;
    if (data.length === 0) return false;

    for (const chord of data) {
        if (!Array.isArray(chord)) return false;
        if (chord.length === 0) return false;
        for (const note of chord) {
            if (typeof note !== 'number') return false;
            if (note < 0 || note > 127) return false;
        }
    }

    return true;
}

/**
 * Create the 4x4 pad grid (MPC-style layout)
 */
function createPadGrid(state) {
    const container = document.getElementById('pad-display');
    if (!container) return;

    container.innerHTML = '';

    // Create 16 pads in MPC layout (bottom to top rows)
    for (let i = 0; i < 16; i++) {
        const pad = document.createElement('div');
        pad.className = 'pad';
        pad.dataset.index = i;

        // Click to select chord manually
        pad.addEventListener('click', () => {
            if (i < state.chordProgression.length) {
                state.currentChordIndex = i;
                updatePadDisplay(state);
                updateChordStatus(state);
            }
        });

        container.appendChild(pad);
    }

    updatePadDisplay(state);
}

/**
 * Update pad display with chord information
 */
function updatePadDisplay(state) {
    const pads = document.querySelectorAll('#pad-display .pad');
    if (!pads.length) return;

    pads.forEach((pad, index) => {
        // Clear all classes except 'pad'
        pad.className = 'pad';

        if (index < state.chordProgression.length) {
            const chord = state.chordProgression[index];
            const analysis = analyzeChord(chord);

            pad.textContent = analysis.name;
            pad.classList.add(getChordClass(analysis.type));

            if (index === state.currentChordIndex) {
                pad.classList.add('current');
            }

            pad.title = `${analysis.name} - Notes: ${chord.join(', ')}`;
        } else {
            pad.textContent = '';
            pad.classList.add('empty');
            pad.title = '';
        }
    });
}

/**
 * Update current chord status display
 */
function updateChordStatus(state) {
    const display = document.getElementById('current-chord-display');
    if (!display) return;

    const chord = state.chordProgression[state.currentChordIndex];
    const analysis = analyzeChord(chord);

    display.textContent = `${analysis.name} (${state.currentChordIndex + 1}/${state.chordProgression.length})`;
}

// ============================================================================
// MIDI Device UI
// ============================================================================

/**
 * Populate MIDI device select elements
 */
function populateMIDIDevices(inputs, outputs) {
    const inputSelect = document.getElementById('midi-input');
    const outputSelect = document.getElementById('midi-output');

    if (inputSelect) {
        // Preserve first option
        const firstOption = inputSelect.firstElementChild;
        inputSelect.innerHTML = '';
        inputSelect.appendChild(firstOption);

        inputs.forEach(device => {
            const option = document.createElement('option');
            option.value = device.id;
            option.textContent = device.name;
            inputSelect.appendChild(option);
        });
    }

    if (outputSelect) {
        // Preserve first option
        const firstOption = outputSelect.firstElementChild;
        outputSelect.innerHTML = '';
        outputSelect.appendChild(firstOption);

        outputs.forEach(device => {
            const option = document.createElement('option');
            option.value = device.id;
            option.textContent = device.name;
            outputSelect.appendChild(option);
        });
    }
}

/**
 * Bind MIDI device selection handlers
 */
function bindMIDIDeviceSelectors(callbacks) {
    const inputSelect = document.getElementById('midi-input');
    const outputSelect = document.getElementById('midi-output');

    if (inputSelect) {
        inputSelect.addEventListener('change', (e) => {
            callbacks?.onInputSelect?.(e.target.value);
        });
    }

    if (outputSelect) {
        outputSelect.addEventListener('change', (e) => {
            callbacks?.onOutputSelect?.(e.target.value);
        });
    }
}

// ============================================================================
// Keyboard Visualization (Recycled from AkaiMPC)
// ============================================================================

/**
 * Generate keyboard SVG for chord visualization
 * Adapted from AkaiMPC Chord Progression Generator rendering.js
 *
 * @param {number[]} notes - MIDI note numbers
 * @returns {string} - SVG markup
 */
function generateKeyboardSVG(notes) {
    if (!notes || notes.length === 0) return '';

    // Determine octave range to display
    const minNote = Math.min(...notes);
    const startOctave = Math.floor(minNote / 12);
    const startNote = startOctave * 12;

    const activeNotes = new Set(notes);

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
// Notifications
// ============================================================================

/**
 * Show a notification message
 */
function showNotification(message, type = 'info') {
    // Remove existing notification
    const existing = document.querySelector('.notification');
    if (existing) {
        existing.remove();
    }

    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;

    document.body.appendChild(notification);

    // Auto-remove after delay
    setTimeout(() => {
        notification.classList.add('fade-out');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// ============================================================================
// Exports
// ============================================================================

export {
    initializeUI,

    // Pattern
    regeneratePattern,
    updatePatternDisplay,
    highlightCurrentStep,

    // Timing
    updateClockModeDisplay,
    updateClockStatus,
    updateTransportButtons,

    // Output
    renderVelocityControls,
    renderGateControls,

    // Chords
    updatePadDisplay,
    updateChordStatus,
    createPadGrid,
    validateChordProgression,

    // MIDI
    populateMIDIDevices,
    bindMIDIDeviceSelectors,

    // Visualization
    generateKeyboardSVG,

    // Utils
    showNotification
};
