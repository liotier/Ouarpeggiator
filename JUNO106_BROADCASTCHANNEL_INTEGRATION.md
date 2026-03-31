# Juno-106 BroadcastChannel Integration Instructions

## Overview

This document provides copy-pastable instructions for integrating BroadcastChannel support into the Juno-106 emulator. This allows Ouarpeggiator's Web Worker to send notes **directly to Juno-106**, bypassing the main thread entirely when the Ouarpeggiator tab is backgrounded.

**Benefits:**
- Perfect timing regardless of tab throttling
- No setTimeout delays when tabs are background
- Direct Worker → Juno communication
- Zero main-thread involvement

---

## Branch & Repository

**Target branch:** `ouarpeggiator-integration-patch`
**Repository:** `https://github.com/liotier/Juno-106_maintenance-and-performance-improvements`

---

## Implementation

### Step 1: Add BroadcastChannel listener

Add this code to your main Juno-106 initialization (likely in the main JS file, after Web Audio Context is created):

```javascript
/**
 * BroadcastChannel listener for Ouarpeggiator integration
 *
 * Receives note events directly from Ouarpeggiator's Worker thread,
 * bypassing main thread throttling when Ouarpeggiator tab is backgrounded.
 *
 * Same-origin only: both apps must be on liotier.github.io
 */

// Initialize BroadcastChannel (same name as Ouarpeggiator Worker)
const ouarpeggiatorChannel = new BroadcastChannel('ouarpeggiator-notes');

ouarpeggiatorChannel.onmessage = function(event) {
    const { type, note, velocity } = event.data;

    if (type === 'noteOn') {
        // Replace this with your actual note-on handler
        // Example assuming you have a playNote(midiNote, velocity) function:
        playNote(note, velocity);

        console.log('[BroadcastChannel] noteOn:', note, 'velocity:', velocity);

    } else if (type === 'noteOff') {
        // Replace this with your actual note-off handler
        // Example assuming you have a stopNote(midiNote) function:
        stopNote(note);

        console.log('[BroadcastChannel] noteOff:', note);
    }
};

console.log('[Juno-106] BroadcastChannel listener ready for Ouarpeggiator');
```

### Step 2: Adapt to your existing API

**You need to replace these placeholder function calls with your actual Juno-106 synthesizer API:**

```javascript
// If your note-on function is named differently:
playNote(note, velocity);
// Replace with your actual function, e.g.:
// synth.noteOn(note, velocity);
// OR
// midiInput.handleNoteOn(note, velocity);
// OR
// juno106.triggerNote(note, velocity);

// If your note-off function is named differently:
stopNote(note);
// Replace with your actual function, e.g.:
// synth.noteOff(note);
// OR
// midiInput.handleNoteOff(note);
// OR
// juno106.releaseNote(note);
```

### Step 3: Locate the right integration point

**Where to add this code:**

