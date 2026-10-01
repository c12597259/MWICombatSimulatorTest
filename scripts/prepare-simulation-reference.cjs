const fs = require('node:fs');
const path = require('node:path');
const { root } = require('./rust-tools.cjs');
const { compile, compileFrozen } = require('./prepare-attribute-reference.cjs');
const { loadReference, sha256 } = require('../bench/lib/reference.cjs');
const { compareResults } = require('../bench/lib/resultComparison.cjs');
async function prepare() {
    const reference = loadReference('js-reference-2783b09-p0');
    if (process.version !== reference.node || process.versions.v8 !== '10.2.154.26-node.26') throw new Error('Generate simulation oracle with frozen Node 18.16.1 / V8 10.2.154.26-node.26');
    await compileFrozen('./bench/simulationsReference.js', 'simulations-reference.cjs');
    await compile({ mode: 'development', target: 'node', devtool: false, context: root, entry: './bench/simulationsCases.js',
        output: { path: path.join(root, '.bench'), filename: 'simulations-cases.cjs', library: { type: 'commonjs2' } } });
    globalThis.onmessage = () => {};
    globalThis.CustomEvent ??= class CustomEvent extends Event { constructor(type, options) { super(type); this.detail = options.detail; } };
    const { simulationReference } = require('../.bench/simulations-reference.cjs');
    const frozen = require('../.bench/js-reference-2783b09-p0.cjs'), p0Handler = globalThis.onmessage;
    const cases = require('../.bench/simulations-cases.cjs').simulationCases(), output = path.join(root, '.wasm-build/simulations');
    fs.mkdirSync(output, { recursive: true }); const summary = [];
    for (const item of cases) {
        const expected = await simulationReference(item.request);
        if (summary.length < 9) {
            globalThis.onmessage = p0Handler;
            // The P0 bundle exports the real worker handler; requiring it once initializes onmessage.
            const team = require('../tests/fixtures/combat/' + (item.name === 'dungeon-wipes' ? 'synthetic-weak.json' : 'synthetic-party.json'));
            const oldRandom = Math.random, oldLog = console.log;
            const rng = require('../bench/lib/seededRandom.cjs').seededRandom(item.request.seed);
            let actual;
            try { Math.random = rng; console.log = () => {}; actual = await frozen.run(team, { ...item.options, metrics: true }); }
            finally { Math.random = oldRandom; console.log = oldLog; }
            if (compareResults(expected.result, actual.result) || rng.count() !== expected.randomCalls || compareResults(expected.events, actual.events)) throw new Error(`New reference wrapper does not match immutable P0 bundle: ${item.name}`);
        }
        const bytes = JSON.stringify({ ...item, expected }); const filename = `${summary.length}.json`;
        fs.writeFileSync(path.join(output, filename), bytes); summary.push({ name: item.name, file: filename, sha256: sha256(bytes), events: expected.processed });
        console.log(`${item.name}: ${expected.processed} events / ${expected.randomCalls} random draws`);
    }
    const traces=[];
    for(const [index,startEvent,maxEvents] of [[0,0,80],[1,730,30],[1,1000,30],[2,0,30],[3,1000,20],[5,100,80]]){
        const input={input:cases[index].request,startEvent,maxEvents};const expected=await simulationReference(input.input,maxEvents,startEvent);
        const bytes=JSON.stringify({name:cases[index].name,input,expected}),file=`trace-${traces.length}.json`;
        fs.writeFileSync(path.join(output,file),bytes);traces.push({name:cases[index].name,file,sha256:sha256(bytes),frames:expected.length,startEvent});
    }
    // Browser JS uses the current source, so require that its engine bytes still
    // match the frozen reference before claiming this is a runtime-only audit.
    for(const {file,sha256:expected}of[...reference.files.engine,...reference.files.data]){
        if(sha256(fs.readFileSync(path.join(root,file)))!==expected)throw new Error(`Live browser JS differs from frozen source: ${file}`);
    }
    const manifest = { schemaVersion: 1, phase: 'P2.3', engineSourceSha256: reference.engineSourceSha256, dataFingerprint: reference.gameDataSha256,
        referenceRuntime: { node: process.version, v8: process.versions.v8 }, cases: summary,traces };
    fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2)); return manifest;
}
if (require.main === module) prepare().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { prepare };
