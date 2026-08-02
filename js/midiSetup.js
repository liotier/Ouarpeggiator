/**
 * MIDI Device Management
 *
 * Initializes WebMIDI (with graceful fallback when unavailable) and populates
 * the output-device selector (Browser tone / MIDI outputs / Juno-106).
 */

import * as MIDI from './midi.js';
import * as MIDIDiagnostics from './midiDiagnostics.js';

export async function initializeMIDI() {
    // Initialize diagnostics UI first
    MIDIDiagnostics.initMIDIDiagnostics();

    if (!MIDI.isWebMIDIAvailable()) {
        console.log('WebMIDI not available');
        MIDIDiagnostics.logError('WebMIDI API not available in this browser');
        MIDIDiagnostics.updateAllStatus();
        populateMIDIDevices();  // Still add Juno-106 option!
        return;
    }

    const access = await MIDI.initMIDI();
    if (!access) {
        console.log('Failed to initialize MIDI');
        MIDIDiagnostics.logError('Failed to initialize MIDI - permission denied or error occurred');
        MIDIDiagnostics.updateAllStatus();
        populateMIDIDevices();  // Still add Juno-106 option!
        return;
    }

    MIDIDiagnostics.logSuccess('MIDI initialized successfully');
    MIDIDiagnostics.updateAllStatus();
    populateMIDIDevices();

    // Re-populate on device change
    access.onstatechange = (event) => {
        MIDIDiagnostics.logMIDIEvent(`Device ${event.port.state}: ${event.port.name}`, 'info');
        setTimeout(populateMIDIDevices, 100);
    };
}

export function populateMIDIDevices() {
    const outputSelect = document.getElementById('outputMode');
    if (!outputSelect) return;

    const outputs = MIDI.getOutputDevices();
    const inputs = MIDI.getInputDevices();

    // Preserve current selection
    const currentValue = outputSelect.value;

    // Clear and add Browser tone as first option
    outputSelect.innerHTML = '<option value="audio">Browser tone</option>';

    // Add MIDI devices
    outputs.forEach(device => {
        const option = document.createElement('option');
        option.value = `midi:${device.id}`;
        option.textContent = device.name;
        outputSelect.appendChild(option);
    });

    // Add Juno-106 option
    const junoOption = document.createElement('option');
    junoOption.value = 'juno106';
    junoOption.textContent = 'Juno-106 (new window)';
    outputSelect.appendChild(junoOption);

    // Restore selection if still valid
    if (currentValue && Array.from(outputSelect.options).some(o => o.value === currentValue)) {
        outputSelect.value = currentValue;
    }

    // Enhanced diagnostic logging
    console.log(`[MIDI] WebMIDI initialized: ${MIDI.isMIDIInitialized()}`);
    console.log(`[MIDI] Found ${outputs.length} output device(s)`, outputs.length > 0 ? outputs.map(d => d.name) : '(none)');
    console.log(`[MIDI] Found ${inputs.length} input device(s)`, inputs.length > 0 ? inputs.map(d => d.name) : '(none)');

    if (outputs.length === 0 && inputs.length === 0) {
        console.warn('[MIDI] No devices detected. Possible causes:');
        console.warn('  - No MIDI devices connected');
        console.warn('  - Browser permissions not granted');
        console.warn('  - MIDI drivers not installed/running');
        console.warn('  - Virtual MIDI ports not configured');
    }

    // Update diagnostics UI
    MIDIDiagnostics.updateDeviceLists();
}
