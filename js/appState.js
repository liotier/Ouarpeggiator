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

    // Arpeggio note order: which chord tone plays on each successive step.
    // 'up'|'down'|'updown'|'downup'|'asplayed'|'random'|'converge'|'diverge'
    arpNoteOrder: 'up',

    // Free-running polymeter: when true the note pattern advances on a fixed
    // 16th-note grid and phases against the bar (Steps = pattern length only);
    // when false the pattern is stretched to fill exactly one bar.
    freeRunning: false,

    // Live transpose (whole octaves; key select regenerates the progression
    // itself and isn't a substitute for this — see index.html Transpose slider)
    transposeOctaves: 0,

    // Timing
    bpm: 120,
    isPlaying: false,
    tickCount: 0,
    barsPerChord: 1,
    humanization: 0,
    swing: 0,  // 0-100, delays offbeat steps (shuffle feel)

    // Playback mode
    playbackMode: 'arpeggio',  // 'arpeggio' | 'stab'

    // Chord motion for the bar-based advance:
    //   'harmonic' — algorithmic selection (harmonic score + Voice Leading)
    //   'inOrder'  — step through the seeded progression (first N pads) and loop
    chordOrderMode: 'harmonic',
    // Number of pads that came from the selected progression template (N). Set
    // at generation/variant-switch; drives 'inOrder' looping. 0 = whole palette.
    progressionLength: 0,
    // The literal voiced progression (duplicates preserved) for 'inOrder' mode,
    // e.g. the four I7 bars opening a 12-bar blues. Set at generation/switch.
    orderedProgression: [],
    progressionPos: 0,  // playback position within orderedProgression

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
