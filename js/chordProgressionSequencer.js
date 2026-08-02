/**
 * Chord Progression Sequencer Module
 *
 * Generates melodic sequences through chord progressions in Chord Stab Mode.
 * Implements multiple sequencing methods to create evolving harmonic patterns.
 *
 * The sequencer works within the Chord Progression Palette constraint:
 * it sequences existing chords, never generates new ones.
 *
 * Sequencing Methods:
 * 1. Random: Weighted random selection
 * 2. Circle of 5ths: Walk through circle of fifths
 * 3. Functional Harmony: Music theory-based transitions
 * 4. Root Melody: Arpeggio pattern through root notes
 * 5. Voice Leading: Optimize voice leading distance
 */

import MusicTheory from './modules/musicTheory.js';

// ============================================================================
// Chord Progression Sequencer Class
// ============================================================================

export class ChordProgressionSequencer {
    constructor() {
        // Sequencing settings
        this.method = 'root-melody';  // 'random' | 'circle-fifths' | 'functional' | 'root-melody' | 'voice-leading'
        this.patternLength = 4;
        this.lockPattern = false;

        // Method-specific settings
        this.rootMelodyPattern = 'ascending';  // 'ascending' | 'descending' | 'up-down' | 'down-up' | 'converging' | 'diverging' | 'random-walk'
        this.circleFifthsDirection = 'clockwise';  // 'clockwise' | 'counter-clockwise' | 'random'
        this.voiceLeadingOptimization = 'smooth';  // 'smooth' | 'interesting' | 'contrasting'

        // State
        this.sequence = [];  // Array of chord indices
        this.sequencePosition = 0;
        this.lastChordIndex = null;
    }

    /**
     * Generate a new chord sequence from the palette
     * @param {Array} chordPalette - Array of chord objects from state
     * @param {number} length - Pattern length
     * @returns {Array} - Array of chord indices
     */
    generateSequence(chordPalette, length = this.patternLength) {
        if (!chordPalette || chordPalette.length === 0) {
            return [];
        }

        const len = Math.min(length, chordPalette.length * 2); // Allow repeats

        switch (this.method) {
            case 'random':
                return this.generateRandomSequence(chordPalette, len);
            case 'circle-fifths':
                return this.generateCircleFifthsSequence(chordPalette, len);
            case 'functional':
                return this.generateFunctionalSequence(chordPalette, len);
            case 'root-melody':
                return this.generateRootMelodySequence(chordPalette, len);
            case 'voice-leading':
                return this.generateVoiceLeadingSequence(chordPalette, len);
            default:
                return this.generateRandomSequence(chordPalette, len);
        }
    }

    /**
     * Get the next chord index in the sequence
     * @param {Array} chordPalette - Array of chord objects
     * @returns {number} - Next chord index
     */
    getNextChord(chordPalette) {
        // Generate sequence if needed
        if (!this.lockPattern || this.sequence.length === 0) {
            this.sequence = this.generateSequence(chordPalette);
            this.sequencePosition = 0;
        }

        // Get next chord from sequence
        const chordIndex = this.sequence[this.sequencePosition];
        this.sequencePosition = (this.sequencePosition + 1) % this.sequence.length;
        this.lastChordIndex = chordIndex;

        return chordIndex;
    }

    /**
     * Regenerate the current sequence
     * @param {Array} chordPalette - Array of chord objects
     */
    regenerate(chordPalette) {
        this.sequence = this.generateSequence(chordPalette);
        this.sequencePosition = 0;
    }

    /**
     * Reset sequence position (e.g., on play start)
     */
    reset() {
        this.sequencePosition = 0;
        this.lastChordIndex = null;
    }

    // ========================================================================
    // Method 1: Random Selection
    // ========================================================================

