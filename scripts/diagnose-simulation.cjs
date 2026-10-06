const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { root } = require('./rust-tools.cjs');
const { firstEventDifference } = require('../bench/lib/simulationComparison.cjs');
async function diagnose(index = 0, startEvent = 0, maxEvents = 100) {
    globalThis.onmessage = () => {};
    globalThis.CustomEvent ??= class CustomEvent extends Event { constructor(type, options) { super(type); this.detail = options.detail; } };
    const { simulationReference } = require('../.bench/simulations-reference.cjs');
    const item = JSON.parse(fs.readFileSync(path.join(root, '.wasm-build/simulations', index + '.json')));
    const manifest = JSON.parse(fs.readFileSync(path.join(root, '.wasm-build/manifest.json')));
    const expected = await simulationReference(item.request, maxEvents, startEvent);
    const child = spawnSync(path.join(root, 'rust/target/release/mwi-combat-cli.exe'), ['simulationTraces', path.join(root, '.wasm-build/data/combat-data.json'), manifest.dataFingerprint],
        { input: JSON.stringify([{ input: item.request, maxEvents, startEvent }]), encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
    if (child.status !== 0) throw new Error(child.stderr || child.error?.message);
    const actual = JSON.parse(child.stdout)[0], difference = firstEventDifference(expected, actual, startEvent);
    const report = { case: item.name, startEvent, maxEvents, difference };
    if (difference) {
        const event = difference.eventIndex - startEvent - 1;
        fs.writeFileSync(path.join(root, '.bench/simulation-first-difference.json'), JSON.stringify({ ...report, expected: expected[event], actual: actual[event] }));
    }
    console.log(JSON.stringify(report)); return report;
}
if (require.main === module) diagnose(...process.argv.slice(2).map(Number)).catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { diagnose };
