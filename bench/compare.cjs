const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { parseArgs } = require('node:util');
const { values } = parseArgs({ options: { input: { type: 'string' }, baseline: { type: 'string', default: 'baseline' }, current: { type: 'string', default: 'current' } } });
if (!values.input) throw new Error('Pass --input path/to/private/team.json');
const cases = [
    ['dungeon-seed7', ['--hours', '2', '--seed', '7']],
    ['dungeon-hpmp', ['--hours', '1', '--seed', '42', '--visualization']],
    ['dungeon-wipes', ['--hours', '1', '--players', '1']],
    ['planet-party', ['--hours', '1', '--players', '3', '--zone', '/actions/combat/aqua_planet', '--tier', '1']],
    ['planet-solo', ['--hours', '1', '--players', '1', '--zone', '/actions/combat/infernal_abyss', '--tier', '0']],
    ['labyrinth', ['--hours', '0.2', '--labyrinth', '/monsters/cyclops', '--room', '150', '--players', '1']],
];
const reports = [];
for (const [name, extra] of cases) {
    const results = [];
    for (const bundle of [values.baseline, values.current]) {
        const out = path.resolve('.bench', `${bundle}-${name}`);
        const child = spawnSync(process.execPath, [path.join(__dirname, 'run.cjs'), '--input', values.input,
            '--bundle', bundle, '--reuse', '--runs', '1', '--warmups', '0', '--out', out, ...extra], { encoding: 'utf8' });
        if (child.status !== 0) throw new Error(child.stderr || child.stdout);
        results.push(JSON.parse(fs.readFileSync(out + '.json', 'utf8')));
    }
    assert.equal(results[0].reports[0].hash, results[1].reports[0].hash, name + ': simulation changed');
    assert.equal(results[0].reports[0].randomCalls, results[1].reports[0].randomCalls, name + ': random stream changed');
    const report = { name, hash: results[0].reports[0].hash, beforeMs: results[0].medianMs, afterMs: results[1].medianMs };
    reports.push(report);
    console.log(JSON.stringify(report));
}
fs.writeFileSync('.bench/parity.json', JSON.stringify(reports, null, 2));
console.log('All six scenarios match the baseline exactly.');
