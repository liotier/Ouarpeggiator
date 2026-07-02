/**
 * UI Bindings & Control Rendering
 *
 * Wires up all DOM controls (sliders, buttons, selects) to appState + transport,
 * and renders the dynamic control panels (velocity/gate, sequence method,
 * chord-change circle, playback-mode UI). This is the top of the UI layer:
 * nothing imports it except main.js and (for view-update callbacks) transport.js.
 */

import { appState } from './appState.js';
import { euclidean, rotatePattern } from './euclidean.js';
import * as MIDI from './midi.js';
import * as Audio from './modules/audio.js';
import * as PianoRoll from './pianoRoll.js';
import * as EuclideanCircle from './euclideanCircle.js';
import ChordProgressionSequencer from './chordProgressionSequencer.js';
import { generateProgression, switchVariant, triggerSparkle } from './chordProgression.js';
import { switchGenerationMode } from './chordMatcher.js';
import {
    startPlayback,
    stopPlayback,
    regeneratePattern,
    syncWorkerParam,
    syncSequencerSettings,
    launchJuno106,
    clearJunoStatus,
    noteSchedulerWorker,
    useBroadcastChannel
} from './transport.js';

/**
 * Activate one button in a radiogroup-style button cluster (strum direction,
 * voice leading, bars-per-chord): toggles .active and keeps aria-checked in
 * sync so screen readers announce the current selection correctly.
 */
