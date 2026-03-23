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
    updateTroubleshootingTips('default');
    log('MIDI Diagnostics initialized', 'info');
}

function updateTroubleshootingTips(situation = 'default') {
    const helpDiv = document.querySelector('.diagnostic-help ul');
    if (!helpDiv) return;

    const userAgent = navigator.userAgent.toLowerCase();
    const isWindows = userAgent.includes('win');
    const isLinux = userAgent.includes('linux');
    const isMac = userAgent.includes('mac');

    // Determine OS-specific virtual MIDI advice
    let virtualMIDITip = '';
    if (isWindows) {
        virtualMIDITip = 'loopMIDI (Windows)';
    } else if (isMac) {
        virtualMIDITip = 'IAC Driver (macOS, built-in)';
    } else if (isLinux) {
        virtualMIDITip = 'virmidi (Linux)';
    } else {
        virtualMIDITip = 'loopMIDI (Windows), IAC Driver (macOS), virmidi (Linux)';
    }

    // Build situation-specific tip list
    let tips = '';

    if (situation === 'firefox-no-devices') {
        // Firefox requires MIDI devices to grant permission
        tips = `
            <li><strong>🔧 Quick Fix:</strong> Install a virtual MIDI device: ${virtualMIDITip}</li>
            <li>Restart Firefox completely after installing</li>
            <li><strong>Alternative:</strong> Use Chrome/Edge (works without devices)</li>
            <li><strong>Why?</strong> Firefox requires MIDI devices for permission grant (privacy protection)</li>
            <li>The virtual device satisfies the check but doesn't need to be used</li>
            <li>Pure browser-to-browser MIDI will work after permission is granted</li>
        `;
    } else if (situation === 'permission-denied') {
        // Permission denied or init failed
        tips = `
            <li>Check browser site settings for MIDI permissions</li>
            <li>Ensure MIDI devices are connected before requesting permission</li>
            <li>Try virtual MIDI ports: ${virtualMIDITip}</li>
            <li>Reload the page after connecting/configuring devices</li>
            <li>Try restarting your browser</li>
        `;
    } else {
        // Default tips
        tips = `
            <li>Ensure MIDI devices are physically connected and powered on</li>
            <li>Check that MIDI drivers are installed and running</li>
            <li>Try virtual MIDI ports: ${virtualMIDITip}</li>
            <li>Reload the page after connecting/configuring devices</li>
            <li>Check browser site permissions for MIDI access</li>
            <li>WebMIDI requires secure context (HTTPS or localhost)</li>
        `;
    }

    helpDiv.innerHTML = tips;
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
        element.textContent = '? Unknown';
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
        // Debug logging for developers
        console.log('[MIDI Diagnostics] Possible causes:', [
            'No MIDI devices connected',
            'MIDI drivers not installed/running',
            'Virtual MIDI ports not configured',
            'Browser permissions not granted'
        ]);
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
        detectBrowserIssues();
    }
}

function detectBrowserIssues() {
    const isFirefox = navigator.userAgent.toLowerCase().includes('firefox');

    // Debug logging only
    console.log('[MIDI Diagnostics] Browser issue detected:', {
        browser: isFirefox ? 'Firefox' : 'Other',
        userAgent: navigator.userAgent
    });

    // Log what's happening (diagnostics only)
    if (isFirefox) {
        log('⚠️ Firefox requires MIDI devices for permission grant', 'warning');
        log('   (even for browser-only, tab-to-tab MIDI)', 'info');
        // Update troubleshooting frame with Firefox-specific advice
        updateTroubleshootingTips('firefox-no-devices');
    } else {
        log('⚠️ MIDI initialization failed', 'warning');
        // Update troubleshooting frame with generic advice
        updateTroubleshootingTips('permission-denied');
    }
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
