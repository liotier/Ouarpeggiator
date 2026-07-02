/**
 * Application State & shared config
 *
 * `appState` is a mutable singleton imported by every feature module — they all
 * hold the same object reference, so mutating a property in one module is seen
 * everywhere. Keep only shared *state* and small config constants here; feature
 * logic lives in the feature modules.
 */

export const appState = {
    // Generation mode
    generationMode: 'template',  // 'template' | 'scale'

    // Generator settings
    key: 0,
    mode: 'Major',
    progressionTemplate: 'I—V—vi—IV—I—V—iii—IV',  // Extended Pop

    // Output mode
    outputMode: 'audio',  // 'audio' | 'midi'

    // Chord progression (16 pads)
    chordProgression: [],
    currentChordIndex: 0,

    // Variants (multiple voicing options)
    variants: [],
    currentVariantIndex: 0,

    // Chord matcher
    selectedChords: [],

    // Euclidean pattern
    euclidean: {
        hits: 10,
        steps: 16,
        rotation: 10,
        pattern: [],
    },
    octaveSpread: 1,

    // Live transpose (whole octaves; key select regenerates the progression
    // itself and isn't a substitute for this — see index.html Transpose slider)
    transposeOctaves: 0,

    // Timing
    bpm: 120,
    isPlaying: false,
    tickCount: 0,
    barsPerChord: 1,
    humanization: 0,

    // Playback mode
    playbackMode: 'arpeggio',  // 'arpeggio' | 'stab'

    // Chord variation
    harmonicAdherence: 70,  // 0-100, how strictly to follow harmonic rules

    // Note variation (arpeggio mode only)
    harmonicVariation: 0,
    rhythmicVariation: 0,
    voiceLeading: 'smooth',
    lastPlayedNote: null,

    // Chord stab settings
    strumSpeed: 0,  // 0-100ms delay between notes
    strumDirection: 'up',  // 'up' | 'down' | 'alternating'

    // Chord progression sequencing (Stab Mode only)
    chordSequencing: {
        enabled: true,  // Enable chord progression in stab mode
        stepsLocked: true,  // Lock steps to main euclidean (false = independent/flams)
        euclidean: {
            hits: 4,    // Chord changes per pattern
            steps: 16,  // Independent steps (when unlocked)
            rotation: 0,
            pattern: [],
        },
        stepIndex: 0,  // Current position in chord change pattern
    },

    // Velocity/Gate
    velocity: { mode: 'fixed', fixed: 100, randomMin: 60, randomMax: 110, curveType: 'linear-ascending', curveMin: 60, curveMax: 120 },
    gate: { mode: 'fixed', fixed: 0.8, randomMin: 0.5, randomMax: 0.9, curveType: 'linear-ascending', curveMin: 0.3, curveMax: 0.95 },
    curveSyncRotation: false,  // Sync curve start to Euclidean rotation

    // Runtime
    euclideanStepIndex: 0,

    // Generation tracking
    hasGeneratedOnce: false,

    // UI initialization tracking
    pianoRollInitialized: false,
};

// Timing constants
export const TIMING = {
    SPARKLE_DURATION: 600,
};
