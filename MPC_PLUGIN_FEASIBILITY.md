# Porting to MPC plugins: feasibility

Could the Ouarpeggiator, our Juno-106 emulation (106.js) or the MPC Chord
Progression Generator run as plugins on standalone Akai MPC hardware, using
inMusic's [MPC Plugin Builder SDK](https://github.com/inmusic-software/mpc-plugin-builder-sdk)&nbsp;?

Assessed on 2026-11-15 against the SDK as it stood after its commit of
2026-11-07. This is an evaluation only: no code has been written.

## Summary

| Project | Fits the plugin model | Verdict |
|---|---|---|
| Juno-106 emulation | Yes: it is an instrument | Feasible, but a rewrite rather than a port. Nothing of the current audio code carries over. |
| Ouarpeggiator | Only partly: plugins cannot send MIDI | Not feasible as it is today (a MIDI source driving other instruments). Feasible as an arpeggiator built into an instrument. |
| MPC Chord Progression Generator | No: its product is a file, not sound | Not feasible as a standalone plugin. Its chord palette is a good fit as a component of an instrument. |

The one route that serves all three is a single instrument plugin: the Juno
voice, played by the Ouarpeggiator's sequencer, fed by the generator's chord
palette. Separately, only the Juno stands on its own.

## What the SDK allows

These points come from the SDK's README, overview, FAQ and UI reference. They
decide everything below.

- **Two plugin types: instruments and effects.** Instruments receive MIDI;
  effects do not.
- **No MIDI output.** The FAQ is explicit: "MIDI output from plugins is
  discarded by the host", and so "a step sequencer or arpeggiator must therefore
  be an instrument that produces its own sound (it can still follow the MPC's
  tempo and transport)".
- **C++ only, no web runtime.** A plugin is a Linux shared library following the
  VST 2.4 binary interface, written against a header-only C++ framework and
  cross-compiled for 32-bit ARM (MPC X, Live, Live II, One, One+, Key 37/61,
  Force) and 64-bit ARM (Live III, XL). There is no WebView, JavaScript or
  WebAssembly host, and JUCE is ruled out.
- **The interface is data, not code.** There are no plugin windows. A JSON skin
  places stock widgets (knobs, sliders, buttons, combo boxes, envelopes, XY
  pads, meters, labels, images) on the 1280 x 800 touch screen and maps
  parameters to the 16 Q-Link knobs. The FAQ states there is "no way to draw
  arbitrary graphics from code".
- **Parameters are the whole contract.** Floats from 0 to 1, automated and saved
  by the host, plus an opaque state blob stored in the project and a list of
  built-in presets.
- **Tight CPU budget.** Fixed 44.1 kHz, blocks of 128 frames by default and as
  small as 32. "A 32-bit MPC is roughly a 2013 phone. Budget a few percent of
  one core per plugin instance."
- **Unofficial distribution.** Plugins are copied to a `VST2 Plugins` folder on
  a USB stick or SD card, on MPC OS 3.10.1 or later with External Plugin Support
  enabled. inMusic does not review, sign, distribute or support them, the MPC
  warns the user, and a bug "can freeze or restart the MPC". The SDK is MIT
  licensed and plugins built with it belong to their author.
- **Young.** The repository was three weeks old at the time of writing, with 31
  commits, no tagged release and 10 open issues.

## Juno-106 emulation

**Fit: exact.** A six-voice polyphonic synthesizer that takes notes and produces
audio is what the SDK calls an instrument, and the SDK's own `SimpleSynth`
example (an 8-voice subtractive synth with presets) is the same shape.

**What carries over: the design, not the code.** 106.js does not contain a DSP
engine. It wires together browser-provided Web Audio nodes (oscillators, filters,
gains, delay lines) and uses tuna.js for the chorus. None of that exists on the
MPC. Every stage has to be written from scratch as C++ sample-by-sample code:

- band-limited sawtooth, pulse with PWM, sub-oscillator and noise;
- the 24 dB/octave resonant low-pass filter and the non-resonant high-pass;
- the RC-curve envelope, LFO with delay, portamento, unison and per-voice detune;
- the BBD-style stereo chorus, modes I and II;
- six-voice allocation and stealing.

