const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { parseArgs } = require('node:util');
const { root, buildBundle } = require('./lib/build.cjs');
const { sha256, validateName, loadReference } = require('./lib/reference.cjs');
const { NORMALIZATION_VERSION, compareResults, resultHash } = require('./lib/resultComparison.cjs');
const { RNG_VERSION } = require('./lib/seededRandom.cjs');

function assertCoverage(scenario, result) {
    const actual = { completed: result.dungeonsCompleted || 0, failed: result.dungeonsFailed || 0,
        wipeEvents: result.wipeEvents?.length || 0, timeSeriesSamples: result.timeSeriesData?.timestamps?.length || 0,
        labyrinthAttempts: result.labyAttemptCount || 0 };
    for (const [key, minimum] of Object.entries(scenario.minimumCoverage || {})) {
        if (!(key in actual) || actual[key] < minimum) throw new Error(`Insufficient fixture coverage: ${scenario.name} / ${key}`);
    }
}

function runCase(bundle, scenario, out, fixtures) {
    const options = { hours: 1, players: 5, zone: '/actions/combat/pirate_cove', tier: 2, seed: 1, ...scenario.options };
    const argv = [path.join(__dirname, 'run.cjs'), '--input', path.join(fixtures, scenario.fixture),
        '--bundle', bundle, '--reuse', '--runs', '1', '--warmups', '0', '--out', out, '--metrics'];
    for (const [key, value] of Object.entries(options)) {
        if (typeof value === 'boolean') { if (value) argv.push(`--${key}`); }
        else argv.push(`--${key}`, typeof value === 'object' ? JSON.stringify(value) : String(value));
    }
    // Separate processes prevent a candidate's onmessage or module state from
    // silently replacing the reference's worker handler in the same JS global.
    const child = spawnSync(process.execPath, argv, { cwd: root, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
    if (child.error || child.status !== 0) throw new Error(child.error?.message || child.stderr || `Benchmark failed: ${scenario.name}`);
    const report = JSON.parse(fs.readFileSync(out + '.json', 'utf8')).reports[0];
    const result = JSON.parse(fs.readFileSync(out + '.result.json', 'utf8'));
    return { report, result };
}

async function main() {
    const { values } = parseArgs({ options: {
        reference: { type: 'string' }, candidate: { type: 'string', default: 'parity-current' },
        reuse: { type: 'boolean', default: false }, 'record-golden': { type: 'boolean', default: false },
        suite: { type: 'string', default: path.join(root, 'tests/fixtures/combat') },
    } });
    const fixtures = path.resolve(values.suite);
    const goldenFile = path.join(fixtures, 'js-reference.expected.json');
    if (!values.reference) throw new Error('Pass --reference a-frozen-reference-name');
    validateName(values.candidate);
    const reference = loadReference(values.reference);
    if (values.reference === values.candidate) throw new Error('Reference and candidate must be different bundles');
    if (fs.existsSync(path.join(root, '.bench', `${values.candidate}.manifest.json`))) {
        throw new Error('Candidate must not be a frozen reference');
    }
    if (values['record-golden'] && fs.existsSync(goldenFile)) throw new Error('Golden already exists; it is not automatically overwritten');
    const scenarioBytes = fs.readFileSync(path.join(fixtures, 'scenarios.json'));
    const scenarios = JSON.parse(scenarioBytes);
    if (!Array.isArray(scenarios) || !scenarios.length || new Set(scenarios.map(s => s.name)).size !== scenarios.length) {
        throw new Error('Scenario suite must be nonempty and have unique names');
    }
    for (const scenario of scenarios) {
        validateName(scenario.name);
        if (path.basename(scenario.fixture) !== scenario.fixture || scenario.fixture.includes('\\')) throw new Error('Invalid fixture filename');
    }
    const fixtureHashes = Object.fromEntries([...new Set(scenarios.map(s => s.fixture))].sort()
        .map(file => [file, sha256(fs.readFileSync(path.join(fixtures, file)))]));
    const identity = { normalizationVersion: NORMALIZATION_VERSION, rngVersion: RNG_VERSION, engineSourceSha256: reference.engineSourceSha256,
        gameDataSha256: reference.gameDataSha256, scenariosSha256: sha256(scenarioBytes), fixtureHashes };
    const golden = values['record-golden'] ? null : JSON.parse(fs.readFileSync(goldenFile, 'utf8'));
    if (golden && JSON.stringify(golden.identity) !== JSON.stringify(identity)) {
        throw new Error('Golden inputs/data/reference differ; do not bless changed results automatically');
    }
    if (!values.reuse) await buildBundle(`${values.candidate}.cjs`);
    const directory = path.join(root, '.bench/parity', `${values.reference}--${values.candidate}`);
    fs.mkdirSync(directory, { recursive: true });
    const reports = [];
    const expected = {};
    for (const scenario of scenarios) {
        const before = runCase(values.reference, scenario, path.join(directory, scenario.name + '-reference'), fixtures);
        const after = runCase(values.candidate, scenario, path.join(directory, scenario.name + '-candidate'), fixtures);
        assertCoverage(scenario, before.result);
        expected[scenario.name] = { canonicalHash: resultHash(before.result), randomCalls: before.report.randomCalls };
        if (golden && JSON.stringify(golden.scenarios[scenario.name]) !== JSON.stringify(expected[scenario.name])) {
            throw new Error(`Frozen JS no longer matches the recorded result: ${scenario.name}`);
        }
        const difference = compareResults(before.result, after.result);
        const rngMatches = before.report.randomCalls === after.report.randomCalls;
        const eventsMatch = compareResults(before.report.events, after.report.events) === null;
        const report = { name: scenario.name, match: !difference && rngMatches && eventsMatch,
            canonicalHash: expected[scenario.name].canonicalHash, randomCalls: before.report.randomCalls,
            candidateRandomCalls: after.report.randomCalls, difference, eventsMatch,
            referenceMs: before.report.elapsedMs, candidateMs: after.report.elapsedMs,
            completed: before.result.dungeonsCompleted, failed: before.result.dungeonsFailed,
            labyrinthAttempts: before.result.labyAttemptCount, timeSeriesSamples: before.result.timeSeriesData?.timestamps?.length,
            events: before.report.events, maxQueue: before.report.maxQueue };
        reports.push(report);
        console.log(JSON.stringify({ name: report.name, match: report.match, randomCalls: report.randomCalls,
            difference, rngMatches, eventsMatch }));
        if (!report.match) {
            fs.writeFileSync(path.join(directory, 'summary.json'), JSON.stringify({ identity, reports }, null, 2));
            throw new Error(`Simulation differs at ${scenario.name}; inspect ignored local reports`);
        }
    }
    if (values['record-golden']) fs.writeFileSync(goldenFile, JSON.stringify({ schemaVersion: 1, identity, scenarios: expected }, null, 2) + '\n', { flag: 'wx' });
    fs.writeFileSync(path.join(directory, 'summary.json'), JSON.stringify({ identity, reports }, null, 2) + '\n');
    console.log(`All ${reports.length} public scenarios match the frozen JS reference.`);
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
