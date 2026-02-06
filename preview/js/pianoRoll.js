/**
 * Piano Roll Visualization Module
 *
 * DAW-style rolling piano roll display showing notes as they're played.
 * Features:
 * - Canvas-based for 60fps smooth scrolling
 * - Piano keyboard sidebar with current notes highlighted
 * - Bar/beat grid lines
 * - Color-coded by chord
 */

// ============================================================================
// Piano Roll State
// ============================================================================

const pianoRoll = {
    // Canvas elements
    canvas: null,
    ctx: null,
    keyboardCanvas: null,
    keyboardCtx: null,

    // Dimensions
    width: 0,
    height: 0,
    keyboardWidth: 60,

    // View settings
    pixelsPerSecond: 120,      // Scroll speed
    visibleSeconds: 6,         // Show last 6 seconds
    pixelsPerBeat: 100,        // For grid lines

    // Pitch range (auto-adjusts)
    minPitch: 36,              // C2
    maxPitch: 84,              // C6
    pitchHeight: 8,            // Pixels per semitone

    // Note buffer
    notes: [],                 // {pitch, startTime, endTime, velocity, chordIndex, color}
    currentNotes: new Set(),   // Currently playing notes

    // Timing
    currentTime: 0,
    lastFrameTime: 0,
    animationFrame: null,

    // Color palette for chords (DAW-style)
    chordColors: [
        '#3498db',  // Blue
        '#e74c3c',  // Red
        '#2ecc71',  // Green
        '#f39c12',  // Orange
        '#9b59b6',  // Purple
        '#1abc9c',  // Teal
        '#e67e22',  // Burnt Orange
        '#34495e',  // Dark Gray
        '#16a085',  // Dark Teal
        '#c0392b',  // Dark Red
        '#27ae60',  // Dark Green
        '#8e44ad',  // Dark Purple
        '#f1c40f',  // Yellow
        '#d35400',  // Dark Orange
        '#2c3e50',  // Navy
        '#7f8c8d',  // Gray
    ],

    // Settings
    bpm: 120,
    beatsPerBar: 4,
    isPlaying: false
};

// ============================================================================
// Initialization
// ============================================================================

export function initPianoRoll(containerId = 'pianoRollContainer') {
    const container = document.getElementById(containerId);
    if (!container) {
        console.error('Piano roll container not found');
        return;
    }

    // Create layout
    container.innerHTML = `
        <div class="piano-roll-wrapper">
            <canvas id="pianoRollKeyboard" class="piano-roll-keyboard"></canvas>
            <canvas id="pianoRollCanvas" class="piano-roll-canvas"></canvas>
        </div>
    `;

    // Get canvases
    pianoRoll.canvas = document.getElementById('pianoRollCanvas');
    pianoRoll.ctx = pianoRoll.canvas.getContext('2d');
    pianoRoll.keyboardCanvas = document.getElementById('pianoRollKeyboard');
    pianoRoll.keyboardCtx = pianoRoll.keyboardCanvas.getContext('2d');

    // Set up responsive sizing
    resizePianoRoll();
    window.addEventListener('resize', resizePianoRoll);

    // Start animation loop
    startAnimation();
}

function resizePianoRoll() {
    const wrapper = pianoRoll.canvas?.parentElement;
    if (!wrapper) return;

    const rect = wrapper.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    // Main canvas
    pianoRoll.width = rect.width - pianoRoll.keyboardWidth;
    pianoRoll.height = rect.height;

    pianoRoll.canvas.width = pianoRoll.width * dpr;
    pianoRoll.canvas.height = pianoRoll.height * dpr;
    pianoRoll.canvas.style.width = pianoRoll.width + 'px';
    pianoRoll.canvas.style.height = pianoRoll.height + 'px';
    pianoRoll.ctx.scale(dpr, dpr);

    // Keyboard canvas
    pianoRoll.keyboardCanvas.width = pianoRoll.keyboardWidth * dpr;
    pianoRoll.keyboardCanvas.height = pianoRoll.height * dpr;
    pianoRoll.keyboardCanvas.style.width = pianoRoll.keyboardWidth + 'px';
    pianoRoll.keyboardCanvas.style.height = pianoRoll.height + 'px';
    pianoRoll.keyboardCtx.scale(dpr, dpr);

    // Recalculate pitch height
    const pitchRange = pianoRoll.maxPitch - pianoRoll.minPitch + 1;
    pianoRoll.pitchHeight = pianoRoll.height / pitchRange;
}

// ============================================================================
// Note Management
// ============================================================================

