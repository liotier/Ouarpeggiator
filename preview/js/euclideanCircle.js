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

    // Handle high DPI displays
    const dpr = window.devicePixelRatio || 1;
    const rect = circle.canvas.getBoundingClientRect();
    circle.canvas.width = rect.width * dpr;
    circle.canvas.height = rect.height * dpr;
    circle.ctx.scale(dpr, dpr);

    circle.size = rect.width;
    circle.centerX = circle.size / 2;
    circle.centerY = circle.size / 2;
    circle.radius = circle.size * 0.38;

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

    // Clear with tan background
    ctx.fillStyle = '#bfaf9f';
    ctx.fillRect(0, 0, circle.size, circle.size);

    // Draw steps around circle
    for (let i = 0; i < circle.steps; i++) {
        const angle = (i / circle.steps) * 2 * Math.PI - Math.PI / 2; // Start at top
        const x = centerX + radius * Math.cos(angle);
        const y = centerY + radius * Math.sin(angle);

        const isHit = circle.pattern[i] === 1;
        const isCurrent = i === circle.currentStep && circle.isPlaying;

        // Draw step
        ctx.beginPath();
        ctx.arc(x, y, isCurrent ? 6 : 4, 0, 2 * Math.PI);

        if (isCurrent) {
            // Current step: bright highlight
            ctx.fillStyle = '#d35400';
            ctx.fill();
            ctx.strokeStyle = '#e67e22';
            ctx.lineWidth = 2;
            ctx.stroke();
        } else if (isHit) {
            // Hit: filled dot (darker brown)
            ctx.fillStyle = '#5d4e37';
            ctx.fill();
            ctx.strokeStyle = '#6d5e47';
            ctx.lineWidth = 1;
            ctx.stroke();
        } else {
            // Rest: hollow dot (light)
            ctx.strokeStyle = '#9a8878';
            ctx.lineWidth = 1;
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

        ctx.fillStyle = '#c0504d';
        ctx.fill();
        ctx.strokeStyle = '#a04844';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.restore();
    }

    // Draw center label showing hits/steps
    ctx.fillStyle = '#5d4e37';
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
