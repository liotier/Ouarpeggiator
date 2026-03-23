/**
 * MIDI Diagnostics UI Module
 *
 * Provides comprehensive MIDI troubleshooting interface with:
 * - Real-time device monitoring
 * - Permission management
 * - Test output functionality
 * - Event logging
 */

import * as MIDI from './midi.js';

// ============================================================================
// State
// ============================================================================

let logEntries = [];
const MAX_LOG_ENTRIES = 100;

// ============================================================================
// Initialization
// ============================================================================

export function initMIDIDiagnostics() {
    updateAllStatus();
    bindEventHandlers();
    log('MIDI Diagnostics initialized', 'info');
}

// ============================================================================
// Status Updates
// ============================================================================

function updateAllStatus() {
    updateAPIStatus();
    updateInitStatus();
    updatePermissionStatus();
    updateSecurityStatus();
    updateDeviceLists();
}

function updateAPIStatus() {
    const element = document.getElementById('midiApiStatus');
    if (!element) return;

    const available = MIDI.isWebMIDIAvailable();
    element.textContent = available ? '✓ Available' : '✗ Not Available';
    element.className = `diagnostic-value ${available ? 'status-ok' : 'status-error'}`;

    if (!available) {
        log('❌ WebMIDI API not available in this browser', 'error');
        log('💡 Try Chromium, Edge, or Firefox (may require dom.webmidi.enabled flag)', 'warning');
    }
}

function updateInitStatus() {
    const element = document.getElementById('midiInitStatus');
    if (!element) return;

    const initialized = MIDI.isMIDIInitialized();
    element.textContent = initialized ? '✓ Yes' : '✗ No';
    element.className = `diagnostic-value ${initialized ? 'status-ok' : 'status-error'}`;

    if (!initialized && MIDI.isWebMIDIAvailable()) {
        log('⚠️ MIDI available but not initialized', 'warning');

        // Show Firefox-specific warning
        const isFirefox = navigator.userAgent.toLowerCase().includes('firefox');
        if (isFirefox) {
            log('ℹ️ Firefox detected: May require MIDI devices to be connected first', 'info');
            log('💡 Click "Request MIDI Permission" after connecting devices', 'info');
        }
    }
}

function updatePermissionStatus() {
    const element = document.getElementById('midiPermissionStatus');
    if (!element) return;

    if (!MIDI.isWebMIDIAvailable()) {
        element.textContent = 'N/A';
        element.className = 'diagnostic-value status-warning';
        return;
    }

    if (MIDI.isMIDIInitialized()) {
        element.textContent = '✓ Granted';
        element.className = 'diagnostic-value status-ok';
    } else {
        element.textContent = '? Unknown';
        element.className = 'diagnostic-value status-warning';
    }
}

function updateSecurityStatus() {
    const secureElement = document.getElementById('secureContextStatus');
    const protocolElement = document.getElementById('protocolStatus');

    if (secureElement) {
        const isSecure = window.isSecureContext;
        secureElement.textContent = isSecure ? '✓ Secure' : '✗ Not Secure';
        secureElement.className = `diagnostic-value ${isSecure ? 'status-ok' : 'status-error'}`;

        if (!isSecure) {
            log('❌ Not a secure context - WebMIDI requires HTTPS or localhost', 'error');
        }
    }

    if (protocolElement) {
        const protocol = window.location.protocol;
        const isValid = protocol === 'https:' || protocol === 'file:' || window.location.hostname === 'localhost';
        protocolElement.textContent = protocol;
        protocolElement.className = `diagnostic-value ${isValid ? 'status-ok' : 'status-warning'}`;
    }
}

export function updateDeviceLists() {
    updateInputDeviceList();
    updateOutputDeviceList();
}

function updateInputDeviceList() {
    const countElement = document.getElementById('inputDeviceCount');
    const listElement = document.getElementById('inputDeviceList');
    if (!listElement) return;

    const devices = MIDI.getInputDevices();

    if (countElement) {
        countElement.textContent = devices.length;
    }

    if (devices.length === 0) {
        listElement.innerHTML = '<li class="no-devices">No devices detected</li>';
    } else {
        listElement.innerHTML = devices.map(device => {
            const selected = MIDI.getSelectedInput()?.id === device.id;
            return `<li class="${selected ? 'device-selected' : ''}">${device.name}</li>`;
        }).join('');

        log(`📥 Found ${devices.length} input device(s): ${devices.map(d => d.name).join(', ')}`, 'success');
    }
}

