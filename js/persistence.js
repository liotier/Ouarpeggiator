/**
 * Persistence - localStorage + shareable URL
 *
 * Serializes the user's configuration (generator settings, Euclidean pattern,
 * timing, playback params, velocity/gate curves, chord sequencer settings) so
 * it survives reloads (localStorage) and can be shared via a link (?c=<json>).
 *
 * Runtime/position fields (isPlaying, tickCount, chordProgression, variants,
 * currentChordIndex, ...) are deliberately NOT persisted — only the "patch".
 *
 * applySettings() only writes state + control values (no heavy re-render); the
 * caller (main.initialize) runs the normal render sequence afterwards so the
 * restored values are drawn. Loading precedence: URL > localStorage > defaults.
 */

import { appState } from './appState.js';
import ChordProgressionSequencer from './chordProgressionSequencer.js';
import * as Audio from './modules/audio.js';

const LS_KEY = 'ouarpeggiator:settings:v1';
const SCHEMA_VERSION = 1;

// --- tiny DOM helpers (all null-safe) ---
const $ = id => document.getElementById(id);
const setVal = (id, v) => { const e = $(id); if (e && v != null) e.value = v; };
const setSpan = (id, v) => { const e = $(id); if (e && v != null) e.textContent = v; };
const setChecked = (id, v) => { const e = $(id); if (e) e.checked = !!v; };
const setMax = (id, v) => { const e = $(id); if (e && v != null) e.max = v; };
const setActive = (selector, val) =>
    document.querySelectorAll(selector).forEach(b => b.classList.toggle('active', b.dataset.value === String(val)));

// ============================================================================
// Collect
// ============================================================================

export function collectSettings() {
    const s = appState;
    return {
        v: SCHEMA_VERSION,
        gm: s.generationMode,
        key: $('keySelect')?.value ?? s.key,
        mode: $('modeSelect')?.value ?? s.mode,
        prog: $('progressionSelect')?.value ?? s.progressionTemplate,
        h: s.euclidean.hits, st: s.euclidean.steps, rot: s.euclidean.rotation,
        oct: s.octaveSpread,
        bpm: s.bpm, bpc: s.barsPerChord, hum: s.humanization,
        pm: s.playbackMode,
        ha: s.harmonicAdherence, hv: s.harmonicVariation, rv: s.rhythmicVariation, vl: s.voiceLeading,
        ss: s.strumSpeed, sd: s.strumDirection,
        cse: s.chordSequencing.enabled, csl: s.chordSequencing.stepsLocked,
        csh: s.chordSequencing.euclidean.hits, css: s.chordSequencing.euclidean.steps, csr: s.chordSequencing.euclidean.rotation,
        vel: s.velocity, gate: s.gate, sync: s.curveSyncRotation,
        out: s.outputMode,
        wave: $('synthWaveform')?.value,
        sq: {
            m: ChordProgressionSequencer.method,
            pl: ChordProgressionSequencer.patternLength,
            lk: ChordProgressionSequencer.lockPattern,
            rm: ChordProgressionSequencer.rootMelodyPattern,
            cf: ChordProgressionSequencer.circleFifthsDirection,
            vlo: ChordProgressionSequencer.voiceLeadingOptimization
        }
    };
}

// ============================================================================
// Apply (defensive — every field optional)
// ============================================================================

const int = (v, d) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };
const flt = (v, d) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };

export function applySettings(s) {
    if (!s || typeof s !== 'object') return;

    // Generation inputs (read at generate time from the DOM controls)
    if (s.gm === 'template' || s.gm === 'scale') {
        appState.generationMode = s.gm;
        setChecked('paletteModeRadio', s.gm === 'template');
        setChecked('scaleModeRadio', s.gm === 'scale');
        const pc = $('paletteModeContainer'), sc = $('scaleModeContainer');
        if (pc) pc.classList.toggle('active', s.gm === 'template');
        if (sc) sc.classList.toggle('active', s.gm === 'scale');
    }
    if (s.key != null) { appState.key = int(s.key, appState.key); setVal('keySelect', s.key); }
    if (s.mode != null) { appState.mode = s.mode; setVal('modeSelect', s.mode); }
    if (s.prog != null) { appState.progressionTemplate = s.prog; setVal('progressionSelect', s.prog); }

    // Euclidean pattern
    if (s.st != null) {
        appState.euclidean.steps = int(s.st, appState.euclidean.steps);
        setVal('stepsSlider', appState.euclidean.steps); setSpan('stepsValue', appState.euclidean.steps);
        setMax('hitsSlider', appState.euclidean.steps);
        setMax('rotationSlider', appState.euclidean.steps - 1);
    }
    if (s.h != null) { appState.euclidean.hits = int(s.h, appState.euclidean.hits); setVal('hitsSlider', appState.euclidean.hits); setSpan('hitsValue', appState.euclidean.hits); }
    if (s.rot != null) { appState.euclidean.rotation = int(s.rot, appState.euclidean.rotation); setVal('rotationSlider', appState.euclidean.rotation); setSpan('rotationValue', appState.euclidean.rotation); }
    if (s.oct != null) { appState.octaveSpread = int(s.oct, appState.octaveSpread); setVal('octaveSpread', appState.octaveSpread); setSpan('octaveValue', appState.octaveSpread); }

    // Timing
    if (s.bpm != null) { appState.bpm = int(s.bpm, appState.bpm); setVal('bpmSlider', appState.bpm); setSpan('bpmValue', appState.bpm); }
    if (s.bpc != null) { appState.barsPerChord = int(s.bpc, appState.barsPerChord); setActive('.bars-btn', appState.barsPerChord); }
    if (s.hum != null) { appState.humanization = int(s.hum, appState.humanization); setVal('humanization', appState.humanization); setSpan('humanizationValue', appState.humanization); }

    // Playback mode
    if (s.pm === 'arpeggio' || s.pm === 'stab') {
        appState.playbackMode = s.pm;
        setChecked('arpeggioModeRadio', s.pm === 'arpeggio');
        setChecked('stabModeRadio', s.pm === 'stab');
    }

    // Variation
    if (s.ha != null) { appState.harmonicAdherence = int(s.ha, appState.harmonicAdherence); setVal('harmonicAdherence', appState.harmonicAdherence); setSpan('harmonicAdherenceValue', appState.harmonicAdherence + '%'); }
    if (s.hv != null) { appState.harmonicVariation = int(s.hv, appState.harmonicVariation); setVal('harmonicVariation', appState.harmonicVariation); setSpan('harmonicValue', appState.harmonicVariation + '%'); }
    if (s.rv != null) { appState.rhythmicVariation = int(s.rv, appState.rhythmicVariation); setVal('rhythmicVariation', appState.rhythmicVariation); setSpan('rhythmicValue', appState.rhythmicVariation + '%'); }
    if (s.vl != null) { appState.voiceLeading = s.vl; setActive('.voice-btn', s.vl); }

    // Stab / strum
    if (s.ss != null) { appState.strumSpeed = int(s.ss, appState.strumSpeed); setVal('strumSpeed', appState.strumSpeed); setSpan('strumSpeedValue', appState.strumSpeed); }
    if (s.sd != null) { appState.strumDirection = s.sd; setActive('.strum-btn', s.sd); }

    // Chord sequencing (stab mode)
    if (s.cse != null) appState.chordSequencing.enabled = !!s.cse;
    if (s.csl != null) {
        appState.chordSequencing.stepsLocked = !!s.csl;
        setChecked('unlockChordSteps', !s.csl);
        const cont = $('chordStepsSliderContainer');
        if (cont) cont.style.display = s.csl ? 'none' : 'block';
    }
    if (s.css != null) { appState.chordSequencing.euclidean.steps = int(s.css, appState.chordSequencing.euclidean.steps); setVal('chordChangeSteps', appState.chordSequencing.euclidean.steps); setSpan('chordChangeStepsValue', appState.chordSequencing.euclidean.steps); }
    if (s.csh != null) { appState.chordSequencing.euclidean.hits = int(s.csh, appState.chordSequencing.euclidean.hits); setVal('chordChangePulses', appState.chordSequencing.euclidean.hits); setSpan('chordChangePulsesValue', appState.chordSequencing.euclidean.hits); }
    if (s.csr != null) { appState.chordSequencing.euclidean.rotation = int(s.csr, appState.chordSequencing.euclidean.rotation); setVal('chordChangeRotation', appState.chordSequencing.euclidean.rotation); setSpan('chordChangeRotationValue', appState.chordSequencing.euclidean.rotation); }

    // Velocity / gate (objects) — merge so unknown fields keep defaults
    if (s.vel && typeof s.vel === 'object') { Object.assign(appState.velocity, s.vel); setVal('velocityMode', appState.velocity.mode); }
    if (s.gate && typeof s.gate === 'object') { Object.assign(appState.gate, s.gate); setVal('gateMode', appState.gate.mode); }
    if (s.sync != null) { appState.curveSyncRotation = !!s.sync; setChecked('curveSyncRotation', appState.curveSyncRotation); }

    // Output + waveform
    if (s.out != null) appState.outputMode = s.out;  // select restored post-MIDI (see restoreOutputSelection)
    if (s.wave != null) { setVal('synthWaveform', s.wave); Audio.setWaveform(s.wave); }

    // Chord progression sequencer settings
    if (s.sq && typeof s.sq === 'object') {
        const q = s.sq;
        if (q.m != null) { ChordProgressionSequencer.method = q.m; setVal('sequenceMethod', q.m); }
        if (q.pl != null) { ChordProgressionSequencer.patternLength = int(q.pl, ChordProgressionSequencer.patternLength); setVal('patternLength', ChordProgressionSequencer.patternLength); setSpan('patternLengthValue', ChordProgressionSequencer.patternLength); }
        if (q.lk != null) { ChordProgressionSequencer.lockPattern = !!q.lk; setChecked('lockPattern', q.lk); }
        if (q.rm != null) ChordProgressionSequencer.rootMelodyPattern = q.rm;
        if (q.cf != null) ChordProgressionSequencer.circleFifthsDirection = q.cf;
        if (q.vlo != null) ChordProgressionSequencer.voiceLeadingOptimization = q.vlo;
    }
}