    generateRandomSequence(chordPalette, length) {
        const sequence = [];
        const availableIndices = chordPalette.map((_, i) => i);

        for (let i = 0; i < length; i++) {
            // Weighted random: avoid immediate repeats
            let weights = availableIndices.map(idx => {
                if (sequence.length > 0 && idx === sequence[sequence.length - 1]) {
                    return 0.1; // Low weight for immediate repeat
                }
                return 1;
            });

            const selected = this.weightedRandom(availableIndices, weights);
            sequence.push(selected);
        }

        return sequence;
    }

    // ========================================================================
    // Method 2: Circle of Fifths
    // ========================================================================

    generateCircleFifthsSequence(chordPalette, length) {
        // Sort chords by circle of fifths position
        const indexed = chordPalette.map((chord, idx) => ({
            idx,
            root: this.getChordRoot(chord),
            fifthPosition: this.getCircleOfFifthsPosition(this.getChordRoot(chord))
        }));

        // Sort by fifth position
        indexed.sort((a, b) => a.fifthPosition - b.fifthPosition);

        const sequence = [];
        let currentPos = 0;

        for (let i = 0; i < length; i++) {
            sequence.push(indexed[currentPos].idx);

            // Determine direction
            let direction = this.circleFifthsDirection;
            if (direction === 'random') {
                direction = Math.random() < 0.5 ? 'clockwise' : 'counter-clockwise';
            }

            // Move along circle
            if (direction === 'clockwise') {
                currentPos = (currentPos + 1) % indexed.length;
            } else {
                currentPos = (currentPos - 1 + indexed.length) % indexed.length;
            }
        }

        return sequence;
    }