function updateOutputDeviceList() {
    const countElement = document.getElementById('outputDeviceCount');
    const listElement = document.getElementById('outputDeviceList');
    const testBtn = document.getElementById('testMidiOutputBtn');

    if (!listElement) return;

    const devices = MIDI.getOutputDevices();

    if (countElement) {
        countElement.textContent = devices.length;
    }

    if (devices.length === 0) {
        listElement.innerHTML = '<li class="no-devices">No devices detected</li>';
        if (testBtn) testBtn.disabled = true;
    } else {
        listElement.innerHTML = devices.map(device => {
            const selected = MIDI.getSelectedOutput()?.id === device.id;
            return `<li class="${selected ? 'device-selected' : ''}">${device.name}</li>`;
        }).join('');

        if (testBtn) testBtn.disabled = !MIDI.hasOutputDevice();

        log(`📤 Found ${devices.length} output device(s): ${devices.map(d => d.name).join(', ')}`, 'success');
    }

    // Show troubleshooting hints if no devices found
    if (devices.length === 0 && MIDI.getInputDevices().length === 0) {
        log('⚠️ No MIDI devices detected', 'warning');
        log('Possible causes:', 'info');
        log('  • No MIDI devices connected', 'info');
        log('  • MIDI drivers not installed/running', 'info');
        log('  • Virtual MIDI ports not configured', 'info');
        log('  • Browser permissions not granted', 'info');
    }
}

// ============================================================================
// Event Handlers
// ============================================================================

function bindEventHandlers() {
    const refreshBtn = document.getElementById('refreshMidiBtn');
    const requestPermissionBtn = document.getElementById('requestMidiPermissionBtn');
    const testOutputBtn = document.getElementById('testMidiOutputBtn');
    const clearLogBtn = document.getElementById('clearLogBtn');

    if (refreshBtn) {
        refreshBtn.addEventListener('click', handleRefresh);
    }

    if (requestPermissionBtn) {
        requestPermissionBtn.addEventListener('click', handleRequestPermission);
    }

    if (testOutputBtn) {
        testOutputBtn.addEventListener('click', handleTestOutput);
    }

    if (clearLogBtn) {
        clearLogBtn.addEventListener('click', handleClearLog);
    }
}

async function handleRefresh() {
    log('🔄 Refreshing MIDI devices...', 'info');
    updateAllStatus();
}

async function handleRequestPermission() {
    log('🔐 Requesting MIDI permission...', 'info');

    if (!navigator.requestMIDIAccess) {
        log('❌ WebMIDI API not available', 'error');
        return;
    }

    try {
        const access = await MIDI.initMIDI();
        if (access) {
            log('✓ MIDI permission granted and initialized', 'success');
            updateAllStatus();
        } else {
            log('❌ Failed to initialize MIDI', 'error');
            detectBrowserIssues();
        }
    } catch (error) {
        log(`❌ MIDI permission denied: ${error.message}`, 'error');
        detectBrowserIssues(error);
    }
}

function detectBrowserIssues(error) {
    const isFirefox = navigator.userAgent.toLowerCase().includes('firefox');
    const errorMsg = error?.message?.toLowerCase() || '';

    // Firefox-specific no devices issue
    if (isFirefox) {
        log('⚠️ Firefox detected - requires physical or virtual MIDI devices', 'warning');
        log('💡 Solutions:', 'info');
        log('  • Windows: Install loopMIDI and restart Firefox', 'info');
        log('  • Linux: Enable virmidi kernel module and restart Firefox', 'info');
        log('  • Alternative: Use Chrome/Edge (more permissive with MIDI)', 'info');
        return;
    }

    // Generic advice for other browsers
    log('💡 Troubleshooting:', 'info');
    log('  • Check browser site settings for MIDI permissions', 'info');
    log('  • Ensure MIDI devices are connected before requesting permission', 'info');
    log('  • Try restarting your browser', 'info');
}

function handleTestOutput() {
    if (!MIDI.hasOutputDevice()) {
        log('❌ No MIDI output device selected', 'error');
        return;
    }

    const note = 60; // C4
    const velocity = 100;
    const duration = 500;

    log(`🎵 Sending test note: C4 (MIDI ${note})`, 'info');

    try {
        MIDI.playNote(note, velocity, duration);
        log('✓ Test note sent successfully', 'success');
    } catch (error) {
        log(`❌ Failed to send test note: ${error.message}`, 'error');
    }
}

function handleClearLog() {
    logEntries = [];
    const logElement = document.getElementById('midiEventLog');
    if (logElement) {
        logElement.innerHTML = '<div class="log-entry">Log cleared</div>';
    }
}

// ============================================================================
// Logging
// ============================================================================

function log(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const entry = { timestamp, message, type };

    logEntries.push(entry);
    if (logEntries.length > MAX_LOG_ENTRIES) {
        logEntries.shift();
    }

    const logElement = document.getElementById('midiEventLog');
    if (!logElement) return;

    const entryDiv = document.createElement('div');
    entryDiv.className = `log-entry log-${type}`;
    entryDiv.textContent = `[${timestamp}] ${message}`;

    logElement.appendChild(entryDiv);

    // Auto-scroll to bottom
    logElement.scrollTop = logElement.scrollHeight;

    // Limit DOM entries
    while (logElement.children.length > MAX_LOG_ENTRIES) {
        logElement.removeChild(logElement.firstChild);
    }
}

// ============================================================================
// Public API for external logging
// ============================================================================

export function logMIDIEvent(message, type = 'info') {
    log(message, type);
}

export function logError(message) {
    log(message, 'error');
}

export function logSuccess(message) {
    log(message, 'success');
}

export function logWarning(message) {
    log(message, 'warning');
}

export { updateAllStatus };
