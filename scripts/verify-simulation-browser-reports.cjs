const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {root}=require('./rust-tools.cjs');
const {sha256,loadReference}=require('../bench/lib/reference.cjs');
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file)));
const manifest=read('.wasm-build/manifest.json'),ready=read('.wasm-build/browser-ready.json');
const reference=read('.wasm-build/simulations/manifest.json'),frozen=loadReference('js-reference-2783b09-p0');
assert.equal(reference.engineSourceSha256,frozen.engineSourceSha256);assert.equal(reference.dataFingerprint,manifest.dataFingerprint);
assert.equal(reference.dataFingerprint,frozen.gameDataSha256);assert.equal(reference.referenceRuntime.node,frozen.node);
assert.equal(reference.referenceRuntime.v8,'10.2.154.26-node.26');
const wasmHash=sha256(fs.readFileSync(path.join(root,'.wasm-build/pkg/combat_wasm_bg.wasm')));
assert.equal(wasmHash,manifest.artifacts['combat_wasm_bg.wasm']);assert.equal(wasmHash,ready.wasmSha256);
assert.deepEqual(read('.wasm-build/browser/simulation-reference/manifest.json'),reference);
for(const spec of [...reference.cases,...reference.traces])for(const location of ['.wasm-build/simulations','.wasm-build/browser/simulation-reference']){
    assert.equal(sha256(fs.readFileSync(path.join(root,location,spec.file))),spec.sha256);
}
const total=reference.cases.reduce((sum,spec)=>sum+spec.events,0);
for(const [filename,pathname,prefix]of[['browser-root.json','/simulations.html','/'],['browser-pages.json','/MWICombatSimulatorTest/dist/simulations.html','/MWICombatSimulatorTest/dist/']]){
    const file=path.join(root,'.bench/rust-wasm-p2-simulations',filename),report=JSON.parse(fs.readFileSync(file));
    assert.ok(fs.statSync(file).mtimeMs>=fs.statSync(path.join(root,'.wasm-build/browser-ready.json')).mtimeMs,'Rerun browser after latest build');
    assert.equal(report.schemaVersion,1);assert.equal(report.phase,'P2.3');assert.equal(report.path,pathname);
    assert.equal(report.passed,true);assert.equal(report.tests.length,43);assert.equal(new Set(report.tests.map(item=>item.name)).size,43);
    assert.ok(report.tests.every(item=>item.passed===true));assert.deepEqual(report.cases,reference.cases);
    assert.equal(report.results.length,reference.cases.length);
    for(let index=0;index<reference.cases.length;index++){
        const expected=read('.wasm-build/simulations/'+reference.cases[index].file).expected,actual=report.results[index];
        assert.equal(actual.name,reference.cases[index].name);assert.equal(actual.exact,true);assert.equal(actual.events,expected.processed);assert.equal(actual.randomCalls,expected.randomCalls);
    }
    assert.equal(report.wasmSha256,wasmHash);assert.equal(report.dataFingerprint,manifest.dataFingerprint);
    for(const stats of[report.stats,report.finalStats]){
        assert.equal(stats.moduleInitCount,1);assert.equal(stats.engineInitCount,1);assert.equal(stats.dataFetchCount,1);
        assert.equal(stats.liveSimulations,0);assert.equal(stats.liveEncounters,0);assert.equal(stats.liveProbes,0);
        assert.equal(stats.module.dataFingerprint,manifest.dataFingerprint);
        for(const url of Object.values(stats.assets)){const resource=new URL(url);assert.equal(resource.hostname,'127.0.0.1');assert.ok(resource.pathname.startsWith(prefix+'assets/'));}
    }
    assert.equal(report.stats.liveEngines,1);assert.equal(report.finalStats.liveEngines,0);
    const timing=report.performance;assert.equal(timing.case,'dungeon-seed7');assert.equal(timing.hours,2);assert.equal(timing.players,5);
    for(const kind of['js','wasm']){assert.equal(timing.warm[kind].length,5);assert.ok(timing.warm[kind].every(value=>Number.isFinite(value)&&value>0));assert.ok(timing.cold[kind].endToEndMs>0);}
    assert.equal(timing.speedup,timing.medianJsMs/timing.medianWasmMs);
    console.log(`${filename}: 43/43 passed; ${reference.cases.length} cases / ${total} events; browser native JS and WASM exact; warm speedup ${timing.speedup.toFixed(2)}x`);
}