    /**
     * Get circle of fifths position (0-11)
     * C=0, G=1, D=2, A=3, E=4, B=5, F#=6, Db=7, Ab=8, Eb=9, Bb=10, F=11
     */
    getCircleOfFifthsPosition(pitchClass) {
        const circleOrder = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5]; // C, G, D, A, E, B, F#, Db, Ab, Eb, Bb, F
        return circleOrder.indexOf(pitchClass % 12);
    }

    // ========================================================================
    // Method 3: Functional Harmony
    // ========================================================================

    generateFunctionalSequence(chordPalette, length) {
        // Detect key from palette
        const key = this.detectKeyFromPalette(chordPalette);

        // Assign functions to each chord
        const chordFunctions = chordPalette.map((chord, idx) => ({
            idx,
            chord,
            function: this.determineChordFunction(chord, key)
        }));

        const sequence = [];
        let currentIdx = 0; // Start with first chord (usually tonic)
        sequence.push(currentIdx);

        for (let i = 1; i < length; i++) {
            const currentFunc = chordFunctions[currentIdx].function;

            // Get weighted transitions based on function
            const weights = chordFunctions.map((cf, idx) => {
                if (idx === currentIdx) return 0.1; // Avoid immediate repeat
                return this.getFunctionalTransitionWeight(currentFunc, cf.function);
            });

            currentIdx = this.weightedRandom(chordFunctions.map(cf => cf.idx), weights);
            sequence.push(currentIdx);
        }

        return sequence;
    }

    /**
     * Detect most likely key from chord palette
     * Uses root note frequency analysis
     */
    detectKeyFromPalette(chordPalette) {
        if (chordPalette.length === 0) return 0;

        // Count root notes
        const rootCounts = new Array(12).fill(0);
        chordPalette.forEach(chord => {
            const root = this.getChordRoot(chord);
            rootCounts[root % 12]++;
        });

        // Find most common root (likely tonic)
        let maxCount = 0;
        let likelyTonic = 0;
        rootCounts.forEach((count, pc) => {
            if (count > maxCount) {
                maxCount = count;
                likelyTonic = pc;
            }
        });

        return likelyTonic;
    }

    /**
     * Determine harmonic function of a chord
     * Returns: 'tonic', 'subdominant', 'dominant', 'other'
     */
    determineChordFunction(chord, key) {
        const root = this.getChordRoot(chord);
        const degreeFromKey = (root - key + 12) % 12;

        // Map scale degrees to functions
        const functionMap = {
            0: 'tonic',      // I
            2: 'other',      // ii
            4: 'other',      // iii
            5: 'subdominant',// IV
            7: 'dominant',   // V
            9: 'tonic',      // vi (relative minor, often tonic substitute)
            11: 'dominant'   // vii° (leading tone)
        };

        return functionMap[degreeFromKey] || 'other';
    }

    /**
     * Get transition weight between harmonic functions
     * Based on common progressions (I-IV, I-V, V-I, etc.)
     */
    getFunctionalTransitionWeight(fromFunc, toFunc) {
        const weights = {
            'tonic': {
                'tonic': 0.5,
                'subdominant': 3,
                'dominant': 3,
                'other': 1
            },
            'subdominant': {
                'tonic': 2,
                'subdominant': 0.5,
                'dominant': 3,
                'other': 1
            },
            'dominant': {
                'tonic': 5,        // Strong resolution
                'subdominant': 0.5,
                'dominant': 0.5,
                'other': 1
            },
            'other': {
                'tonic': 2,
                'subdominant': 2,
                'dominant': 2,
                'other': 1
            }
        };

        return weights[fromFunc]?.[toFunc] ?? 1;
    }

    // ========================================================================
    // Method 4: Root Melody
    // ========================================================================

    generateRootMelodySequence(chordPalette, length) {
        // Sort chords by root pitch
        const indexed = chordPalette.map((chord, idx) => ({
            idx,
            root: this.getChordRoot(chord)
        }));

        indexed.sort((a, b) => (a.root % 12) - (b.root % 12));

        const sequence = [];

        switch (this.rootMelodyPattern) {
            case 'ascending':
                for (let i = 0; i < length; i++) {
                    sequence.push(indexed[i % indexed.length].idx);
                }
                break;

            case 'descending':
                for (let i = 0; i < length; i++) {
                    const pos = indexed.length - 1 - (i % indexed.length);
                    sequence.push(indexed[pos].idx);
                }
                break;

            case 'up-down':
                // Triangle wave: up then down
                for (let i = 0; i < length; i++) {
                    const cycle = i % (indexed.length * 2);
                    const pos = cycle < indexed.length
                        ? cycle
                        : (indexed.length * 2 - 1 - cycle);
                    sequence.push(indexed[pos].idx);
                }
                break;

            case 'down-up':
                // Inverted triangle: down then up
                for (let i = 0; i < length; i++) {
                    const cycle = i % (indexed.length * 2);
                    const pos = cycle < indexed.length
                        ? (indexed.length - 1 - cycle)
                        : (cycle - indexed.length);
                    sequence.push(indexed[pos].idx);
                }
                break;

            case 'converging':
                // Outside to inside
                for (let i = 0; i < length; i++) {
                    const pos = i % 2 === 0
                        ? Math.floor(i / 2) % indexed.length
                        : indexed.length - 1 - Math.floor(i / 2) % indexed.length;
                    sequence.push(indexed[pos].idx);
                }
                break;

            case 'diverging': {
                // Inside to outside (start from middle)
                const mid = Math.floor(indexed.length / 2);
                for (let i = 0; i < length; i++) {
                    const offset = Math.floor(i / 2);
                    const pos = i % 2 === 0
                        ? (mid + offset) % indexed.length
                        : (mid - offset + indexed.length) % indexed.length;
                    sequence.push(indexed[pos].idx);
                }
                break;
            }

            case 'random-walk': {
                // Start from random position, walk ±1-3 steps
                let currentPos = Math.floor(Math.random() * indexed.length);
                for (let i = 0; i < length; i++) {
                    sequence.push(indexed[currentPos].idx);
                    const step = Math.floor(Math.random() * 3) + 1; // 1-3 steps
                    const direction = Math.random() < 0.5 ? 1 : -1;
                    currentPos = (currentPos + step * direction + indexed.length) % indexed.length;
                }
                break;
            }

            default:
                // Default to ascending
                for (let i = 0; i < length; i++) {
                    sequence.push(indexed[i % indexed.length].idx);
                }
        }

        return sequence;
    }

    // ========================================================================
    // Method 5: Voice Leading Optimization
    // ========================================================================

    generateVoiceLeadingSequence(chordPalette, length) {
        if (chordPalette.length === 0) return [];

        const sequence = [];
        let currentIdx = 0; // Start with first chord
        sequence.push(currentIdx);

        for (let i = 1; i < length; i++) {
            const currentChord = chordPalette[currentIdx];

            // Score all other chords by voice leading distance
            const scores = chordPalette.map((chord, idx) => {
                if (idx === currentIdx) return { idx, score: -Infinity }; // Avoid repeat

                const analysis = MusicTheory.analyzeVoiceLeading(currentChord.notes, chord.notes);
                if (!analysis) return { idx, score: 0 };

                return {
                    idx,
                    score: analysis.smoothness,
                    distance: this.calculateVoiceLeadingDistance(currentChord.notes, chord.notes)
                };
            }).filter(s => s.score !== -Infinity);

            // Select based on optimization goal
            let selected;
            switch (this.voiceLeadingOptimization) {
                case 'smooth':
                    // Minimize distance (smoothest possible)
                    scores.sort((a, b) => a.distance - b.distance);
                    selected = scores[0].idx;
                    break;

                case 'interesting':
                    // Not smoothest, but within threshold (variety with coherence)
                    scores.sort((a, b) => a.distance - b.distance);
                    const threshold = Math.min(3, Math.floor(scores.length / 3));
                    selected = scores[Math.floor(Math.random() * threshold)].idx;
                    break;

                case 'contrasting':
                    // Maximize distance (dramatic leaps)
                    scores.sort((a, b) => b.distance - a.distance);
                    selected = scores[0].idx;
                    break;

                default:
                    selected = scores[0].idx;
            }

            sequence.push(selected);
            currentIdx = selected;
        }

        return sequence;
    }

    /**
     * Calculate total voice leading distance between two chords
     * Sum of semitone movements across all voices
     */
    calculateVoiceLeadingDistance(notes1, notes2) {
        if (!notes1 || !notes2) return Infinity;

        const len = Math.min(notes1.length, notes2.length);
        let totalDistance = 0;

        for (let i = 0; i < len; i++) {
            totalDistance += Math.abs(notes2[i] - notes1[i]);
        }

        // Penalize voice count mismatch
        totalDistance += Math.abs(notes1.length - notes2.length) * 12;

        return totalDistance;
    }

    // ========================================================================
    // Utility Functions
    // ========================================================================

    /**
     * Get root note of a chord (lowest note pitch class)
     */
    getChordRoot(chord) {
        if (!chord || !chord.notes || chord.notes.length === 0) {
            return 0;
        }
        // Return lowest note as root
        return Math.min(...chord.notes);
    }

    /**
     * Weighted random selection
     * @param {Array} items - Items to choose from
     * @param {Array} weights - Weights for each item
     * @returns {*} - Selected item
     */
    weightedRandom(items, weights) {
        const totalWeight = weights.reduce((sum, w) => sum + w, 0);
        let random = Math.random() * totalWeight;

        for (let i = 0; i < items.length; i++) {
            random -= weights[i];
            if (random <= 0) {
                return items[i];
            }
        }

        return items[items.length - 1];
    }

    /**
     * Get preview string of current sequence
     * @param {Array} chordPalette - Chord palette
     * @returns {string} - Preview string
     */
    getPreviewString(chordPalette) {
        if (!this.sequence || this.sequence.length === 0) {
            return 'No sequence';
        }

        const chordNames = this.sequence.map(idx => {
            const chord = chordPalette[idx];
            if (!chord) return '?';

            // Try to get chord name from analysis
            if (chord.analysis && chord.analysis.name) {
                return chord.analysis.name;
            }

            // Fallback: show root note
            const root = this.getChordRoot(chord);
            const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
            return noteNames[root % 12];
        });

        return chordNames.join(' → ') + ' → (loop)';
    }
}

// Export singleton instance
export default new ChordProgressionSequencer();
