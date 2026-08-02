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
 * Guarantees exactly `hits` onsets in `steps` positions, spaced as evenly as
 * the step count allows — the gaps between consecutive onsets take at most two
 * distinct lengths, differing by one — and always starting on an onset.
 *
 * Output matches the published tables in Toussaint (2005), so the named rhythms
 * in getPatternInfo() come out in their textbook orientation. Both properties
 * are pinned by tests/euclidean.test.mjs.
 *
 * @param {number} hits - Number of pulses/onsets (k)
 * @param {number} steps - Total steps in pattern (n)
 * @returns {boolean[]} - Array where true = hit, false = rest
 *
 * @example
 * euclidean(3, 8)  // x..x..x.  — Cuban tresillo
 * euclidean(5, 8)  // x.xx.xx.  — Cuban cinquillo
 * euclidean(4, 12) // x..x..x..x..
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

    // A single rest is a degenerate case: there is only one such rhythm up to
    // rotation, and the loop below would terminate immediately and leave every
    // onset bunched at the front (xxx.). Toussaint's tables place the lone rest
    // straight after the first onset — E(3,4) "x.xx" Cumbia, E(7,8) "x.xxxxxx"
    // Siciliano — so construct that orientation directly.
    if (steps - hits === 1) {
        const p = new Array(steps).fill(true);
        p[1] = false;
        return p;
    }

    // Bjorklund proper: start with `hits` onset groups and `steps - hits` rest
    // groups, then repeatedly append the shorter run of groups onto the longer
    // one, pairwise. The leftovers become the next round's shorter run. When one
    // side is down to a single group there is nothing left to distribute, and
    // concatenating what remains yields the maximally even pattern.
    let onsetGroups = Array.from({ length: hits }, () => [true]);
    let restGroups = Array.from({ length: steps - hits }, () => [false]);

    while (Math.min(onsetGroups.length, restGroups.length) > 1) {
        const pairs = Math.min(onsetGroups.length, restGroups.length);
        const merged = [];
        for (let i = 0; i < pairs; i++) {
            merged.push(onsetGroups[i].concat(restGroups[i]));
        }
        // Whichever side had groups to spare carries them into the next round.
        const leftover = onsetGroups.length > restGroups.length
            ? onsetGroups.slice(pairs)
            : restGroups.slice(pairs);
        onsetGroups = merged;
        restGroups = leftover;
    }

    return [...onsetGroups.flat(), ...restGroups.flat()];
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
