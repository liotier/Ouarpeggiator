# Ouarpeggiator

**Euclidean rhythm arpeggiator for chord progressions**

*French phonetic spelling of "warp" + arpeggiator - referencing time manipulation and phase distortion through Euclidean rhythms.*

## Live Demo

- **Production**: [https://liotier.github.io/Ouarpeggiator/](https://liotier.github.io/Ouarpeggiator/)
- **Development Preview**: [https://liotier.github.io/Ouarpeggiator/preview/](https://liotier.github.io/Ouarpeggiator/preview/)

## Quick Start: Batteries Included&nbsp;!&nbsp;🔋

**No MIDI hardware, no MIDI drivers, no setup&nbsp;!** Ouarpeggiator can drive a [Juno-106](https://github.com/liotier/Juno-106_maintenance-and-performance-improvements) emulator running in another browser tab with nothing else installed - no WebMIDI permission, no virtual MIDI port, no OS-level MIDI plumbing of any kind. [It does optionnaly speak WebMIDI though&nbsp;!](#webmidi-targets)

### ⚡ 30-Second Setup

1. **Open Ouarpeggiator**: [https://liotier.github.io/Ouarpeggiator/](https://liotier.github.io/Ouarpeggiator/)
2. **Select "Juno-106 (new window)"** from the **Output** dropdown - this opens the [Juno-106](https://github.com/liotier/Juno-106_maintenance-and-performance-improvements) emulator automatically and connects to it
3. **Click Start** and hear music instantly&nbsp;!

> 💡 **No MIDI setup needed**: Ouarpeggiator and the Juno-106 emulator talk directly, browser tab to browser tab - they never touch the operating system's MIDI subsystem. That is what makes this path work on any machine, even one with no MIDI drivers or virtual ports installed.

Want to route into other synths - Cardboard Synth, FM Synthesizer, DX7, or real hardware - over genuine WebMIDI instead&nbsp;? See [WebMIDI Targets](#webmidi-targets) for the recommended synths and the virtual MIDI loopback those connections require.

## What is Ouarpeggiator&nbsp;?

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
- **Free-run (polymeter)**: let the pattern advance on a fixed 16th-note grid instead of stretching to fill one bar, so a 7- or 13-step pattern phases against the beat instead of resetting every bar
- Octave spread (1-4 octaves) for melodic range
- **Note order**: up, down, up-down, down-up, as-played, converge, diverge or random — which chord tone lands on each successive step
- Real-time visual pattern display

### Timing
- **Master mode**: Internal clock with adjustable BPM (40-240)
- **Slave mode**: Sync to external MIDI clock (24 PPQN)
- Transport controls (Start/Stop), plus a panic button that silences every output
- Configurable bars per chord (1, 2, 4, 8)
- **Swing**: delays the offbeats, from straight through to a 2:1 triplet shuffle
- Humanization timing offset
- Live transpose, ±3 octaves, applied as you play

### Variation
- **Chord order**: play the progression's chords in the order written (repeats and all), or let the harmonic engine pick each next chord from the palette
- **Harmonic adherence**: how strictly that algorithmic choice follows harmonic rules, from the smoothest available move to a free wander
- **Harmonic variation**: Probabilistic note substitution from progression pool
- **Rhythmic variation**: Probabilistic rest insertion
- **Voice leading**: steers the algorithmic chord choice toward the smallest note movement, the largest, or neither

### Output
- **Velocity modes**: Fixed, random range, or curve (linear, exponential, sinusoidal, triangle)
- **Gate modes**: Fixed, random range, or curve
- Full MIDI output via WebMIDI

### Chord Progression
- Progression palettes built from 173 named templates across 22 genres, in any of the 12 keys — or every chord of a chosen scale, from 34 modes including ragas and symmetrical/jazz scales
- Multiple voicing variants per palette (Smooth, Classic, Jazz, Modal, Experimental)
- 4x4 MPC-style pad display with color-coded chord types
- Real-time chord position tracking
- Click-to-jump chord selection, live while playing
- Settings persist in `localStorage` and in a shareable `?c=` link; installable as a PWA and usable offline

## Technology

- **Pure vanilla JavaScript** (ES6 modules) - no frameworks or dependencies
- **WebMIDI API** for hardware integration and browser-to-browser MIDI routing
- **Built-in MIDI diagnostics** with real-time device monitoring and troubleshooting
- **CSS Grid** for responsive layout
- **"Batteries included"** - works immediately with browser tone or Web MIDI synths

## File Structure

```
Ouarpeggiator/
├── index.html                    # Main HTML structure
├── manifest.json                 # PWA manifest
├── service-worker.js             # Offline cache (network-first)
├── css/
│   ├── layout.css                # Grid, responsive breakpoints
│   ├── main.css                  # Base element styling
│   └── styles.css                # Component styling, diagnostics UI
├── js/
│   ├── main.js                   # Entry point: init sequence, debug hooks
│   ├── appState.js               # Shared mutable state singleton
│   ├── sequencerCore.js          # Pure note-generation logic (no DOM/audio)
│   ├── transport.js              # Clock, playback, output routing, Juno-106
│   ├── ui.js                     # Control bindings
│   ├── persistence.js            # localStorage + shareable ?c= URL
│   ├── euclidean.js              # Bjorklund algorithm
│   ├── chordProgression.js       # Palette generation, 4x4 pad grid
│   ├── chordProgressionSequencer.js  # Stab-mode chord sequencing methods
│   ├── chordMatcher.js           # "Contains these chords" suggestions
│   ├── clockWorker.js            # Off-thread tick source
│   ├── noteSchedulerWorker.js    # Off-thread sequencer (Juno-106 path)
│   ├── pianoRoll.js              # Rolling piano-roll canvas
│   ├── euclideanCircle.js        # Circular rhythm visualization (SVG)
│   ├── midi.js                   # WebMIDI with clock handling
│   ├── midiSetup.js              # Device enumeration + selector wiring
│   ├── midiDiagnostics.js        # MIDI troubleshooting UI
│   └── modules/
│       ├── musicTheory.js        # Chord analysis, voice leading (shared verbatim
│       │                         #   with the AkaiMPC generator — do not fork)
│       └── audio.js              # Browser tone synthesis
├── tests/                        # node --test, no dependencies (`npm test`)
│   ├── sequencer-core.test.mjs
│   └── euclidean.test.mjs
├── .github/workflows/
│   ├── test.yml
│   ├── build.yml
│   ├── deploy-main-production.yml
│   └── deploy-claude-preview.yml
├── .deepscan.json                # DeepScan configuration
├── .deepsource.toml              # DeepSource configuration
├── sonar-project.properties      # SonarQube configuration
└── LICENSE
```

### Running the tests

```bash
npm test          # or: node --test 'tests/*.test.mjs'
```

The suite covers the sequencer core (step timing in both bar-locked and
free-running modes, note order, swing, gate, chord motion, transpose) and the
Euclidean generator (hit counts, even distribution, rotation). It has no
dependencies and no browser: `sequencerCore.js` is deliberately free of DOM,
audio and MIDI concerns, so the logic that decides what you hear is testable
directly.

## Usage

### Basic Operation

1. **Open Ouarpeggiator** in a WebMIDI-enabled browser (Chromium, Edge, or Firefox recommended)
2. **Choose your sound source**:
   - **Browser tone** (built-in, works immediately)
   - **Web MIDI Synth** (open one from [WebMIDI Targets](#webmidi-targets) in another tab)
   - **Hardware synth** (connect via USB/MIDI interface)
3. **Select MIDI output** from the dropdown (shows "Browser tone", and enumerates detected MIDI devices)
4. **Adjust pattern parameters**:
   - Hits (1-32): Number of notes in the pattern
   - Steps (1-32): Total rhythm divisions
   - Rotation: Shift pattern start position
5. **Click Start** to begin playback

> 💡 **First time?** Just click **Start** with default settings - you'll hear sound immediately via browser tone&nbsp;!

### MIDI Clock Slave Mode

1. Toggle "Clock Mode" to Slave
2. Connect your external clock source to the MIDI input
3. The arpeggiator will sync to incoming clock and transport messages

### Troubleshooting MIDI Issues

**No MIDI devices appearing&nbsp;?** Ouarpeggiator includes built-in diagnostics:

1. **Open "MIDI Diagnostics"** section (collapsible panel above footer)
2. **Check status indicators**:
   - ✓ WebMIDI API Available&nbsp;?
   - ✓ Initialized successfully&nbsp;?
   - ✓ Permission granted&nbsp;?
   - ✓ Secure context (HTTPS/localhost)&nbsp;?
3. **Review device lists** - shows all detected inputs/outputs
4. **Try actions**:
   - Click **"Refresh Devices"** to rescan
   - Click **"Request MIDI Permission"** to re-authorize
   - Click **"Send Test Note"** to verify output works

**Want to see exactly what MIDI messages are being sent?** Use **[MIDI Monitor](https://www.midimonitor.com/)** - open it in another tab to visualize all MIDI traffic in real-time. Invaluable for debugging!
5. **Check Event Log** - real-time MIDI activity with timestamps

**Common fixes**:
- **No devices detected**: Connect hardware, enable virtual MIDI ports, or use browser synth
- **Permission denied**: Check browser site settings, clear and re-grant
- **Not secure context**: Use HTTPS or localhost (not HTTP)
- **Browser not supported**: Use Chromium, Edge, or Firefox

## Euclidean Rhythm Examples

| Hits | Steps | Pattern | Name |
|------|-------|---------|------|
| 3 | 8 | `x..x..x.` | Cuban Tresillo |
| 5 | 8 | `x.xx.xx.` | Cuban Cinquillo |
| 7 | 8 | `x.xxxxxx` | Siciliano |
| 5 | 12 | `x..x.x..x.x.` | Venda clapping |
| 7 | 12 | `x.xx.x.xx.x.` | West African bell |
| 5 | 16 | `x..x..x..x..x...` | Bossa Nova |
| 7 | 16 | `x..x.x.x..x.x.x.` | Samba |

Onsets are spaced as evenly as the step count allows — that even spacing is
what makes these the traditional rhythms — and a pattern always begins on an
onset, matching the tables in Toussaint (2005). Use **Rotation** to move the
downbeat from there.

## Related Projects

This project is an evolution of the [Akai MPC Chord Progression Generator](https://liotier.github.io/AkaiMPC/AkaiMPCChordProgressionGenerator/), specifically recycling and extending its core functionality.

## WebMIDI Targets

Transform your browser into a complete music workstation&nbsp;! No hardware required - but unlike the [Juno-106 quick start](#quick-start-batteries-included), these synths connect over genuine WebMIDI, which means they need an actual MIDI environment.

> 💡 Looking for the Juno-106&nbsp;? It is not a WebMIDI target - see [Quick Start](#quick-start-batteries-included) for its zero-setup, direct browser-to-browser connection.

### 🔌 The MIDI Loopback Requirement

Two browser tabs cannot see each other over WebMIDI directly - WebMIDI only exposes ports the operating system already knows about. To route Ouarpeggiator's output into a synth running in another tab, you need a **virtual MIDI loopback port** that both tabs can see:

- **Windows**: [loopMIDI](https://www.tobias-erichsen.de/software/loopmidi.html)
- **macOS**: IAC Driver (built into Audio MIDI Setup, no install needed)
- **Linux**: `virmidi` (via ALSA) or a JACK-based virtual port

Once the loopback port exists, select it as Ouarpeggiator's MIDI output, then select the same port as the synth tab's MIDI input.

### 🎵 Recommended Synthesizers

#### Full-Featured Synthesis

**[Cardboard Synth](https://www.gsn-lib.org/apps/cardboardsynth/index.html)**
- Complete subtractive synthesizer with extensive controls
- Multiple oscillators, filters, envelopes, and LFOs
- Great for sound design and experimentation
- More flexibility than basic synths
- Modern, responsive interface

**[FM Synthesizer](https://notes.ameo.design/fm.html)**
- 6-operator FM synthesis (like Yamaha DX7)
- Deep sound design capabilities for complex timbres
- Perfect for bell-like, metallic, and evolving tones
- Advanced users who want maximum flexibility

**[DX7 Synth JS](https://mmontag.github.io/dx7-synth-js/)**
- Authentic Yamaha DX7 emulation
- Classic 1980s FM sounds
- Preset library included

**[Web-Synths Collection](https://synth.playtronica.com/)**
- Curated collection by Playtronica & Chromatone
- Various synth engines and interfaces
- MIDI controller support

### 🔍 Monitoring & Debugging

**[MIDI Monitor](https://www.midimonitor.com/)** ⭐ **Highly Recommended**
- Real-time visualization of all MIDI messages flowing through your browser
- Easy to use, incredibly informative for debugging Ouarpeggiator
- Shows notes, velocity, timing, CC, clock, sysex - everything
- Perfect for understanding exactly what's being generated and sent
- Open in a tab alongside Ouarpeggiator to see your arpeggio patterns in action

**[WebMIDI Test](https://arachsys.github.io/webmidi/)**
- Comprehensive MIDI I/O testing
- Device enumeration and inspection

## License

This is free and unencumbered software released into the public domain. See [LICENSE](LICENSE) for details.

## Author

Jean-Marc Liotier - [GitHub](https://github.com/liotier)
