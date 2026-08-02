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

    // Pitch range (matches chord diagrams: 2 octaves base, scales with octave spread)
    minPitch: 48,              // C3 (base)
    maxPitch: 72,              // C5 (2 octaves from C3)
    pitchHeight: 8,            // Pixels per semitone

    // Note buffer
    notes: [],                 // {pitch, startTime, endTime, velocity, chordIndex, color}
    currentNotes: new Set(),   // Currently playing notes

    // Timing
    currentTime: 0,
    playbackStartTime: 0,       // performance.now() when playback started
    animationFrame: null,
    lastRenderTime: 0,          // performance.now() of the last actual repaint (for the 30fps cap)

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
    isPlaying: false,

    // The keyboard sidebar is static except for the highlighted (currently
    // playing) keys and the pitch range. Redrawing it every animation frame was
    // a top main-thread CPU cost, so only redraw it when something it shows
    // actually changed (a note on/off, a scroll, a resize/octave change).
    keyboardDirty: true,

    // Euclidean pattern for hit visualization
    euclideanPattern: [],
    euclideanSteps: 16,
    // Mirrors the sequencer's free-running (polymeter) mode: bar-locked, a step
    // is bar/steps; free-running, a step is a fixed 16th note. The overlay has
    // to use the same rule or its hit bars drift away from the actual notes.
    euclideanFreeRunning: false
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

    // Render initial static frame (don't start animation loop yet)
    render();
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

    // Resizing resets the canvas backing store (clearing it), so the keyboard
    // must be repainted.
    pianoRoll.keyboardDirty = true;
}

// ============================================================================
// Note Management
// ============================================================================

/**
 * Scroll the pitch window (never resize it) so `pitch` is visible. Shifts
 * minPitch/maxPitch together by the minimal amount needed, which leaves the
 * note flush against whichever edge it was outside of. A no-op when the note
 * already fits — so the view only moves when something would otherwise be
 * clipped (e.g. by the live transpose control), never gratuitously.
 */
function ensurePitchVisible(pitch) {
    if (pitch < pianoRoll.minPitch) {
        const shift = pianoRoll.minPitch - pitch;
        pianoRoll.minPitch -= shift;
        pianoRoll.maxPitch -= shift;
        pianoRoll.keyboardDirty = true;
    } else if (pitch > pianoRoll.maxPitch) {
        const shift = pitch - pianoRoll.maxPitch;
        pianoRoll.minPitch += shift;
        pianoRoll.maxPitch += shift;
        pianoRoll.keyboardDirty = true;
    }
}

export function addNote(note, velocity, durationMs, chordIndex = 0) {
    // Use real clock so notes get correct timestamps even when tab is backgrounded
    // (requestAnimationFrame pauses in background, but notes keep playing via Worker)
    if (pianoRoll.isPlaying && pianoRoll.playbackStartTime > 0) {
        pianoRoll.currentTime = (performance.now() - pianoRoll.playbackStartTime) / 1000;
    }

    ensurePitchVisible(note);

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
    pianoRoll.keyboardDirty = true;

    // Remove notes that have scrolled off screen
    const cutoffTime = pianoRoll.currentTime - pianoRoll.visibleSeconds;
    pianoRoll.notes = pianoRoll.notes.filter(n => n.endTime > cutoffTime);
}

export function removeNote(note) {
    if (pianoRoll.currentNotes.delete(note)) {
        pianoRoll.keyboardDirty = true;
    }
}

export function clearNotes() {
    pianoRoll.notes = [];
    pianoRoll.currentNotes.clear();
    pianoRoll.keyboardDirty = true;
}

// ============================================================================
// Rendering
// ============================================================================

// The note canvas doesn't need repainting faster than this to look smooth,
// and capping it cuts main-thread cost on high-refresh-rate displays where
// requestAnimationFrame would otherwise fire (and fully redraw) 90-144+
// times/sec.
const RENDER_INTERVAL_MS = 1000 / 30;

function startAnimation() {
    function animate() {
        const now = performance.now();

        if (pianoRoll.isPlaying) {
            // Derive currentTime from real clock — immune to rAF pausing in
            // background tabs. Updated every rAF tick (cheap) regardless of
            // the render throttle below, so note positions stay accurate.
            pianoRoll.currentTime = (now - pianoRoll.playbackStartTime) / 1000;
        }

        if (now - pianoRoll.lastRenderTime >= RENDER_INTERVAL_MS) {
            pianoRoll.lastRenderTime = now;
            render();
        }

        // Only continue animation loop if playing
        if (pianoRoll.isPlaying) {
            pianoRoll.animationFrame = requestAnimationFrame(animate);
        } else {
            pianoRoll.animationFrame = null;
        }
    }

    pianoRoll.animationFrame = requestAnimationFrame(animate);
}

