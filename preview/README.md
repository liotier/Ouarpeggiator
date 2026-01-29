# Ouarpeggiator

[![DeepScan grade](https://deepscan.io/api/teams/YOUR_TEAM_ID/projects/YOUR_PROJECT_ID/branches/YOUR_BRANCH_ID/badge/grade.svg)](https://deepscan.io/dashboard#view=project&tid=YOUR_TEAM_ID&pid=YOUR_PROJECT_ID&bid=YOUR_BRANCH_ID)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=liotier_Ouarpeggiator&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=liotier_Ouarpeggiator)

**Euclidean rhythm arpeggiator for chord progressions**

*French phonetic spelling of "warp" + arpeggiator - referencing time manipulation and phase distortion through Euclidean rhythms.*

## Live Demo

- **Production**: [https://liotier.github.io/Ouarpeggiator/](https://liotier.github.io/Ouarpeggiator/)
- **Development Preview**: [https://liotier.github.io/Ouarpeggiator/preview/](https://liotier.github.io/Ouarpeggiator/preview/)

## What is Ouarpeggiator?

Unlike typical arpeggiators that arpeggiate individual chords, Ouarpeggiator arpeggiates **entire chord progressions**. It generates melodic lines that traverse harmonic structures over time, creating evolving patterns through chord changes.

The core innovation is combining:
- **Euclidean rhythms** (Bjorklund's algorithm) for mathematically optimal beat distributions
- **Positional mapping** through chord tones with octave spread
- **Harmonic and rhythmic variation** for controlled randomness
- **Voice leading intelligence** for smooth transitions between chords

## Features

### Pattern Generation
- Euclidean rhythm generation with configurable hits/steps (1-32)
- Pattern rotation for different rhythmic feels
- Octave spread (1-4 octaves) for melodic range
- Real-time visual pattern display

### Timing
- **Master mode**: Internal clock with adjustable BPM (40-240)
- **Slave mode**: Sync to external MIDI clock (24 PPQN)
- Transport controls (Start/Stop)
- Configurable bars per chord (1, 2, 4, 8)
- Humanization timing offset

### Variation
- **Harmonic variation**: Probabilistic note substitution from progression pool
- **Rhythmic variation**: Probabilistic rest insertion
- **Voice leading**: Smooth, far, or no transition preference

### Output
- **Velocity modes**: Fixed, random range, or curve (linear, exponential, sinusoidal, triangle)
- **Gate modes**: Fixed, random range, or curve
- Full MIDI output via WebMIDI

### Chord Progression
- JSON-based chord input (arrays of MIDI note numbers)
- 4x4 MPC-style pad display with color-coded chord types
- Real-time chord position tracking
- Click-to-jump chord selection

## Technology

- **Pure vanilla JavaScript** (ES6 modules) - no frameworks or dependencies
- **WebMIDI API** for hardware integration
- **CSS Grid** for responsive layout
- Works in Chrome, Edge, and other WebMIDI-enabled browsers

## File Structure

```
Ouarpeggiator/
├── index.html              # Main HTML structure
├── css/
│   ├── layout.css          # Grid, responsive breakpoints
│   └── main.css            # Component styling
├── js/
│   ├── euclidean.js        # Bjorklund algorithm
│   ├── midi.js             # WebMIDI with clock handling
│   ├── arpeggiator.js      # Note selection, variation logic
│   ├── ui.js               # UI bindings and rendering
│   └── main.js             # State management, clock
├── .github/workflows/
│   ├── deploy-main-production.yml
│   └── deploy-claude-preview.yml
├── .deepscan.json          # DeepScan configuration
├── .deepsource.toml        # DeepSource configuration
├── sonar-project.properties # SonarQube configuration
└── LICENSE
```

## Usage

### Basic Operation

1. Open the application in a WebMIDI-enabled browser (Chrome recommended)
2. Select your MIDI output device
3. Load a chord progression (or use the default)
4. Adjust the Euclidean pattern parameters
5. Click **Start** to begin playback

### Chord Progression Format

Chords are specified as JSON arrays of MIDI note numbers:

```json
[
  [60, 64, 67],    // C major (C4, E4, G4)
  [57, 60, 64],    // A minor (A3, C4, E4)
  [65, 69, 72],    // F major (F4, A4, C5)
  [62, 65, 69]     // D minor (D4, F4, A4)
]
```

### MIDI Clock Slave Mode

1. Toggle "Clock Mode" to Slave
2. Connect your external clock source to the MIDI input
3. The arpeggiator will sync to incoming clock and transport messages

## Euclidean Rhythm Examples

| Hits | Steps | Pattern | Name |
|------|-------|---------|------|
| 3 | 8 | `x..x..x.` | Cuban Tresillo |
| 5 | 8 | `x.xx.xx.` | Cuban Cinquillo |
| 7 | 16 | `x.x.x.x.x.x.x.x.` | Samba |
| 5 | 16 | `x..x..x..x..x...` | Bossa Nova |

## Related Projects

This project is an evolution of the [Akai MPC Chord Progression Generator](https://liotier.github.io/AkaiMPC/AkaiMPCChordProgressionGenerator/), specifically recycling and extending its Keyboard tab functionality.

## WebMIDI Targets

No hardware synth? Use these browser-based WebMIDI tools to test Ouarpeggiator:

### Monitor
- [MIDI Monitor](https://www.midimonitor.com/) - Visualize MIDI messages in real-time

### Synthesizers
- [FM Synthesizer](https://notes.ameo.design/fm.html) - Browser-based FM synthesis
- [DX7 Synth JS](https://mmontag.github.io/dx7-synth-js/) - Yamaha DX7 emulation

## License

This is free and unencumbered software released into the public domain. See [LICENSE](LICENSE) for details.

## Author

Jean-Marc Liotier - [GitHub](https://github.com/liotier)