/**
 * Restore the output-device selector after MIDI devices have been populated
 * (the juno106 / midi:* options don't exist until then).
 */
export function restoreOutputSelection() {
    const sel = $('outputMode');
    if (!sel) return;
    if ([...sel.options].some(o => o.value === appState.outputMode)) {
        sel.value = appState.outputMode;
    }
    const audioConfig = $('audioConfig');
    if (audioConfig) audioConfig.style.display = appState.outputMode === 'audio' ? 'block' : 'none';
}

// ============================================================================
// Load / save
// ============================================================================

function safeParse(json) {
    try { return json ? JSON.parse(json) : null; } catch { return null; }
}

export function loadSettings() {
    // URL takes precedence (shared link), then localStorage.
    try {
        const c = new URLSearchParams(location.search).get('c');
        const fromUrl = safeParse(c);
        if (fromUrl) return fromUrl;
    } catch { /* ignore */ }
    try {
        return safeParse(localStorage.getItem(LS_KEY));
    } catch { return null; }
}

function saveNow() {
    const settings = collectSettings();
    try { localStorage.setItem(LS_KEY, JSON.stringify(settings)); } catch { /* quota / privacy mode */ }
    try {
        const p = new URLSearchParams();
        p.set('c', JSON.stringify(settings));
        history.replaceState(null, '', location.pathname + '?' + p.toString() + location.hash);
    } catch { /* ignore */ }
}

let saveTimer = null;
function schedulePersist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 400);
}

/**
 * Wire up autosave: any control interaction (input/change/click) debounce-saves
 * the current settings to localStorage + URL. Also flushes on page hide.
 */
export function startAutosave() {
    ['input', 'change', 'click'].forEach(evt => document.addEventListener(evt, schedulePersist, true));
    window.addEventListener('beforeunload', saveNow);
    saveNow();  // reflect restored/default state in the URL immediately
}
