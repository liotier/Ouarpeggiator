/**
 * Euclidean Circle Visualization
 *
 * Circular display showing Euclidean rhythm pattern structure.
 * - Steps arranged around circle
 * - Hits shown as filled dots
 * - Rests shown as hollow dots
 * - Rotation indicator shows starting point
 * - Current step highlighted during playback
 */

// ============================================================================
// State
// ============================================================================

const circle = {
    canvas: null,
    ctx: null,
    size: 120,
    centerX: 60,
    centerY: 60,
    radius: 45,
    steps: 16,
    hits: 7,
    rotation: 0,
    pattern: [],
    currentStep: -1,
    isPlaying: false
};

// ============================================================================
// Initialization
// ============================================================================

export function initEuclideanCircle(canvasId = 'euclideanCircle') {
    circle.canvas = document.getElementById(canvasId);
    if (!circle.canvas) {
        console.error('Euclidean circle canvas not found');
        return;
    }

    circle.ctx = circle.canvas.getContext('2d');

    // Set fixed size for the canvas
    const canvasSize = 240; // Fixed size in CSS pixels
    circle.size = canvasSize;
    circle.centerX = canvasSize / 2;
    circle.centerY = canvasSize / 2;
    circle.radius = canvasSize * 0.38;

    // Handle high DPI displays
    const dpr = window.devicePixelRatio || 1;
    circle.canvas.width = canvasSize * dpr;
    circle.canvas.height = canvasSize * dpr;
    circle.canvas.style.width = canvasSize + 'px';
    circle.canvas.style.height = canvasSize + 'px';
    circle.ctx.scale(dpr, dpr);

    // Don't render yet - pattern will be set by regeneratePattern() immediately after init
}

// ============================================================================
// Update Functions
// ============================================================================

export function updatePattern(steps, hits, rotation, pattern) {
    circle.steps = steps;
    circle.hits = hits;
    circle.rotation = rotation;
    circle.pattern = pattern;
    render();
}

export function setCurrentStep(step) {
    circle.currentStep = step;
    render();
}

export function setPlaying(isPlaying) {
    circle.isPlaying = isPlaying;
    if (!isPlaying) {
        circle.currentStep = -1;
    }
    render();
}

// ============================================================================
// Rendering
// ============================================================================

function render() {
    if (!circle.ctx) return;

    const ctx = circle.ctx;
    const centerX = circle.centerX;
    const centerY = circle.centerY;
    const radius = circle.radius;

    // Clear with light gray background
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(0, 0, circle.size, circle.size);

    // Draw steps around circle
    for (let i = 0; i < circle.steps; i++) {
        const angle = (i / circle.steps) * 2 * Math.PI - Math.PI / 2; // Start at top
        const x = centerX + radius * Math.cos(angle);
        const y = centerY + radius * Math.sin(angle);

        const isHit = circle.pattern[i]; // Pattern uses true/false, not 1/0
        const isCurrent = i === circle.currentStep && circle.isPlaying;

        // Draw step
        ctx.beginPath();
        ctx.arc(x, y, isCurrent ? 8 : 6, 0, 2 * Math.PI);

        if (isCurrent) {
            // Current step: orange highlight
            ctx.fillStyle = '#ff9500';
            ctx.fill();
            ctx.strokeStyle = '#ff6600';
            ctx.lineWidth = 2;
            ctx.stroke();
        } else if (isHit) {
            // Hit: filled blue dot
            ctx.fillStyle = '#4a90e2';
            ctx.fill();
            ctx.strokeStyle = '#357abd';
            ctx.lineWidth = 2;
            ctx.stroke();
        } else {
            // Rest: hollow gray dot
            ctx.fillStyle = '#ffffff';
            ctx.fill();
            ctx.strokeStyle = '#888';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    }

    // Draw rotation indicator (arrow pointing to start)
    if (circle.rotation > 0) {
        const rotAngle = (circle.rotation / circle.steps) * 2 * Math.PI - Math.PI / 2;
        const arrowRadius = radius * 0.7;
        const arrowX = centerX + arrowRadius * Math.cos(rotAngle);
        const arrowY = centerY + arrowRadius * Math.sin(rotAngle);

        // Draw small arrow
        ctx.save();
        ctx.translate(arrowX, arrowY);
        ctx.rotate(rotAngle + Math.PI / 2);

        ctx.beginPath();
        ctx.moveTo(0, -6);
        ctx.lineTo(-3, 0);
        ctx.lineTo(3, 0);
        ctx.closePath();

        ctx.fillStyle = '#e74c3c';
        ctx.fill();
        ctx.strokeStyle = '#c0392b';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.restore();
    }

    // Draw center label showing hits/steps
    ctx.fillStyle = '#555';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${circle.hits}/${circle.steps}`, centerX, centerY);
}

// ============================================================================
// Cleanup
// ============================================================================

export function destroyEuclideanCircle() {
    circle.canvas = null;
    circle.ctx = null;
}
