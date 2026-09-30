// Browser-safe strict comparison of parsed snapshots; no Node crypto dependency.
export function compareResults(expected, actual, path = '$') {
    if (expected === actual) return null;
    if (Array.isArray(expected) || Array.isArray(actual)) {
        if (!Array.isArray(expected) || !Array.isArray(actual)) return { path, reason: 'type' };
        if (expected.length !== actual.length) return { path, reason: 'length', expected: expected.length, actual: actual.length };
        for (let index = 0; index < expected.length; index++) {
            const difference = compareResults(expected[index], actual[index], `${path}[${index}]`);
            if (difference) return difference;
        }
        return null;
    }
    if (expected && actual && typeof expected === 'object' && typeof actual === 'object') {
        for (const key of [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort()) {
            if (!Object.hasOwn(expected, key) || !Object.hasOwn(actual, key)) return { path: `${path}[${JSON.stringify(key)}]`, reason: 'missing-key' };
            const difference = compareResults(expected[key], actual[key], `${path}[${JSON.stringify(key)}]`);
            if (difference) return difference;
        }
        return null;
    }
    return { path, reason: 'value', expected, actual };
}