function render() {
    renderPianoRoll();
    // The scrolling note area changes every frame; the keyboard sidebar only
    // when its highlights or pitch range change.
    if (pianoRoll.keyboardDirty) {
        renderKeyboard();
        pianoRoll.keyboardDirty = false;
    }
}

function renderPianoRoll() {
    const ctx = pianoRoll.ctx;
    const width = pianoRoll.width;
    const height = pianoRoll.height;

    // Clear with light gray background
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(0, 0, width, height);

    // Draw grid lines
    drawGrid(ctx, width, height);

    // Draw notes
    drawNotes(ctx, width);

    // Draw playhead
    drawPlayhead(ctx, width, height);
}

function drawGrid(ctx, width, height) {
    const pixelsPerBeat = pianoRoll.pixelsPerBeat;
    const pixelsPerBar = pixelsPerBeat * pianoRoll.beatsPerBar;

    // Calculate grid offset based on current time
    const scrollOffset = (pianoRoll.currentTime * pianoRoll.pixelsPerSecond) % pixelsPerBar;

    // Draw bar lines (medium gray)
    ctx.strokeStyle = '#c0c0c0';
    ctx.lineWidth = 2;
    for (let x = width - scrollOffset; x >= 0; x -= pixelsPerBar) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
    }

    // Draw beat lines (subtle)
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 1;
    for (let x = width - (scrollOffset % pixelsPerBeat); x >= 0; x -= pixelsPerBeat) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
    }

    // Draw pitch lines
    const pitchCount = pianoRoll.maxPitch - pianoRoll.minPitch + 1;
    for (let i = 0; i <= pitchCount; i++) {
        const y = i * pianoRoll.pitchHeight;
        // Highlight octave lines (C notes)
        const pitch = pianoRoll.maxPitch - i;
        if (pitch % 12 === 0) {
            ctx.strokeStyle = '#b8b8b8';
            ctx.lineWidth = 1;
        } else {
            ctx.strokeStyle = '#e8e8e8';
            ctx.lineWidth = 1;
        }
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
    }

    // Draw Euclidean hit indicators
    if (pianoRoll.euclideanPattern.length > 0) {
        // Duration of one Euclidean step in seconds — must match sequencerCore's
        // stepDurationMs(): a fixed 16th note when free-running, otherwise the
        // bar divided by the step count.
        const stepDuration = pianoRoll.euclideanFreeRunning
            ? (60 / pianoRoll.bpm) / 4
            : (60 / pianoRoll.bpm) * (4 / pianoRoll.euclideanSteps);
        const stepWidth = stepDuration * pianoRoll.pixelsPerSecond;
        const totalPatternDuration = stepDuration * pianoRoll.euclideanSteps;

        // Calculate how many pattern cycles to draw (enough to cover the visible area plus scroll offset)
        const cycleStartTime = Math.floor(pianoRoll.currentTime / totalPatternDuration) * totalPatternDuration;

        // Draw multiple pattern cycles if needed — current cycle forward only.
        // Drawing a cycle into the past (cycle = -1) would retroactively repaint
        // already-played history using whatever pattern is active *now*, which
        // visibly clashes with note rectangles drawn under a since-changed
        // pattern (looks like two different rhythms overlaid).
        for (let cycle = 0; cycle <= 2; cycle++) {
            const cycleTime = cycleStartTime + (cycle * totalPatternDuration);

            pianoRoll.euclideanPattern.forEach((isHit, stepIndex) => {
                if (!isHit) return; // Only draw hits

                const stepTime = cycleTime + (stepIndex * stepDuration);
                const stepX = width - ((pianoRoll.currentTime - stepTime) * pianoRoll.pixelsPerSecond);

                // Skip if off-screen
                if (stepX + stepWidth < 0 || stepX > width) return;

                // Draw subtle vertical highlight bar for hits (blue overlay)
                ctx.fillStyle = 'rgba(74, 144, 226, 0.08)';
                ctx.fillRect(stepX, 0, stepWidth, height);

                // Draw slightly brighter line at the step boundary
                ctx.strokeStyle = 'rgba(74, 144, 226, 0.20)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(stepX, 0);
                ctx.lineTo(stepX, height);
                ctx.stroke();
            });
        }
    }
}

