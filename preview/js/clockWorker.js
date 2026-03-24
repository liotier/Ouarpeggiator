/**
 * Clock Worker - High-precision timing in separate thread
 *
 * Runs independently of main thread, unaffected by:
 * - UI updates
 * - Heavy audio processing
 * - Tab throttling
 * - CPU-intensive operations
 */

let intervalId = null;
let nextTickTime = 0;
let tickInterval = 0;
let isRunning = false;

// Use high-resolution timer
const now = () => performance.now();

self.onmessage = function(e) {
    const { type, data } = e.data;

    switch (type) {
        case 'start':
            if (isRunning) return;

            const { bpm } = data;
            tickInterval = 60000 / (bpm * 24);  // ms per tick
            nextTickTime = now();
            isRunning = true;

            // Run scheduler at 5ms intervals for maximum precision
            intervalId = setInterval(() => {
                const currentTime = now();

                // Fire all ticks that should have happened
                while (isRunning && nextTickTime <= currentTime) {
                    self.postMessage({
                        type: 'tick',
                        time: nextTickTime
                    });
                    nextTickTime += tickInterval;
                }
            }, 5);  // 5ms = very responsive
            break;

        case 'stop':
            if (intervalId) {
                clearInterval(intervalId);
                intervalId = null;
            }
            isRunning = false;
            nextTickTime = 0;
            break;

        case 'setBPM':
            const { bpm: newBpm } = data;
            tickInterval = 60000 / (newBpm * 24);
            break;
    }
};
