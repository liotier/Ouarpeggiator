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

const SVG_NS = 'http://www.w3.org/2000/svg';

const circle = {
    container: null,
    svg: null,
    dotsGroup: null,
    arrowGroup: null,
    labelGroup: null,
    size: 240,
    centerX: 120,
    centerY: 120,
    radius: 91,  // 240 * 0.38
    steps: 16,
    hits: 7,
    rotation: 0,
    pattern: [],
    currentStep: -1,
    isPlaying: false,

    // Chord rhythm (outer ring)
    chordSteps: 13,
    chordHits: 5,
    chordPattern: [],
    chordCurrentStep: -1,

    // Persistent element references, reused across render() calls so most
    // updates only touch attributes instead of tearing down and recreating
    // the whole SVG subtree. Rebuilt (see needsRebuild/buildStructure) only
    // when the step/hit topology actually changes.
    dotElements: [],
    chordElements: [],
    arrowEl: null,
    label1El: null,
    label2El: null,
    labelSingleEl: null,
    builtSteps: -1,
    builtChordSteps: -1,
    builtChordActive: false
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
    circle.dotsGroup = dotsGroup;
    circle.arrowGroup = arrowGroup;
    circle.labelGroup = labelGroup;

    // Fresh, empty groups above mean any previously-held element references
    // are now detached; force the next render() to rebuild from scratch.
    circle.dotElements = [];
    circle.chordElements = [];
    circle.arrowEl = null;
    circle.label1El = null;
    circle.label2El = null;
    circle.labelSingleEl = null;
    circle.builtSteps = -1;
    circle.builtChordSteps = -1;
    circle.builtChordActive = false;

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

export function updateChordPattern(chordSteps, chordHits, chordPattern, chordCurrentStep = -1) {
    circle.chordSteps = chordSteps;
    circle.chordHits = chordHits;
    circle.chordPattern = chordPattern;
    circle.chordCurrentStep = chordCurrentStep;
    render();
}

export function setChordCurrentStep(step) {
    circle.chordCurrentStep = step;
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

function clearSVGGroup(group) {
    while (group.firstChild) {
        group.removeChild(group.firstChild);
    }
}

// Topology = element counts/shapes that require creating or removing DOM
// nodes (step count, chord-ring presence/step count). Everything else
// (which dot is current, hit/rest colors, rotation angle, label text) is a
// pure attribute update against the existing elements.
function needsRebuild() {
    const chordActive = circle.chordSteps > 0 && circle.chordPattern.length > 0;
    return circle.steps !== circle.builtSteps ||
        chordActive !== circle.builtChordActive ||
        (chordActive && circle.chordSteps !== circle.builtChordSteps);
}

function buildStructure() {
    const centerX = circle.centerX;
    const centerY = circle.centerY;
    const radius = circle.radius;
    const outerRadius = radius + 20;

    const dotsGroup = circle.dotsGroup;
    const arrowGroup = circle.arrowGroup;
    const labelGroup = circle.labelGroup;

    clearSVGGroup(dotsGroup);
    clearSVGGroup(arrowGroup);
    clearSVGGroup(labelGroup);
    circle.dotElements = [];
    circle.chordElements = [];
    circle.arrowEl = null;
    circle.label1El = null;
    circle.label2El = null;
    circle.labelSingleEl = null;

    // Guide circles (inner for notes, outer for chords) - static, never updated
    const guide = document.createElementNS(SVG_NS, 'circle');
    guide.setAttribute('cx', centerX);
    guide.setAttribute('cy', centerY);
    guide.setAttribute('r', radius);
    guide.setAttribute('fill', 'none');
    guide.setAttribute('stroke', '#e0e0e0');
    guide.setAttribute('stroke-width', '1');
    dotsGroup.appendChild(guide);

    const outerGuide = document.createElementNS(SVG_NS, 'circle');
    outerGuide.setAttribute('cx', centerX);
    outerGuide.setAttribute('cy', centerY);
    outerGuide.setAttribute('r', outerRadius);
    outerGuide.setAttribute('fill', 'none');
    outerGuide.setAttribute('stroke', '#f0f0f0');
    outerGuide.setAttribute('stroke-width', '1');
    outerGuide.setAttribute('stroke-dasharray', '2,2');
    dotsGroup.appendChild(outerGuide);

    // Step dots - position is fixed by (i, steps); only fill/stroke/r change
    // per render, so cx/cy/stroke-width are set once here.
    for (let i = 0; i < circle.steps; i++) {
        const angle = (i / circle.steps) * 2 * Math.PI - Math.PI / 2; // Start at top
        const x = centerX + radius * Math.cos(angle);
        const y = centerY + radius * Math.sin(angle);

        const dot = document.createElementNS(SVG_NS, 'circle');
        dot.setAttribute('cx', x);
        dot.setAttribute('cy', y);
        dot.setAttribute('stroke-width', '2');
        dotsGroup.appendChild(dot);
        circle.dotElements.push(dot);
    }

    // Rotation indicator arrow - always present, visibility toggled per render
    const arrow = document.createElementNS(SVG_NS, 'path');
    arrow.setAttribute('d', 'M 0,-6 L -3,0 L 3,0 Z');
    arrow.setAttribute('fill', '#e74c3c');
    arrow.setAttribute('stroke', '#c0392b');
    arrow.setAttribute('stroke-width', '1');
    arrowGroup.appendChild(arrow);
    circle.arrowEl = arrow;

    // Chord rhythm outer ring (if in stab mode)
    const chordActive = circle.chordSteps > 0 && circle.chordPattern.length > 0;
    if (chordActive) {
        for (let i = 0; i < circle.chordSteps; i++) {
            const marker = document.createElementNS(SVG_NS, 'path');
            dotsGroup.appendChild(marker);
            circle.chordElements.push(marker);
        }
    }

    // Center label(s) - one line (arpeggio) or two (arpeggio + chord rhythm)
    if (chordActive) {
        const label1 = document.createElementNS(SVG_NS, 'text');
        label1.setAttribute('x', centerX);
        label1.setAttribute('y', centerY - 8);
        label1.setAttribute('text-anchor', 'middle');
        label1.setAttribute('fill', '#4a90e2');
        label1.setAttribute('font-size', '11');
        label1.setAttribute('font-weight', 'bold');
        label1.setAttribute('font-family', 'sans-serif');
        labelGroup.appendChild(label1);
        circle.label1El = label1;

        const label2 = document.createElementNS(SVG_NS, 'text');
        label2.setAttribute('x', centerX);
        label2.setAttribute('y', centerY + 8);
        label2.setAttribute('text-anchor', 'middle');
        label2.setAttribute('fill', '#f39c12');
        label2.setAttribute('font-size', '11');
        label2.setAttribute('font-weight', 'bold');
        label2.setAttribute('font-family', 'sans-serif');
        labelGroup.appendChild(label2);
        circle.label2El = label2;
    } else {
        const label = document.createElementNS(SVG_NS, 'text');
        label.setAttribute('x', centerX);
        label.setAttribute('y', centerY);
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('dominant-baseline', 'middle');
        label.setAttribute('fill', '#555555');
        label.setAttribute('font-size', '14');
        label.setAttribute('font-weight', 'bold');
        label.setAttribute('font-family', 'sans-serif');
        labelGroup.appendChild(label);
        circle.labelSingleEl = label;
    }

    circle.builtSteps = circle.steps;
    circle.builtChordSteps = circle.chordSteps;
    circle.builtChordActive = chordActive;
}

function updateDots() {
    for (let i = 0; i < circle.dotElements.length; i++) {
        const dot = circle.dotElements[i];
        const isHit = circle.pattern[i];
        const isCurrent = i === circle.currentStep && circle.isPlaying;

        dot.setAttribute('r', isCurrent ? 8 : 6);
        if (isCurrent) {
            dot.setAttribute('fill', '#ff9500');
            dot.setAttribute('stroke', '#ff6600');
        } else if (isHit) {
            dot.setAttribute('fill', '#4a90e2');
            dot.setAttribute('stroke', '#357abd');
        } else {
            dot.setAttribute('fill', '#e8e8e8');
            dot.setAttribute('stroke', '#aaaaaa');
        }
    }
}

function updateArrow() {
    const arrow = circle.arrowEl;
    if (!arrow) return;

    if (circle.rotation > 0) {
        const rotAngle = (circle.rotation / circle.steps) * 2 * Math.PI - Math.PI / 2;
        const arrowRadius = circle.radius * 0.7;
        const arrowX = circle.centerX + arrowRadius * Math.cos(rotAngle);
        const arrowY = circle.centerY + arrowRadius * Math.sin(rotAngle);
        const arrowAngleDeg = (rotAngle + Math.PI / 2) * 180 / Math.PI;

        arrow.setAttribute('transform', `translate(${arrowX},${arrowY}) rotate(${arrowAngleDeg})`);
        arrow.style.display = '';
    } else {
        arrow.style.display = 'none';
    }
}

function updateChordMarkers() {
    if (!circle.builtChordActive) return;

    const centerX = circle.centerX;
    const centerY = circle.centerY;
    const outerRadius = circle.radius + 20;

    for (let i = 0; i < circle.chordElements.length; i++) {
        const marker = circle.chordElements[i];
        const angle = (i / circle.chordSteps) * 2 * Math.PI - Math.PI / 2;
        const x = centerX + outerRadius * Math.cos(angle);
        const y = centerY + outerRadius * Math.sin(angle);

        const isChordHit = circle.chordPattern[i];
        const isChordCurrent = i === circle.chordCurrentStep && circle.isPlaying;

        // Diamond shape: up, right, down, left. Size varies with current-step
        // state, so unlike the note dots the path (position + size) is rebuilt.
        const size = isChordCurrent ? 7 : 5;
        const d = `M ${x},${y - size} L ${x + size},${y} L ${x},${y + size} L ${x - size},${y} Z`;
        marker.setAttribute('d', d);

        if (isChordCurrent) {
            marker.setAttribute('fill', '#ffcc00');
            marker.setAttribute('stroke', '#ff9500');
            marker.setAttribute('stroke-width', '2');
        } else if (isChordHit) {
            marker.setAttribute('fill', '#f39c12');
            marker.setAttribute('stroke', '#e67e22');
            marker.setAttribute('stroke-width', '1.5');
        } else {
            marker.setAttribute('fill', '#f8f8f8');
            marker.setAttribute('stroke', '#d0d0d0');
            marker.setAttribute('stroke-width', '1');
        }
    }
}

function updateLabels() {
    if (circle.builtChordActive) {
        if (circle.label1El) circle.label1El.textContent = `Notes: ${circle.hits}/${circle.steps}`;
        if (circle.label2El) circle.label2El.textContent = `Chords: ${circle.chordHits}/${circle.chordSteps}`;
    } else if (circle.labelSingleEl) {
        circle.labelSingleEl.textContent = `${circle.hits}/${circle.steps}`;
    }
}

function render() {
    if (!circle.svg || !circle.dotsGroup) return;

    if (needsRebuild()) {
        buildStructure();
    }

    updateDots();
    updateArrow();
    updateChordMarkers();
    updateLabels();
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
    circle.dotElements = [];
    circle.chordElements = [];
    circle.arrowEl = null;
    circle.label1El = null;
    circle.label2El = null;
    circle.labelSingleEl = null;
    circle.builtSteps = -1;
    circle.builtChordSteps = -1;
    circle.builtChordActive = false;
}
