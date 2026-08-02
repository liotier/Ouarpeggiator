/**
 * Euclidean rhythm generator tests.
 *
 * The patterns below are the canonical ones from Toussaint (2005); if a change
 * to the generator breaks one of these, it has stopped producing the
 * traditional rhythms the module claims to produce.
 *
 * Run with:  node --test 'tests/*.test.mjs'
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
    euclidean,
    rotatePattern,
    patternToString,
    stringToPattern,
    getPatternInfo,
    getAllRotations,
    gcd
} from '../js/euclidean.js';

const str = (hits, steps) => patternToString(euclidean(hits, steps));

// Every named rhythm the module claims to know, in the orientation published in
// Toussaint (2005). If one of these changes, the generator has stopped
// producing the traditional rhythm it advertises.
test('reproduces the traditional rhythms in their textbook orientation', () => {
    assert.equal(str(3, 8), 'x..x..x.', 'Cuban tresillo');
    assert.equal(str(5, 8), 'x.xx.xx.', 'Cuban cinquillo');
    assert.equal(str(7, 8), 'x.xxxxxx', 'Siciliano');
    assert.equal(str(2, 5), 'x.x..', 'Khafif-e-ramal');
    assert.equal(str(3, 7), 'x.x.x..', 'Ruchenitza');
    assert.equal(str(4, 7), 'x.x.x.x', 'Aksak');
    assert.equal(str(5, 7), 'x.xx.xx', 'Nawakhat');
    assert.equal(str(3, 4), 'x.xx', 'Cumbia');
    assert.equal(str(4, 9), 'x.x.x.x..', 'Aksak (9)');
    assert.equal(str(5, 9), 'x.x.x.x.x', 'Agsag-samai');
    assert.equal(str(4, 11), 'x..x..x..x.', 'Frank Zappa');
    assert.equal(str(5, 11), 'x.x.x.x.x..', 'Moussorgsky');
    assert.equal(str(5, 12), 'x..x.x..x.x.', 'Venda clapping');
    assert.equal(str(7, 12), 'x.xx.x.xx.x.', 'West African bell');
    assert.equal(str(5, 16), 'x..x..x..x..x...', 'Bossa nova');
    assert.equal(str(7, 16), 'x..x.x.x..x.x.x.', 'Samba');
    assert.equal(str(2, 3), 'x.x');
    assert.equal(str(4, 12), 'x..x..x..x..');
});

test('places exactly the requested number of hits', () => {
    for (let steps = 1; steps <= 32; steps++) {
        for (let hits = 0; hits <= steps; hits++) {
            const p = euclidean(hits, steps);
            assert.equal(p.length, steps, `length for ${hits}/${steps}`);
            assert.equal(p.filter(Boolean).length, hits, `hit count for ${hits}/${steps}`);
        }
    }
});

test('distributes hits as evenly as the step count allows', () => {
    // The defining property: gaps between consecutive onsets take at most two
    // distinct lengths, and those differ by exactly one step.
    for (let steps = 2; steps <= 32; steps++) {
        for (let hits = 1; hits <= steps; hits++) {
            const idx = euclidean(hits, steps).flatMap((v, i) => (v ? [i] : []));
            const gaps = idx.map((v, i) => {
                const next = i === idx.length - 1 ? idx[0] + steps : idx[i + 1];
                return next - v;
            });
            const distinct = [...new Set(gaps)].sort((a, b) => a - b);
            assert.ok(distinct.length <= 2, `${hits}/${steps} gap shapes: ${distinct}`);
            if (distinct.length === 2) {
                assert.equal(distinct[1] - distinct[0], 1, `${hits}/${steps} gaps differ by one`);
            }
        }
    }
});

test('always starts on an onset, at every density', () => {
    // Toussaint's convention, and what makes the Rotation control meaningful:
    // rotation 0 is the downbeat orientation, not an arbitrary entry point.
    for (let steps = 1; steps <= 32; steps++) {
        for (let hits = 1; hits <= steps; hits++) {
            assert.equal(euclidean(hits, steps)[0], true, `${hits}/${steps} starts on the downbeat`);
        }
    }
});

test('handles degenerate inputs without throwing', () => {
    assert.deepEqual(euclidean(0, 0), []);
    assert.deepEqual(euclidean(4, 0), []);
    assert.deepEqual(euclidean(-1, 4), [false, false, false, false]);
    assert.deepEqual(euclidean(0, 3), [false, false, false]);
    assert.deepEqual(euclidean(9, 4), [true, true, true, true], 'saturates rather than overflowing');
});

test('rotation shifts the pattern without changing its content', () => {
    const p = euclidean(3, 8);
    assert.equal(patternToString(rotatePattern(p, 0)), 'x..x..x.');
    assert.equal(patternToString(rotatePattern(p, 1)), '.x..x..x');
    assert.equal(patternToString(rotatePattern(p, 8)), 'x..x..x.', 'a full turn is the identity');
    for (const r of [-3, -1, 0, 1, 5, 13]) {
        const rotated = rotatePattern(p, r);
        assert.equal(rotated.length, p.length, `length preserved at rotation ${r}`);
        assert.equal(rotated.filter(Boolean).length, p.filter(Boolean).length, `hits preserved at rotation ${r}`);
    }
});

test('rotation is well defined for negative and oversized amounts', () => {
    const p = euclidean(3, 8);
    assert.deepEqual(rotatePattern(p, -1), rotatePattern(p, 7));
    assert.deepEqual(rotatePattern(p, 11), rotatePattern(p, 3));
});

test('string round-trips through the pattern representation', () => {
    const p = euclidean(5, 16);
    assert.deepEqual(stringToPattern(patternToString(p)), p);
    assert.deepEqual(stringToPattern('1001'), [true, false, false, true]);
});

test('pattern info reports density and period', () => {
    const info = getPatternInfo(3, 8);
    assert.equal(info.hits, 3);
    assert.equal(info.steps, 8);
    assert.equal(info.density, 3 / 8);
    assert.equal(info.known.name, 'Cuban Tresillo');
    assert.equal(getPatternInfo(4, 8).period, 2, '4-in-8 repeats twice per cycle');
});

test('unique rotations collapse patterns with a repeating period', () => {
    // 4-in-8 has period 2, so only two of its eight rotations are distinct.
    assert.equal(getAllRotations(euclidean(4, 8)).length, 2);
    assert.equal(getAllRotations(euclidean(3, 8)).length, 8);
});

test('gcd underpins the period calculation', () => {
    assert.equal(gcd(8, 4), 4);
    assert.equal(gcd(3, 8), 1);
    assert.equal(gcd(12, 18), 6);
});
