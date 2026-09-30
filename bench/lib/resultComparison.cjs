const crypto = require('node:crypto');

const NORMALIZATION_VERSION = 1;

function sortKeys(value) {
    if (Array.isArray(value)) return value.map(sortKeys);
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.keys(value).sort().map(key => [key, sortKeys(value[key])]));
    }
    return value;
}

function normalizeResult(result) {
    // Compare the JSON contract, including JS's omitted undefined fields and
    // non-finite -> null serialization. Only the known wall clock is excluded.
    const value = JSON.parse(JSON.stringify(result));
    if (!value || Array.isArray(value) || typeof value !== 'object') {
        throw new TypeError('Simulation result must be a JSON object');
    }
    if (Array.isArray(value.wipeEvents)) {
        for (const wipe of value.wipeEvents) {
            if (wipe && typeof wipe === 'object') delete wipe.timestamp;
        }
    }
    return sortKeys(value);
}

function resultHash(result) {
    return crypto.createHash('sha256').update(JSON.stringify(normalizeResult(result))).digest('hex');
}

function firstDifference(expected, actual, location = '$') {
    if (expected === actual) return null;
    if (Array.isArray(expected) || Array.isArray(actual)) {
        if (!Array.isArray(expected) || !Array.isArray(actual)) return { path: location, reason: 'type' };
        if (expected.length !== actual.length) {
            return { path: location + '.length', reason: 'array-length', expected: expected.length, actual: actual.length };
        }
        for (let i = 0; i < expected.length; i++) {
            const difference = firstDifference(expected[i], actual[i], `${location}[${i}]`);
            if (difference) return difference;
        }
        return null;
    }
    if (expected && actual && typeof expected === 'object' && typeof actual === 'object') {
        for (const key of [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort()) {
            const next = `${location}[${JSON.stringify(key)}]`;
            if (!Object.hasOwn(expected, key) || !Object.hasOwn(actual, key)) {
                return { path: next, reason: 'missing-key', expectedPresent: Object.hasOwn(expected, key), actualPresent: Object.hasOwn(actual, key) };
            }
            const difference = firstDifference(expected[key], actual[key], next);
            if (difference) return difference;
        }
        return null;
    }
    // Keep diagnostics small; do not dump an entire result or private object.
    const scalar = value => value === null || ['number', 'boolean'].includes(typeof value)
        ? value : { type: typeof value };
    return { path: location, reason: 'value', expected: scalar(expected), actual: scalar(actual) };
}

function compareResults(expected, actual) {
    return firstDifference(normalizeResult(expected), normalizeResult(actual));
}

module.exports = { NORMALIZATION_VERSION, normalizeResult, resultHash, compareResults };
