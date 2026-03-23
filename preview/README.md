# Ouarpeggiator

[![DeepScan grade](https://deepscan.io/api/teams/YOUR_TEAM_ID/projects/YOUR_PROJECT_ID/branches/YOUR_BRANCH_ID/badge/grade.svg)](https://deepscan.io/dashboard#view=project&tid=YOUR_TEAM_ID&pid=YOUR_PROJECT_ID&bid=YOUR_BRANCH_ID)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=liotier_Ouarpeggiator&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=liotier_Ouarpeggiator)

**Euclidean rhythm arpeggiator for chord progressions**

*French phonetic spelling of "warp" + arpeggiator - referencing time manipulation and phase distortion through Euclidean rhythms.*

## Live Demo

- **Production**: [https://liotier.github.io/Ouarpeggiator/](https://liotier.github.io/Ouarpeggiator/)
- **Development Preview**: [https://liotier.github.io/Ouarpeggiator/preview/](https://liotier.github.io/Ouarpeggiator/preview/)

## Quick Start: Batteries Included! 🔋

**No MIDI hardware? No problem!** Experience Ouarpeggiator in seconds with browser-based synthesizers:

### ⚡ 30-Second Setup

1. **Open Ouarpeggiator**: [https://liotier.github.io/Ouarpeggiator/](https://liotier.github.io/Ouarpeggiator/)
2. **Open a Web Synth in another tab** (pick one):
   - **[Juno-106](https://juno-106.js.org/)** ⭐ **Recommended** - Classic analog sound, everybody loves the Juno 106 !
   - **[Cardboard Synth](https://www.gsn-lib.org/apps/cardboardsynth/index.html)** - Full-featured subtractive synth with extensive controls
   - **[FM Synthesizer](https://notes.ameo.design/fm.html)** - 6-operator FM synthesis for complex, evolving timbres
3. **Connect the two tabs**:
   - In Ouarpeggiator, select the synth from the **MIDI Output** dropdown
   - Click **Start** and hear music instantly!

> 💡 **Pro Tip**: Both tabs must use the same browser. Chromium, Edge, or Firefox recommended for best WebMIDI support.

### 🎹 Virtual MIDI Setup (Optional)

For routing between apps or using desktop synths, set up virtual MIDI ports:

- **Windows**: [loopMIDI](https://www.tobias-erichsen.de/software/loopmidi.html) (free)
- **macOS**: IAC Driver (built-in, enable in Audio MIDI Setup)
- **Linux**: `virmidi` kernel module or JACK

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
- **WebMIDI API** for hardware integration and browser-to-browser MIDI routing
- **Built-in MIDI diagnostics** with real-time device monitoring and troubleshooting
- **CSS Grid** for responsive layout
- **"Batteries included"** - works immediately with browser tone or Web MIDI synths
- Optimized for Chromium, Edge, Firefox, and other WebMIDI-enabled browsers

## File Structure

```
Ouarpeggiator/
├── index.html              # Main HTML structure
├── css/
│   ├── layout.css          # Grid, responsive breakpoints
│   └── styles.css          # Component styling, diagnostics UI
├── js/
│   ├── euclidean.js        # Bjorklund algorithm
│   ├── midi.js             # WebMIDI with clock handling
│   ├── midiDiagnostics.js  # MIDI troubleshooting UI
│   ├── arpeggiator.js      # Note selection, variation logic
│   ├── pianoRoll.js        # Visual pattern display
│   ├── euclideanCircle.js  # Circular rhythm visualization
│   ├── modules/
│   │   ├── musicTheory.js  # Chord analysis, voice leading
│   │   └── audio.js        # Browser tone synthesis
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

1. **Open Ouarpeggiator** in a WebMIDI-enabled browser (Chromium, Edge, or Firefox recommended)
2. **Choose your sound source**:
   - **Browser tone** (built-in, works immediately)
   - **Web MIDI Synth** (open one from [WebMIDI Targets](#webmidi-targets) in another tab)
   - **Hardware synth** (connect via USB/MIDI interface)
3. **Select MIDI output** from the dropdown (shows "Browser tone" + detected MIDI devices)
4. **Adjust pattern parameters**:
   - Hits (1-32): Number of notes in the pattern
   - Steps (1-32): Total rhythm divisions
   - Rotation: Shift pattern start position
5. **Click Start** to begin playback

> 💡 **First time?** Just click **Start** with default settings - you'll hear sound immediately via browser tone!

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

### Troubleshooting MIDI Issues

**No MIDI devices appearing?** Ouarpeggiator includes built-in diagnostics:

1. **Open "MIDI Diagnostics"** section (collapsible panel above footer)
2. **Check status indicators**:
   - ✓ WebMIDI API Available?
   - ✓ Initialized successfully?
   - ✓ Permission granted?
   - ✓ Secure context (HTTPS/localhost)?
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

**Virtual MIDI Setup**:
- **Windows**: Install [loopMIDI](https://www.tobias-erichsen.de/software/loopmidi.html), create port, select in app
- **macOS**: Audio MIDI Setup → MIDI Studio → IAC Driver → "Device is online"
- **Linux**: `sudo modprobe snd-virmidi` or use JACK

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

Transform your browser into a complete music workstation! No hardware required.

### 🎵 Recommended Synthesizers

#### Classic Analog Sound

**[Juno-106](https://juno-106.js.org/)** ⭐ **Best for Beginners**
- Faithful emulation of the iconic Roland Juno-106
- Warm, lush analog sound that's universally loved
- Simple, intuitive interface
- Perfect for pads, strings, and classic synth sounds
- Instant gratification, zero learning curve

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

### 💾 Advanced: SoundFont Players

For the ultimate sound quality, use SoundFont-based players:

- **[ResidentSf2Synth](https://github.com/notator/WebMIDISynthHost)** - Load custom .sf2 files
- Compatible with professional soundfonts (Arachno, TimGM6mb, etc.)

### 🎚️ Browser-Based DAWs

Take it further with full production environments:

- **[WebAudio Playground](https://webaudioplayground.appspot.com/)** - Visual patching
- Track-based recording and MIDI sequencing

> 💡 **Compatibility Note**: All tools above require WebMIDI API support. Use **Chromium**, **Edge**, or **Firefox** for best results. Firefox may require enabling `dom.webmidi.enabled` in `about:config`.

## License

This is free and unencumbered software released into the public domain. See [LICENSE](LICENSE) for details.

## Author

Jean-Marc Liotier - [GitHub](https://github.com/liotier)
