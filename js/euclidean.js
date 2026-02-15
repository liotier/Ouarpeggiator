/**
 * Euclidean Rhythm Generator Module
 *
 * Implements Bjorklund's algorithm for generating Euclidean rhythms.
 * Distributes k pulses across n steps as evenly as possible.
 *
 * References:
 * - Toussaint, G. (2005) "The Euclidean Algorithm Generates Traditional Musical Rhythms"
 * - Bjorklund, E. (2003) "The Theory of Rep-Rate Pattern Generation in the SNS Timing System"
 */

/**
 * Generate a Euclidean rhythm pattern using Bjorklund's algorithm
 *
 * @param {number} hits - Number of pulses/onsets (k)
 * @param {number} steps - Total steps in pattern (n)
 * @returns {boolean[]} - Array where true = hit, false = rest
 *
 * @example
 * euclidean(3, 8)  // [true, false, false, true, false, false, true, false] - Cuban tresillo
 * euclidean(5, 8)  // [true, false, true, true, false, true, true, false] - Cuban cinquillo
 * euclidean(7, 16) // Standard clave-like pattern
 * euclidean(4, 12) // [true, false, false, true, false, false, true, false, false, true, false, false]
 */
function euclidean(hits, steps) {
    // Edge cases
    if (steps <= 0) {
        return [];
    }
    if (hits <= 0) {
        return new Array(steps).fill(false);
    }
    if (hits >= steps) {
        return new Array(steps).fill(true);
    }

    // Complementary property: For dense patterns (hits > steps/2),
    // calculate where RESTS go, then invert. This maintains even distribution
    // and avoids clumping at the start.
    // Mathematical property: E(k, n) = complement of E(n-k, n)
    if (hits > steps / 2) {
        const rests = steps - hits;
        const restPattern = euclidean(rests, steps);
        // Invert: rests become hits, hits become rests
        return restPattern.map(v => !v);
    }

    // Build initial groups: hits as [1], rests as [0]
    let pattern = [];
    for (let i = 0; i < hits; i++) {
        pattern.push([1]);
    }
    for (let i = 0; i < steps - hits; i++) {
        pattern.push([0]);
    }

    // Iteratively distribute remainder groups using Euclidean division
    let divisor = steps - hits;

    while (divisor > 1) {
        const dividend = pattern.length - divisor;
        const iterations = Math.min(dividend, divisor);

        // Append first 'iterations' groups to last 'divisor' groups
        for (let i = 0; i < iterations; i++) {
            pattern[pattern.length - divisor + i] = pattern[i].concat(pattern[pattern.length - divisor + i]);
        }

        // Remove the groups that were appended
        pattern = pattern.slice(iterations);

        // Update divisor with remainder
        const remainder = divisor - iterations;
        if (remainder === 0) {
            break;
        }
        divisor = remainder;
    }

    // Flatten nested arrays and convert to booleans
    return pattern.flat(Infinity).map(v => v === 1);
}

/**
 * Rotate a pattern by a given offset
 * Positive offset rotates right (delays the pattern)
 * Negative offset rotates left (advances the pattern)
 *
 * @param {boolean[]} pattern - The pattern to rotate
 * @param {number} rotation - Steps to rotate (positive = right, negative = left)
 * @returns {boolean[]} - Rotated pattern
 *
 * @example
 * rotatePattern([true, false, false, true], 1)  // [true, true, false, false]
 * rotatePattern([true, false, false, true], -1) // [false, false, true, true]
 */
function rotatePattern(pattern, rotation) {
    if (!pattern || pattern.length === 0) {
        return [];
    }

    const len = pattern.length;
    // Normalize rotation to positive modulo
    const offset = (((-rotation) % len) + len) % len;
    return pattern.slice(offset).concat(pattern.slice(0, offset));
}

/**
 * Get information about a Euclidean pattern
 *
 * @param {number} hits - Number of pulses
 * @param {number} steps - Total steps
 * @returns {Object} - Pattern metadata including common name if known
 */
function getPatternInfo(hits, steps) {
    const knownPatterns = {
        '3-8': { name: 'Cuban Tresillo', origin: 'Cuba/West Africa' },
        '5-8': { name: 'Cuban Cinquillo', origin: 'Cuba' },
        '7-8': { name: 'Siciliano', origin: 'Italy' },
        '2-5': { name: 'Khafif-e-ramal', origin: 'Persia' },
        '3-7': { name: 'Ruchenitza', origin: 'Bulgaria' },
        '4-7': { name: 'Aksak', origin: 'Turkey' },
        '5-7': { name: 'Nawakhat', origin: 'India' },
        '3-4': { name: 'Cumbia', origin: 'Colombia' },
        '4-9': { name: 'Aksak', origin: 'Turkey' },
        '5-9': { name: 'Agsag-samai', origin: 'Turkey' },
        '4-11': { name: 'Frank Zappa', origin: 'USA' },
        '5-11': { name: 'Moussorgsky', origin: 'Russia' },
        '5-12': { name: 'Venda clapping', origin: 'South Africa' },
        '7-12': { name: 'West African bell', origin: 'Ghana' },
        '5-16': { name: 'Bossa nova', origin: 'Brazil' },
        '7-16': { name: 'Samba', origin: 'Brazil' },
        '9-16': { name: 'Double Bossa', origin: 'Brazil' },
    };

    const key = `${hits}-${steps}`;
    const known = knownPatterns[key] || null;

    return {
        hits,
        steps,
        density: hits / steps,
        known,
        gcd: gcd(hits, steps),
        period: steps / gcd(hits, steps)
    };
}

/**
 * Greatest common divisor using Euclidean algorithm
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function gcd(a, b) {
    while (b !== 0) {
        const t = b;
        b = a % b;
        a = t;
    }
    return a;
}

/**
 * Generate all unique rotations of a pattern
 * Useful for finding different "feels" of the same rhythm
 *
 * @param {boolean[]} pattern - Base pattern
 * @returns {boolean[][]} - Array of all unique rotations
 */
function getAllRotations(pattern) {
    const rotations = [];
    const seen = new Set();

    for (let i = 0; i < pattern.length; i++) {
        const rotated = rotatePattern(pattern, i);
        const key = rotated.map(b => b ? '1' : '0').join('');

        if (!seen.has(key)) {
            seen.add(key);
            rotations.push(rotated);
        }
    }

    return rotations;
}

/**
 * Convert a pattern to a visual string representation
 *
 * @param {boolean[]} pattern - The pattern
 * @param {string} hitChar - Character for hits (default: 'x')
 * @param {string} restChar - Character for rests (default: '.')
 * @returns {string} - Visual representation
 *
 * @example
 * patternToString([true, false, false, true]) // "x..x"
 */
function patternToString(pattern, hitChar = 'x', restChar = '.') {
    return pattern.map(b => b ? hitChar : restChar).join('');
}

/**
 * Parse a string representation back to a pattern
 *
 * @param {string} str - String like "x..x" or "1001"
 * @param {string} hitChars - Characters that represent hits (default: 'x1')
 * @returns {boolean[]} - Parsed pattern
 */
function stringToPattern(str, hitChars = 'x1X') {
    return str.split('').map(c => hitChars.includes(c));
}

// Export for ES modules
export {
    euclidean,
    rotatePattern,
    getPatternInfo,
    getAllRotations,
    patternToString,
    stringToPattern,
    gcd
};