export function addNote(note, velocity, durationMs, chordIndex = 0) {
    const noteObj = {
        pitch: note,
        startTime: pianoRoll.currentTime,
        endTime: pianoRoll.currentTime + (durationMs / 1000),
        velocity: velocity,
        chordIndex: chordIndex % pianoRoll.chordColors.length,
        color: pianoRoll.chordColors[chordIndex % pianoRoll.chordColors.length]
    };

    pianoRoll.notes.push(noteObj);
    pianoRoll.currentNotes.add(note);

    // Remove notes that have scrolled off screen
    const cutoffTime = pianoRoll.currentTime - pianoRoll.visibleSeconds;
    pianoRoll.notes = pianoRoll.notes.filter(n => n.endTime > cutoffTime);
}

export function removeNote(note) {
    pianoRoll.currentNotes.delete(note);
}

export function clearNotes() {
    pianoRoll.notes = [];
    pianoRoll.currentNotes.clear();
}

// ============================================================================
// Rendering
// ============================================================================

function startAnimation() {
    function animate(timestamp) {
        if (!pianoRoll.lastFrameTime) {
            pianoRoll.lastFrameTime = timestamp;
        }

        const deltaTime = (timestamp - pianoRoll.lastFrameTime) / 1000;
        pianoRoll.lastFrameTime = timestamp;

        if (pianoRoll.isPlaying) {
            pianoRoll.currentTime += deltaTime;
        }

        render();
        pianoRoll.animationFrame = requestAnimationFrame(animate);
    }

    pianoRoll.animationFrame = requestAnimationFrame(animate);
}

function render() {
    renderPianoRoll();
    renderKeyboard();
}

function renderPianoRoll() {
    const ctx = pianoRoll.ctx;
    const width = pianoRoll.width;
    const height = pianoRoll.height;

    // Clear with dark background (DAW-style)
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, width, height);

    // Draw grid lines
    drawGrid(ctx, width, height);

    // Draw notes
    drawNotes(ctx, width, height);

    // Draw playhead
    drawPlayhead(ctx, width, height);
}

function drawGrid(ctx, width, height) {
    const pixelsPerBeat = pianoRoll.pixelsPerBeat;
    const pixelsPerBar = pixelsPerBeat * pianoRoll.beatsPerBar;

    // Calculate grid offset based on current time
    const scrollOffset = (pianoRoll.currentTime * pianoRoll.pixelsPerSecond) % pixelsPerBar;

    // Draw bar lines (bright)
    ctx.strokeStyle = '#3a3a3a';
    ctx.lineWidth = 2;
    for (let x = width - scrollOffset; x >= 0; x -= pixelsPerBar) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
    }

    // Draw beat lines (subtle)
    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = 1;
    for (let x = width - (scrollOffset % pixelsPerBeat); x >= 0; x -= pixelsPerBeat) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
    }

    // Draw pitch lines
    ctx.strokeStyle = '#252525';
    const pitchCount = pianoRoll.maxPitch - pianoRoll.minPitch + 1;
    for (let i = 0; i <= pitchCount; i++) {
        const y = i * pianoRoll.pitchHeight;
        // Highlight octave lines (C notes)
        const pitch = pianoRoll.maxPitch - i;
        if (pitch % 12 === 0) {
            ctx.strokeStyle = '#3a3a3a';
            ctx.lineWidth = 1;
        } else {
            ctx.strokeStyle = '#252525';
            ctx.lineWidth = 1;
        }
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
    }
}

function drawNotes(ctx, width, height) {
    const currentTime = pianoRoll.currentTime;
    const pixelsPerSecond = pianoRoll.pixelsPerSecond;

    pianoRoll.notes.forEach(note => {
        // Calculate note position
        const noteStartX = width - ((currentTime - note.startTime) * pixelsPerSecond);
        const noteEndX = width - ((currentTime - note.endTime) * pixelsPerSecond);
        const noteWidth = noteEndX - noteStartX;

        // Skip if off-screen
        if (noteEndX < 0 || noteStartX > width) return;

        // Calculate Y position
        const pitchIndex = pianoRoll.maxPitch - note.pitch;
        const y = pitchIndex * pianoRoll.pitchHeight;
        const h = pianoRoll.pitchHeight - 1;

        // Clamp to visible area
        const x = Math.max(0, noteStartX);
        const w = Math.min(noteEndX, width) - x;

        // Draw note rectangle with velocity-based brightness
        const velocityFactor = note.velocity / 127;
        const brightness = 0.5 + (velocityFactor * 0.5);

        ctx.fillStyle = adjustBrightness(note.color, brightness);
        ctx.fillRect(x, y, w, h);

        // Add border for definition
        ctx.strokeStyle = adjustBrightness(note.color, brightness * 1.3);
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, w, h);
    });
}