function setActiveRadioButton(groupSelector, activeBtn) {
    document.querySelectorAll(groupSelector).forEach(b => {
        const isActive = b === activeBtn;
        b.classList.toggle('active', isActive);
        b.setAttribute('aria-checked', String(isActive));
    });
}

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
        appState.key = Number.parseInt(this.value);
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
        switchVariant(Number.parseInt(this.value));
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
            clearJunoStatus();
        } else if (value.startsWith('midi:')) {
            // MIDI device selected
            const deviceId = value.substring(5);
            appState.outputMode = 'midi';
            MIDI.selectOutputDevice(deviceId);
            audioConfig.style.display = 'none';
            clearJunoStatus();
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
        appState.euclidean.hits = Number.parseInt(this.value);
        document.getElementById('hitsValue').textContent = this.value;
        regeneratePattern();
        regenerateChordChangePattern();
    });

    document.getElementById('stepsSlider').addEventListener('input', function() {
        appState.euclidean.steps = Number.parseInt(this.value);
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
        appState.euclidean.rotation = Number.parseInt(this.value);
        document.getElementById('rotationValue').textContent = this.value;
        regeneratePattern();
    });

    document.getElementById('octaveSpread').addEventListener('input', function() {
        appState.octaveSpread = Number.parseInt(this.value);
        document.getElementById('octaveValue').textContent = this.value;
        // Update piano roll pitch range if initialized
        if (appState.pianoRollInitialized) {
            PianoRoll.setOctaveSpread(appState.octaveSpread);
        }
        syncWorkerParam({ octaveSpread: appState.octaveSpread });
    });

    // Arpeggio note order (up/down/updown/... — applied per step in the core)
    document.getElementById('noteOrder').addEventListener('change', function() {
        appState.arpNoteOrder = this.value;
        syncWorkerParam({ arpNoteOrder: appState.arpNoteOrder });
    });

    // Free-running polymeter: read live by the core each tick (no restart), just
    // keep the worker's copy in sync for the Juno-106 path.
    document.getElementById('freeRunning').addEventListener('change', function() {
        appState.freeRunning = this.checked;
        syncWorkerParam({ freeRunning: appState.freeRunning });
    });

    // Timing
    document.getElementById('bpmSlider').addEventListener('input', function() {
        appState.bpm = Number.parseInt(this.value);
        document.getElementById('bpmValue').textContent = this.value;

        // Update piano roll BPM
        PianoRoll.setBPM(appState.bpm);

        if (appState.isPlaying) {
            if (noteSchedulerWorker && useBroadcastChannel) {
                // Worker recomputes tempo each tick — update live, no restart glitch
                syncWorkerParam({ bpm: appState.bpm });
            } else {
                // Main-thread clock tempo is fixed at start; restart to apply
                stopPlayback();
                startPlayback();
            }
        }
    });

    // Live transpose (whole octaves). Applied per-note in sequencerCore, so no
    // restart is needed in either playback path — just keep the worker's copy
    // of the value in sync.
    document.getElementById('transposeSlider').addEventListener('input', function() {
        appState.transposeOctaves = Number.parseInt(this.value);
        const v = appState.transposeOctaves;
        document.getElementById('transposeValue').textContent = v > 0 ? `+${v}` : String(v);
        syncWorkerParam({ transposeOctaves: appState.transposeOctaves });
    });

    document.querySelectorAll('.bars-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            setActiveRadioButton('.bars-btn', this);
            appState.barsPerChord = Number.parseInt(this.dataset.value);
            syncWorkerParam({ barsPerChord: appState.barsPerChord });
        });
    });

    document.getElementById('swing').addEventListener('input', function() {
        appState.swing = Number.parseInt(this.value);
        document.getElementById('swingValue').textContent = this.value;
        syncWorkerParam({ swing: appState.swing });
    });

    document.getElementById('humanization').addEventListener('input', function() {
        appState.humanization = Number.parseInt(this.value);
        document.getElementById('humanizationValue').textContent = this.value;
        syncWorkerParam({ humanization: appState.humanization });
    });

    // Transport
    document.getElementById('startBtn').addEventListener('click', startPlayback);
    document.getElementById('stopBtn').addEventListener('click', stopPlayback);

    // Panic: stopPlayback() already flushes MIDI (per-note off + broadcast All
    // Notes Off CC123), Audio, and Juno-106 unconditionally — safe to call even
    // when not currently playing, so it doubles as a general all-notes-off.
    document.getElementById('panicBtn').addEventListener('click', stopPlayback);

    // Playback Mode Toggle (Arpeggio/Chord Stab)
    document.getElementById('arpeggioModeRadio').addEventListener('change', function() {
        if (this.checked) {
            appState.playbackMode = 'arpeggio';
            updatePlaybackModeUI();
            syncWorkerParam({ playbackMode: appState.playbackMode });
        }
    });

    document.getElementById('stabModeRadio').addEventListener('change', function() {
        if (this.checked) {
            appState.playbackMode = 'stab';
            updatePlaybackModeUI();
            syncWorkerParam({ playbackMode: appState.playbackMode });
        }
    });

    // Chord Order — harmonic wander vs play the progression in order
    document.querySelectorAll('.chord-order-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            setActiveRadioButton('.chord-order-btn', this);
            appState.chordOrderMode = this.dataset.value;
            syncWorkerParam({ chordOrderMode: appState.chordOrderMode });
        });
    });

    // Chord Variation - Harmonic Adherence
    document.getElementById('harmonicAdherence').addEventListener('input', function() {
        appState.harmonicAdherence = Number.parseInt(this.value);
        document.getElementById('harmonicAdherenceValue').textContent = this.value + '%';
        syncWorkerParam({ harmonicAdherence: appState.harmonicAdherence });
    });

    // Note Variation
    document.getElementById('harmonicVariation').addEventListener('input', function() {
        appState.harmonicVariation = Number.parseInt(this.value);
        document.getElementById('harmonicValue').textContent = this.value + '%';
        syncWorkerParam({ harmonicVariation: appState.harmonicVariation });
    });

    // Strum controls (for Chord Stab mode)
    document.getElementById('strumSpeed')?.addEventListener('input', function() {
        appState.strumSpeed = Number.parseInt(this.value);
        document.getElementById('strumSpeedValue').textContent = this.value;
        syncWorkerParam({ strumSpeed: appState.strumSpeed });
    });

    document.querySelectorAll('.strum-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            setActiveRadioButton('.strum-btn', this);
            appState.strumDirection = this.dataset.value;
            syncWorkerParam({ strumDirection: appState.strumDirection });
        });
    });

    document.getElementById('rhythmicVariation').addEventListener('input', function() {
        appState.rhythmicVariation = Number.parseInt(this.value);
        document.getElementById('rhythmicValue').textContent = this.value + '%';
        syncWorkerParam({ rhythmicVariation: appState.rhythmicVariation });
    });

    document.querySelectorAll('.voice-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            setActiveRadioButton('.voice-btn', this);
            appState.voiceLeading = this.dataset.value;
            // Now consumed by the bar-based chord advance (sequencerCore) — keep
            // the worker's copy in sync so the Juno-106 path honors it too.
            syncWorkerParam({ voiceLeading: appState.voiceLeading });
        });
    });

    // Velocity/Gate modes
    document.getElementById('velocityMode').addEventListener('change', function() {
        appState.velocity.mode = this.value;
        renderVelocityControls();
        syncWorkerParam({ velocity: appState.velocity });
    });

    document.getElementById('gateMode').addEventListener('change', function() {
        appState.gate.mode = this.value;
        renderGateControls();
        syncWorkerParam({ gate: appState.gate });
    });

    // Delegated sync for the dynamically-rendered velocity/gate sub-controls.
    // These containers persist across innerHTML re-renders, so a listener added
    // once here catches every inner slider/select change (which mutate
    // appState.velocity/appState.gate in place) and pushes them to the worker.
    ['input', 'change'].forEach(evt => {
        document.getElementById('velocityControls').addEventListener(evt, function() {
            syncWorkerParam({ velocity: appState.velocity });
        });
        document.getElementById('gateControls').addEventListener(evt, function() {
            syncWorkerParam({ gate: appState.gate });
        });
    });

    // Curve rotation sync
    document.getElementById('curveSyncRotation').addEventListener('change', function() {
        appState.curveSyncRotation = this.checked;
        syncWorkerParam({ curveSyncRotation: appState.curveSyncRotation });
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
            appState.chordSequencing.euclidean.steps = Number.parseInt(this.value);
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
            appState.chordSequencing.euclidean.hits = Number.parseInt(this.value);
            pulsesValue.textContent = this.value;
            regenerateChordChangePattern();
            renderChordChangeCircle();
        });
    }

    if (rotationSlider) {
        rotationSlider.addEventListener('input', function() {
            appState.chordSequencing.euclidean.rotation = Number.parseInt(this.value);
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
            syncSequencerSettings();
        });
    }

    // Pattern length
    const lengthSlider = document.getElementById('patternLength');
    const lengthValue = document.getElementById('patternLengthValue');
    if (lengthSlider) {
        lengthSlider.addEventListener('input', function() {
            ChordProgressionSequencer.patternLength = Number.parseInt(this.value);
            lengthValue.textContent = this.value;
            if (!ChordProgressionSequencer.lockPattern) {
                updateProgressionPreview();
            }
            syncSequencerSettings();
        });
    }

    // Lock pattern checkbox
    const lockCheckbox = document.getElementById('lockPattern');
    if (lockCheckbox) {
        lockCheckbox.addEventListener('change', function() {
            ChordProgressionSequencer.lockPattern = this.checked;
            syncSequencerSettings();
        });
    }

    // Regenerate button
    const regenerateBtn = document.getElementById('regeneratePattern');
    if (regenerateBtn) {
        regenerateBtn.addEventListener('click', function() {
            ChordProgressionSequencer.regenerate(appState.chordProgression);
            updateProgressionPreview();
            if (appState.isPlaying && noteSchedulerWorker && useBroadcastChannel) {
                noteSchedulerWorker.postMessage({ type: 'regenerateSequencer' });
            }
        });
    }

    // Initial render of method-specific controls
    renderSequenceMethodControls();
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
    // Push the up-to-date chord sequencing struct (including freshly computed
    // pattern) to the worker for live update during playback.
    syncWorkerParam({ chordSequencing: appState.chordSequencing });
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
            syncSequencerSettings();
        });
    }

    const circleFifthsSelect = document.getElementById('circleFifthsDirection');
    if (circleFifthsSelect) {
        circleFifthsSelect.addEventListener('change', function() {
            ChordProgressionSequencer.circleFifthsDirection = this.value;
            updateProgressionPreview();
            syncSequencerSettings();
        });
    }

    const voiceLeadingSelect = document.getElementById('voiceLeadingOptimization');
    if (voiceLeadingSelect) {
        voiceLeadingSelect.addEventListener('change', function() {
            ChordProgressionSequencer.voiceLeadingOptimization = this.value;
            updateProgressionPreview();
            syncSequencerSettings();
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
    // Note Order arpeggiates a chord's tones one per step — meaningless in stab
    // mode (which plays all tones at once, ordered by Strum Direction instead).
    const noteOrderGroup = document.getElementById('noteOrderGroup');

    if (appState.playbackMode === 'stab') {
        // Chord Stab mode: show strum controls, disable note-level variation, show chord progression
        noteVariationSection?.classList.add('disabled');
        if (stabControls) stabControls.style.display = 'flex';
        if (noteOrderGroup) noteOrderGroup.style.display = 'none';
        // Octave spread now works in stab mode! (spreads chord across octaves)
        if (octaveSpreadGroup) octaveSpreadGroup.style.opacity = '1';
        if (chordProgressionSection) chordProgressionSection.style.display = 'block';
        // Show chord rhythm controls next to the circle!
        if (chordRhythmControls) chordRhythmControls.style.display = 'block';

        // Update main circle to show chord rhythm
        renderChordChangeCircle();
    } else {
        // Arpeggio mode: hide strum controls, enable note-level variation, hide chord progression
        noteVariationSection?.classList.remove('disabled');
        if (stabControls) stabControls.style.display = 'none';
        if (noteOrderGroup) noteOrderGroup.style.display = '';
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
            appState.velocity.fixed = Number.parseInt(this.value);
            document.getElementById('velFixedValue').textContent = this.value;
        });
    } else if (appState.velocity.mode === 'random') {
        container.innerHTML = `
            <label>Min: ${appState.velocity.randomMin} <input type="range" min="1" max="127" value="${appState.velocity.randomMin}" id="velMin"></label>
            <label>Max: ${appState.velocity.randomMax} <input type="range" min="1" max="127" value="${appState.velocity.randomMax}" id="velMax"></label>
        `;
        document.getElementById('velMin')?.addEventListener('input', function() {
            appState.velocity.randomMin = Number.parseInt(this.value);
        });
        document.getElementById('velMax')?.addEventListener('input', function() {
            appState.velocity.randomMax = Number.parseInt(this.value);
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
            appState.velocity.curveMin = Number.parseInt(this.value);
            document.getElementById('velocityCurveMinValue').textContent = this.value;
        });
        document.getElementById('velocityCurveMax')?.addEventListener('input', function() {
            appState.velocity.curveMax = Number.parseInt(this.value);
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
            appState.gate.fixed = Number.parseFloat(this.value);
            document.getElementById('gateFixedValue').textContent = toPercent(appState.gate.fixed);
        });
    } else if (appState.gate.mode === 'random') {
        container.innerHTML = `
            <label>Min: ${toPercent(appState.gate.randomMin)} <input type="range" min="0.1" max="1" step="0.05" value="${appState.gate.randomMin}" id="gateMin"></label>
            <label>Max: ${toPercent(appState.gate.randomMax)} <input type="range" min="0.1" max="1" step="0.05" value="${appState.gate.randomMax}" id="gateMax"></label>
        `;
        document.getElementById('gateMin')?.addEventListener('input', function() {
            appState.gate.randomMin = Number.parseFloat(this.value);
        });
        document.getElementById('gateMax')?.addEventListener('input', function() {
            appState.gate.randomMax = Number.parseFloat(this.value);
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
            appState.gate.curveMin = Number.parseFloat(this.value);
            document.getElementById('gateCurveMinValue').textContent = toPercent(appState.gate.curveMin);
        });
        document.getElementById('gateCurveMax')?.addEventListener('input', function() {
            appState.gate.curveMax = Number.parseFloat(this.value);
            document.getElementById('gateCurveMaxValue').textContent = toPercent(appState.gate.curveMax);
        });
    }
}


export {
    bindControls,
    bindChordProgressionControls,
    regenerateChordChangePattern,
    renderChordChangeCircle,
    renderSequenceMethodControls,
    updateProgressionPreview,
    updatePlaybackModeUI,
    renderVelocityControls,
    renderGateControls
};
