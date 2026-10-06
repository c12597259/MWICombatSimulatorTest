const fs = require('node:fs');
const path = require('node:path');
const { root } = require('./rust-tools.cjs');
const { compile, compileFrozen } = require('./prepare-attribute-reference.cjs');
const { sha256, loadReference } = require('../bench/lib/reference.cjs');

async function prepare() {
    const version = loadReference('js-reference-2783b09-p0').node;
    if (process.version !== version || process.versions.v8 !== '10.2.154.26-node.26')
        throw new Error(`Generate the P2.2 oracle with frozen Node ${version} / V8 10.2.154.26-node.26; browser-native pow is audited separately`);
    const frozen = await compileFrozen('./bench/encountersReference.js', 'encounters-reference.cjs');
    await compile({ mode: 'development', target: 'node', devtool: false, context: root, entry: './bench/encountersCases.js',
        output: { path: path.join(root, '.bench'), filename: 'encounters-cases.cjs', library: { type: 'commonjs2' } } });
    globalThis.onmessage = () => {};
    const { encounterTrace, mathTrace } = require('../.bench/encounters-reference.cjs');
    const { encounterGroups, mathCases } = require('../.bench/encounters-cases.cjs');
    const output = path.join(root, '.wasm-build/encounters'); fs.mkdirSync(output, { recursive: true });
    const groups = encounterGroups(), summary = {};
    for (const [name, cases] of Object.entries(groups)) {
        const expected = await encounterTrace(cases.map(value => value.request));
        const bytes = JSON.stringify({ name, cases, expected });
        const eventCounts = {}, operations = {};
        for (const frames of expected) for (const frame of frames) {
            eventCounts[frame.event.type] = (eventCounts[frame.event.type] || 0) + 1;
            for (const op of frame.operations) operations[op[0]] = (operations[op[0]] || 0) + 1;
        }
        fs.writeFileSync(path.join(output, name + '.json'), bytes);
        summary[name] = { cases: cases.length, frames: expected.reduce((sum, frames) => sum + frames.length, 0), sha256: sha256(bytes), eventCounts, operations };
        console.log(`${name}: ${summary[name].cases} cases / ${summary[name].frames} event frames`);
    }
    const cases = mathCases(), expected = mathTrace(cases), bytes = JSON.stringify({ name: 'math', cases, expected });
    fs.writeFileSync(path.join(output, 'math.json'), bytes);
    const manifest = { schemaVersion: 1, phase: 'P2.2', engineSourceSha256: frozen.engineSourceSha256, dataFingerprint: frozen.gameDataSha256,
        referenceRuntime: { node: process.version, v8: process.versions.v8 }, math: { cases: cases.length, sha256: sha256(bytes) }, groups: summary };
    fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2));
    const coverage = require('./encounter-coverage.cjs').audit(output, manifest);
    console.log(`Coverage: ${coverage.eventKinds} executed event kinds; promotion and DOT after source death verified`);
    return manifest;
}
if (require.main === module) prepare().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { prepare };
