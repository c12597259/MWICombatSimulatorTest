const { compareResults } = require('./resultComparison.cjs');
function compareSimulation(expected, actual) {
    const { result: expectedResult, ...expectedMeta } = expected, { result: actualResult, ...actualMeta } = actual;
    return compareResults(expectedMeta, actualMeta) || compareResults(expectedResult, actualResult);
}
function firstEventDifference(expected, actual, offset = 0) {
    for (let index = 0; index < Math.max(expected.length, actual.length); index++) {
        const left = expected[index], right = actual[index];
        const difference = left && right ? compareResults(left, right) : { path: '$', reason: 'missing-frame' };
        if (difference) return { eventIndex: offset + index + 1, path: difference.path, difference,
            expectedEvent: left?.event, actualEvent: right?.event,
            expectedRandomCalls: left?.randomCalls, actualRandomCalls: right?.randomCalls,
            previousEvent: expected[index - 1]?.event || null };
    }
    return null;
}
module.exports = { compareSimulation, firstEventDifference };