function drawNotes(ctx, width) {
    const currentTime = pianoRoll.currentTime;
    const pixelsPerSecond = pianoRoll.pixelsPerSecond;

    pianoRoll.notes.forEach(note => {
        // Calculate note position
        const noteStartX = width - ((currentTime - note.startTime) * pixelsPerSecond);
        const noteEndX = width - ((currentTime - note.endTime) * pixelsPerSecond);

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
    // Playhead at right edge (orange)
    ctx.strokeStyle = '#ff9500';
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

    // Clear with light gray background
    ctx.fillStyle = '#dcdcdc';
    ctx.fillRect(0, 0, width, height);

    // White and black key patterns (matches generateKeyboardSVG)
    const whiteKeyPattern = [0, 2, 4, 5, 7, 9, 11]; // C D E F G A B
    const blackKeyPattern = [1, 3, 6, 8, 10]; // C# D# F# G# A#

    // Build list of white keys in range (top to bottom = high to low pitch)
    const whiteKeys = [];
    for (let pitch = pianoRoll.maxPitch; pitch >= pianoRoll.minPitch; pitch--) {
        if (whiteKeyPattern.includes(pitch % 12)) {
            whiteKeys.push(pitch);
        }
    }

    // Calculate height per white key
    const whiteKeyHeight = height / whiteKeys.length;
    const blackKeyWidth = width * 0.6; // Black keys are 60% width

    // First pass: Draw white keys
    whiteKeys.forEach((pitch, index) => {
        const y = index * whiteKeyHeight;
        const isCurrentlyPlaying = pianoRoll.currentNotes.has(pitch);
        const pitchClass = pitch % 12;

        // White key background
        ctx.fillStyle = isCurrentlyPlaying ? '#f59e0b' : '#fafafa';
        ctx.fillRect(0, y, width, whiteKeyHeight);

        // White key border
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;
        ctx.strokeRect(0, y, width, whiteKeyHeight);

        // Draw note name for C notes
        if (pitchClass === 0) {
            const octave = Math.floor(pitch / 12) - 1;
            ctx.fillStyle = isCurrentlyPlaying ? '#000' : '#888';
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`C${octave}`, width / 2, y + whiteKeyHeight / 2);
        }
    });

    // Second pass: Draw black keys between white keys
    // Black keys are positioned between their adjacent white keys
    whiteKeys.forEach((pitch, index) => {
        // Check if there's a black key above this white key (higher pitch)
        const blackKeyAbove = pitch + 1;
        if (blackKeyPattern.includes(blackKeyAbove % 12) && blackKeyAbove <= pianoRoll.maxPitch) {
            const isCurrentlyPlaying = pianoRoll.currentNotes.has(blackKeyAbove);

            // Position black key centered between this white key and the previous one
            const blackKeyHeight = whiteKeyHeight * 0.7; // 70% height of white key
            const y = index * whiteKeyHeight - blackKeyHeight / 2;

            // Black key aligned to right edge
            const x = width - blackKeyWidth;

            // Black key background
            ctx.fillStyle = isCurrentlyPlaying ? '#dc2626' : '#333';
            ctx.fillRect(x, y, blackKeyWidth, blackKeyHeight);

            // Black key border
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 1;
            ctx.strokeRect(x, y, blackKeyWidth, blackKeyHeight);
        }
    });
}

// ============================================================================
// Utility Functions
// ============================================================================

function adjustBrightness(color, factor) {
    // Parse hex color
    const hex = color.replaceAll('#', '');
    const r = Number.parseInt(hex.substr(0, 2), 16);
    const g = Number.parseInt(hex.substr(2, 2), 16);
    const b = Number.parseInt(hex.substr(4, 2), 16);

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
    pianoRoll.playbackStartTime = performance.now();
    pianoRoll.currentTime = 0;
    // Restart animation loop if not already running
    if (!pianoRoll.animationFrame) {
        startAnimation();
    }
}

export function stopPianoRoll() {
    pianoRoll.isPlaying = false;
    // Render one final frame to show stopped state (force the keyboard too).
    pianoRoll.keyboardDirty = true;
    render();
}

export function resetPianoRoll() {
    pianoRoll.currentTime = 0;
    pianoRoll.playbackStartTime = 0;
    clearNotes();
}

export function setBPM(bpm) {
    pianoRoll.bpm = bpm;
    // Update pixels per beat to maintain visual consistency
    pianoRoll.pixelsPerBeat = (pianoRoll.pixelsPerSecond * 60) / bpm;
}

export function setEuclideanPattern(pattern, steps, freeRunning = false) {
    pianoRoll.euclideanPattern = pattern;
    pianoRoll.euclideanSteps = steps;
    pianoRoll.euclideanFreeRunning = !!freeRunning;
}

export function setScrollSpeed(speed) {
    pianoRoll.pixelsPerSecond = speed;
}

export function setPitchRange(minPitch, maxPitch) {
    pianoRoll.minPitch = minPitch;
    pianoRoll.maxPitch = maxPitch;
    resizePianoRoll();
}

export function setOctaveSpread(octaveSpread) {
    // Base range: C3 to C5 (2 octaves = 24 semitones)
    // Each additional octave spread adds 12 semitones to the top
    const basePitch = 48; // C3
    const baseRange = 24; // 2 octaves
    pianoRoll.minPitch = basePitch;
    pianoRoll.maxPitch = basePitch + baseRange + ((octaveSpread - 1) * 12);
    resizePianoRoll();
    // Re-render if initialized
    if (pianoRoll.ctx) {
        render();
    }
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