1. **After Web Audio Context initialization** (audioContext must be created first)
2. **After your synthesizer engine is initialized** (your note playback functions must exist)
3. **Before any existing postMessage listeners** (so it's ready immediately)

**Common locations:**
- End of `DOMContentLoaded` event handler
- After `synth.init()` or equivalent
- In your main initialization function (e.g., `initJuno106()`)

### Step 4: Test the integration

1. **Open Juno-106 tab first** (to ensure the receiver is ready)
2. **Open Ouarpeggiator** in a separate tab
3. **Set output to "Juno-106 (new window)"**
4. **Click "Open Juno-106"** if needed (should connect to existing tab)
5. **Start playback** in Ouarpeggiator
6. **Switch focus to Juno-106 tab** (background Ouarpeggiator)
7. **Verify notes keep playing** with perfect timing

**Console logs to verify:**
- `[Juno-106] BroadcastChannel listener ready for Ouarpeggiator` (on load)
- `[BroadcastChannel] noteOn: 60 velocity: 100` (when notes play)
- `[BroadcastChannel] noteOff: 60` (when notes end)

---

## Message Format

The BroadcastChannel sends these message types:

### `noteOn`
```javascript
{
    type: 'noteOn',
    note: 60,        // MIDI note number (0-127)
    velocity: 100    // MIDI velocity (1-127)
}
```

### `noteOff`
```javascript
{
    type: 'noteOff',
    note: 60         // MIDI note number (0-127)
}
```

---

## Example: Full Integration

Here's a complete example assuming your Juno has these functions:
- `juno.noteOn(note, velocity)`
- `juno.noteOff(note)`

```javascript
// Initialize BroadcastChannel for Ouarpeggiator integration
const ouarpeggiatorChannel = new BroadcastChannel('ouarpeggiator-notes');

ouarpeggiatorChannel.onmessage = function(event) {
    const { type, note, velocity } = event.data;

    switch (type) {
        case 'noteOn':
            if (typeof juno !== 'undefined' && juno.noteOn) {
                juno.noteOn(note, velocity);
            } else {
                console.warn('[BroadcastChannel] Juno synth not ready');
            }
            break;

        case 'noteOff':
            if (typeof juno !== 'undefined' && juno.noteOff) {
                juno.noteOff(note);
            } else {
                console.warn('[BroadcastChannel] Juno synth not ready');
            }
            break;

        default:
            console.warn('[BroadcastChannel] Unknown message type:', type);
    }
};

console.log('[Juno-106] BroadcastChannel listener initialized');
```

---

## Browser Compatibility

**BroadcastChannel is supported in:**
- Chrome/Edge 54+
- Firefox 38+
- Safari 15.4+
- All modern browsers (2023+)

**Not supported:**
- IE11 (but IE is dead anyway)
- Very old Safari (<15.4)

**Fallback:** If BroadcastChannel fails, Ouarpeggiator automatically falls back to the existing `postMessage` method.

---

## Security Note

**BroadcastChannel only works between same-origin pages.**

- Both Ouarpeggiator and Juno-106 must be on `https://liotier.github.io`
- This is already the case for your deployment
- No cross-origin security issues

---

## Debugging

If notes aren't playing:

1. **Check console for initialization message:**
   ```
   [Juno-106] BroadcastChannel listener ready for Ouarpeggiator
   ```

2. **Check console for incoming messages:**
   ```
   [BroadcastChannel] noteOn: 60 velocity: 100
   ```

3. **Verify same origin:**
   - Ouarpeggiator URL: `https://liotier.github.io/Ouarpeggiator/preview/`
   - Juno-106 URL: `https://liotier.github.io/Juno-106_maintenance-and-performance-improvements/`
   - Both start with `https://liotier.github.io` ✓

4. **Test in foreground first:**
   - Start playback with Ouarpeggiator tab in focus
   - Verify notes play via BroadcastChannel
   - Then test backgrounding

5. **Check browser support:**
   ```javascript
   if ('BroadcastChannel' in window) {
       console.log('BroadcastChannel supported');
   } else {
       console.error('BroadcastChannel NOT supported');
   }
   ```

---

## Commit Message Template

```
feat: add BroadcastChannel support for Ouarpeggiator integration

Adds BroadcastChannel listener to receive MIDI note events directly
from Ouarpeggiator's Web Worker, bypassing main thread throttling.

Benefits:
- Perfect timing when Ouarpeggiator tab is backgrounded
- Direct Worker-to-Juno communication
- No setTimeout delays from tab throttling
- Zero main-thread involvement

The listener receives noteOn and noteOff messages from the
'ouarpeggiator-notes' BroadcastChannel and routes them to the
synthesizer engine.

Same-origin requirement satisfied: both apps hosted on liotier.github.io

Integration with: https://github.com/liotier/Ouarpeggiator
Session: https://claude.ai/code/session_012VGcvMNskmKda582C72KBp
```

---

## Questions?

If you encounter any issues integrating this, check:
1. Your Juno-106 note-on/note-off function names
2. Initialization order (BroadcastChannel after synth init)
3. Browser console for error messages
4. Same-origin verification

Good luck! 🎹
