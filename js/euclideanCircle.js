/**
 * Euclidean Circle Visualization (SVG-based)
 *
 * Circular display showing Euclidean rhythm pattern structure.
 * - Steps arranged around circle
 * - Hits shown as filled dots
 * - Rests shown as hollow dots
 * - Rotation indicator shows starting point
 * - Current step highlighted during playback
 *
 * Uses SVG for robust, scale-independent rendering.
 */

// ============================================================================
// State
// ============================================================================

const circle = {
    container: null,
    svg: null,
    size: 240,
    centerX: 120,
    centerY: 120,
    radius: 91,  // 240 * 0.38
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

export function initEuclideanCircle(containerId = 'euclideanCircle') {
    // Get container (could be the canvas element or a parent div)
    let container = document.getElementById(containerId);
    if (!container) {
        console.error('Euclidean circle container not found');
        return;
    }

    // If it's a canvas, replace it with a div
    if (container.tagName === 'CANVAS') {
        const parent = container.parentNode;
        const newContainer = document.createElement('div');
        newContainer.id = containerId;
        newContainer.className = 'euclidean-circle-svg';
        parent.replaceChild(newContainer, container);
        container = newContainer;
    }

    circle.container = container;

    // Create SVG element
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', circle.size);
    svg.setAttribute('height', circle.size);
    svg.setAttribute('viewBox', `0 0 ${circle.size} ${circle.size}`);
    svg.style.display = 'block';
    svg.style.width = '100%';
    svg.style.height = '100%';

    // Add background
    const background = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    background.setAttribute('width', circle.size);
    background.setAttribute('height', circle.size);
    background.setAttribute('fill', '#ffffff');
    svg.appendChild(background);

    // Create groups for layering
    const dotsGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    dotsGroup.setAttribute('id', 'euclidean-dots');
    svg.appendChild(dotsGroup);

    const arrowGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    arrowGroup.setAttribute('id', 'euclidean-arrow');
    svg.appendChild(arrowGroup);

    const labelGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    labelGroup.setAttribute('id', 'euclidean-label');
    svg.appendChild(labelGroup);

    circle.container.innerHTML = '';
    circle.container.appendChild(svg);
    circle.svg = svg;

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
    if (!circle.svg) return;

    const centerX = circle.centerX;
    const centerY = circle.centerY;
    const radius = circle.radius;

    // Get groups
    const dotsGroup = circle.svg.querySelector('#euclidean-dots');
    const arrowGroup = circle.svg.querySelector('#euclidean-arrow');
    const labelGroup = circle.svg.querySelector('#euclidean-label');

    // Clear previous content
    dotsGroup.innerHTML = '';
    arrowGroup.innerHTML = '';
    labelGroup.innerHTML = '';

    // Draw guide circle
    const guide = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    guide.setAttribute('cx', centerX);
    guide.setAttribute('cy', centerY);
    guide.setAttribute('r', radius);
    guide.setAttribute('fill', 'none');
    guide.setAttribute('stroke', '#e0e0e0');
    guide.setAttribute('stroke-width', '1');
    dotsGroup.appendChild(guide);

    // Draw steps around circle
    for (let i = 0; i < circle.steps; i++) {
        const angle = (i / circle.steps) * 2 * Math.PI - Math.PI / 2; // Start at top
        const x = centerX + radius * Math.cos(angle);
        const y = centerY + radius * Math.sin(angle);

        const isHit = circle.pattern[i];
        const isCurrent = i === circle.currentStep && circle.isPlaying;

        // Create circle element for dot
        const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        dot.setAttribute('cx', x);
        dot.setAttribute('cy', y);
        dot.setAttribute('r', isCurrent ? 8 : 6);

        if (isCurrent) {
            // Current step: orange highlight
            dot.setAttribute('fill', '#ff9500');
            dot.setAttribute('stroke', '#ff6600');
            dot.setAttribute('stroke-width', '2');
        } else if (isHit) {
            // Hit: filled blue dot
            dot.setAttribute('fill', '#4a90e2');
            dot.setAttribute('stroke', '#357abd');
            dot.setAttribute('stroke-width', '2');
        } else {
            // Rest: light gray dot
            dot.setAttribute('fill', '#e8e8e8');
            dot.setAttribute('stroke', '#aaaaaa');
            dot.setAttribute('stroke-width', '2');
        }

        dotsGroup.appendChild(dot);
    }

    // Draw rotation indicator (arrow pointing to start)
    if (circle.rotation > 0) {
        const rotAngle = (circle.rotation / circle.steps) * 2 * Math.PI - Math.PI / 2;
        const arrowRadius = radius * 0.7;
        const arrowX = centerX + arrowRadius * Math.cos(rotAngle);
        const arrowY = centerY + arrowRadius * Math.sin(rotAngle);

        // Create arrow path
        const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const arrowAngleDeg = (rotAngle + Math.PI / 2) * 180 / Math.PI;

        // Draw arrow pointing outward from center
        arrow.setAttribute('d', 'M 0,-6 L -3,0 L 3,0 Z');
        arrow.setAttribute('transform', `translate(${arrowX},${arrowY}) rotate(${arrowAngleDeg})`);
        arrow.setAttribute('fill', '#e74c3c');
        arrow.setAttribute('stroke', '#c0392b');
        arrow.setAttribute('stroke-width', '1');

        arrowGroup.appendChild(arrow);
    }

    // Draw center label showing hits/steps
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', centerX);
    label.setAttribute('y', centerY);
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('dominant-baseline', 'middle');
    label.setAttribute('fill', '#555555');
    label.setAttribute('font-size', '14');
    label.setAttribute('font-weight', 'bold');
    label.setAttribute('font-family', 'sans-serif');
    label.textContent = `${circle.hits}/${circle.steps}`;

    labelGroup.appendChild(label);
}

// ============================================================================
// Cleanup
// ============================================================================

export function destroyEuclideanCircle() {
    if (circle.container) {
        circle.container.innerHTML = '';
    }
    circle.container = null;
    circle.svg = null;
}