function drawPlayhead(ctx, width, height) {
    // Playhead at right edge
    ctx.strokeStyle = '#f39c12';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(width - 1, 0);
    ctx.lineTo(width - 1, height);
    ctx.stroke();
}

function renderKeyboard() {
    const ctx = pianoRoll.keyboardCtx;
    const width = pianoRoll.keyboardWidth;
    const height = pianoRoll.height;

    // Clear
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(0, 0, width, height);

    // Piano key layout pattern (in semitones from C)
    const blackKeyPattern = [1, 3, 6, 8, 10]; // C# D# F# G# A#

    const pitchCount = pianoRoll.maxPitch - pianoRoll.minPitch + 1;
    const whiteKeyWidth = width;
    const blackKeyWidth = width * 0.6; // Black keys are 60% width of white keys

    // First pass: Draw all white keys
    for (let i = 0; i < pitchCount; i++) {
        const pitch = pianoRoll.maxPitch - i;
        const pitchClass = pitch % 12;

        // Only draw white keys in first pass
        if (blackKeyPattern.includes(pitchClass)) continue;

        const y = i * pianoRoll.pitchHeight;
        const h = pianoRoll.pitchHeight - 0.5;
        const isCurrentlyPlaying = pianoRoll.currentNotes.has(pitch);

        // White key background
        if (isCurrentlyPlaying) {
            ctx.fillStyle = '#f39c12';
        } else {
            ctx.fillStyle = '#fafafa';
        }
        ctx.fillRect(0, y, whiteKeyWidth, h);

        // White key border
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;
        ctx.strokeRect(0, y, whiteKeyWidth, h);

        // Draw note name for C notes
        if (pitchClass === 0) {
            const octave = Math.floor(pitch / 12) - 1;
            ctx.fillStyle = isCurrentlyPlaying ? '#000' : '#888';
            ctx.font = '9px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`C${octave}`, whiteKeyWidth / 2, y + h / 2);
        }
    }

    // Second pass: Draw all black keys on top
    for (let i = 0; i < pitchCount; i++) {
        const pitch = pianoRoll.maxPitch - i;
        const pitchClass = pitch % 12;

        // Only draw black keys in second pass
        if (!blackKeyPattern.includes(pitchClass)) continue;

        const y = i * pianoRoll.pitchHeight;
        const h = pianoRoll.pitchHeight - 0.5;
        const isCurrentlyPlaying = pianoRoll.currentNotes.has(pitch);

        // Black key - offset to the right
        const xOffset = whiteKeyWidth - blackKeyWidth;

        if (isCurrentlyPlaying) {
            ctx.fillStyle = '#f39c12';
        } else {
            ctx.fillStyle = '#1a1a1a';
        }
        ctx.fillRect(xOffset, y, blackKeyWidth, h);

        // Black key border
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.strokeRect(xOffset, y, blackKeyWidth, h);
    }
}

// ============================================================================
// Utility Functions
// ============================================================================

function adjustBrightness(color, factor) {
    // Parse hex color
    const hex = color.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);

    // Adjust brightness
    const newR = Math.min(255, Math.floor(r * factor));
    const newG = Math.min(255, Math.floor(g * factor));
    const newB = Math.min(255, Math.floor(b * factor));

    return `rgb(${newR}, ${newG}, ${newB})`;
}

// ============================================================================
// Control Functions
// ============================================================================

export function startPianoRoll() {
    pianoRoll.isPlaying = true;
}

export function stopPianoRoll() {
    pianoRoll.isPlaying = false;
}

export function resetPianoRoll() {
    pianoRoll.currentTime = 0;
    clearNotes();
}

export function setBPM(bpm) {
    pianoRoll.bpm = bpm;
    // Update pixels per beat to maintain visual consistency
    pianoRoll.pixelsPerBeat = (pianoRoll.pixelsPerSecond * 60) / bpm;
}

export function setScrollSpeed(speed) {
    pianoRoll.pixelsPerSecond = speed;
}

export function setPitchRange(minPitch, maxPitch) {
    pianoRoll.minPitch = minPitch;
    pianoRoll.maxPitch = maxPitch;
    resizePianoRoll();
}

export function setChordIndex(index) {
    // Could be used to change color scheme
}

// ============================================================================
// Cleanup
// ============================================================================

export function destroyPianoRoll() {
    if (pianoRoll.animationFrame) {
        cancelAnimationFrame(pianoRoll.animationFrame);
        pianoRoll.animationFrame = null;
    }
    window.removeEventListener('resize', resizePianoRoll);
}

// ============================================================================
// Debug
// ============================================================================

window.pianoRollDebug = pianoRoll;