What does transfer is everything that was hard to decide: the parameter set and
ranges, the envelope curve shapes, the chorus rates and depths, the detune
amounts, the default patches. The existing browser version is also a ready
reference to compare the port against by ear.

**Interface.** A Juno panel is faders and switches, which maps naturally onto the
stock slider, button and combo-box widgets, split across a few tabs (DCO, VCF and
HPF, ENV and VCA, LFO and chorus). The roughly 25 parameters fit the Q-Links in
two banks of 16. Patches become the plugin's preset list. The custom look of the
web panel would be approximated with background images, not reproduced.

**Risks.**

- *CPU on 32-bit models.* Six voices, each with oscillators and a four-pole
  filter, plus a chorus, inside "a few percent of one core" needs care: cheap
  band-limiting, a filter with no per-sample transcendental functions, no
  oversampling. The SDK's 8-voice example suggests it is achievable, but this is
  the main engineering unknown and should be measured early on the weakest
  target.
- *Sound fidelity.* The browser's built-in filter and oscillators have their own
  character; a hand-written engine will not sound identical without tuning. It
  may well sound better, since a proper ladder-style filter is closer to the
  hardware than the browser's biquads.
- *Licence.* The original 106.js code carries no licence, as the fork's README
  notes. A clean C++ rewrite avoids reusing that code, which is the safer
  position. "Juno-106" is a Roland trademark, so a distributed plugin should
  carry a different name.

**Effort.** A moderate project for someone comfortable with C++ audio code: the
DSP is standard, well-documented subtractive synthesis. Most of the time would go
to the filter, the chorus and CPU tuning on real hardware.

## Ouarpeggiator

**Fit: partial, and the missing part is the central one.** Today the
Ouarpeggiator makes no sound of its own that matters: it emits notes to a
synthesizer over WebMIDI or to the Juno tab. An MPC plugin cannot do the
equivalent. Its MIDI output is discarded, so it cannot play another track,
another plugin or an external synth. A faithful port, sitting on a track and
driving whatever instrument the user chooses, is **not possible** with this SDK.

**What is possible: an arpeggiator inside an instrument.** The SDK's stated route
is an instrument that sequences its own voice and follows host tempo and
transport. For us that means pairing the sequencer with a sound source, and the
obvious one is the Juno voice above.

**What carries over.** More than for the Juno, because the logic was already
separated from the browser:

- `sequencerCore.js` is pure logic with no DOM, audio or MIDI dependencies: step
  timing in bar-locked and free-running modes, note order, swing, gate and
  velocity curves, humanization, chord advance, transpose. It translates to C++
  almost line for line.
- `euclidean.js` is a small pure algorithm.
- The test suite in `tests/` states the expected behaviour precisely and can be
  re-expressed against the C++ version, so the port can be checked rather than
  trusted.
- The tick-based clock becomes simpler: instead of worker timers, steps are
  placed at exact sample positions inside each audio block, from host tempo.
  Timing would be tighter than in the browser.

**What does not carry over.**

- *The visualizations.* The Euclidean circle and the rolling piano roll are
  custom drawings, and the SDK does not allow drawing from code. At best the
  pattern could be hinted at with stock indicator widgets. This is a real loss:
  the circle is how the rhythm is understood at a glance.
- *The control surface.* Around 40 controls must be reorganised into tabs of
  stock widgets, at most 16 per page. Workable, and the Q-Links are a good match
  for hits, steps, rotation, swing and gate, but it is a redesign.
- *Shareable links, persistence, PWA.* Replaced by the host's project state and
  presets.
- *Randomness in the audio thread* needs a small deterministic generator, a
  minor point.

**Open design question: where do the chords come from&nbsp;?** In the browser the
palette is generated inside the app. On the MPC there are two sources, and they
can coexist: notes held on the pads or keys (the classic arpeggiator model, and
free since instruments receive MIDI), or an internal palette (see the next
section). The first is the lower-effort starting point.

**Verdict.** Not feasible as a MIDI effect. Feasible, and musically coherent, as
the sequencing half of a self-contained instrument.

## MPC Chord Progression Generator

**Fit: none as a standalone plugin.** The generator's product is a set of
chords handed to the MPC for the user to play, not audio and not a real-time
process. A plugin cannot hand MIDI or chords back to the host, and the SDK
documents no way for a plugin to create files or programs on the device (whether
plugin code can write to storage at all is not stated in the documentation
read). It is also, by nature, a preparation tool used before playing, which the
browser serves well and a 1280 x 800 skin of stock widgets would serve worse:
173 progressions across 22 genres, 34 modes and five voicing variants are
comfortable in a web page and awkward in combo boxes.

**Where it does fit: as the chord source of an instrument.** The 4 x 4 palette
was modelled on the MPC's pads, and an instrument plugin receives the notes
those pads send. An instrument could therefore hold a 16-chord palette and map
each incoming pad note to a chord, sounding it through its own voice or handing
it to the built-in arpeggiator. That reproduces the generator's central idea,
a playable palette of related chords, in the one form the SDK permits.

**Cost of that component.** `musicTheory.js` is about 3,400 lines: the
progression tables, scale and chord construction, voicing and voice-leading
optimisation. It is pure computation and portable, but it is the largest single
body of logic to translate, and it would have to be kept in step with the
JavaScript original, which is already shared verbatim between two projects. A
C++ copy makes three. A reduced first version (fewer genres, one voicing
variant) would limit that burden.

**Verdict.** Keep the generator as the web tool it is. Reuse its palette idea
inside an instrument if the combined plugin is pursued.

## The combined instrument

Taken separately the three projects give one clean port and two misfits. Taken
together they describe one coherent instrument, which is also the only form in
which all of the work reaches the MPC:

1. the Juno voice makes the sound;
2. the Ouarpeggiator core sequences it, locked to MPC tempo and transport;
3. pads select chords from a generated palette, or held notes define the chord.

This is the same pairing the browser versions already demonstrate when the
Ouarpeggiator drives the Juno tab, collapsed into a single unit. Its limit should
be stated plainly: the arpeggiator would only ever play its own built-in voice.
Users who want Euclidean arpeggios on a different MPC instrument would not get
them from this, and no design within the current SDK can provide that.

A sensible order, each step useful by itself:

1. **Juno instrument alone.** Proves the toolchain, the CPU budget and the skin
   system on real hardware. Worth having even if nothing follows.
2. **Add the arpeggiator**, chords taken from held notes. Port `sequencerCore`
   and `euclidean`, carry the tests across.
3. **Add the internal palette**, starting with a reduced set of progressions.

## Reasons for caution

- **The SDK is three weeks old and unsupported by its own vendor for third-party
  output.** Interfaces may change, and a firmware update could break plugins.
- **Hardware is required.** The desktop MPC software is not a target, so every
  meaningful test, above all CPU load, needs a standalone MPC running OS 3.10.1
  or later.
- **A faulty plugin can freeze or restart the MPC**, with the user's unsaved
  project. The bar for stability is higher than for a browser tab.
- **Distribution is by sideloading** behind a warning screen, with no store and
  no signing. The audience is the technically confident subset of MPC owners.
- **A second code base to maintain.** The C++ versions would not share code with
  the JavaScript ones. Every later improvement would need making twice.

## What was not verified

This assessment rests on the SDK's README, overview, FAQ and UI reference. The
following were not read or are not documented, and should be checked before
committing to any work:

- the exact tempo and transport interface in `framework/mpc_plugin.h`
  (the documentation promises it; the details were not examined);
- whether a plugin may read or write files on the device;
- whether the stock widgets (indicators, plotter, path) are flexible enough to
  suggest a Euclidean pattern on screen;
- how pad notes reach an instrument in each MPC pad mode, which determines
  whether the 16-pad palette mapping works as described;
- memory limits, which the documentation does not state;
- the content of the 10 open issues, which may reveal known limitations.
