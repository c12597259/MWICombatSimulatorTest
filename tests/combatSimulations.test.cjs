const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const {root}=require('../scripts/rust-tools.cjs');
const {sha256,loadReference}=require('../bench/lib/reference.cjs');
const {compareSimulation,firstEventDifference}=require('../bench/lib/simulationComparison.cjs');
test('P2.3 complete continuous simulations',async t=>{
    const read=file=>JSON.parse(fs.readFileSync(path.join(root,file)));
    const manifest=read('.wasm-build/manifest.json'),reference=read('.wasm-build/simulations/manifest.json'),frozen=loadReference('js-reference-2783b09-p0');
    assert.equal(reference.engineSourceSha256,frozen.engineSourceSha256);assert.equal(reference.dataFingerprint,manifest.dataFingerprint);
    const wasmBytes=fs.readFileSync(path.join(root,'.wasm-build/pkg/combat_wasm_bg.wasm'));assert.equal(sha256(wasmBytes),manifest.artifacts['combat_wasm_bg.wasm']);
    const wasm=await import(`data:text/javascript;base64,${fs.readFileSync(path.join(root,'.wasm-build/pkg/combat_wasm.js')).toString('base64')}`);
    await wasm.default({module_or_path:wasmBytes});const dataPath=path.join(root,'.wasm-build/data/combat-data.json');
    const engine=new wasm.PrototypeEngine(fs.readFileSync(dataPath,'utf8'),manifest.dataFingerprint);t.after(()=>engine.free());
    const native=(mode,input)=>{
        const child=spawnSync(path.join(root,'rust/target/release/mwi-combat-cli.exe'),[mode,dataPath,manifest.dataFingerprint],{input:JSON.stringify([input]),encoding:'utf8',maxBuffer:128*1024*1024});
        assert.equal(child.status,0,child.stderr||child.error?.message);return JSON.parse(child.stdout)[0];
    };
    const load=spec=>{const bytes=fs.readFileSync(path.join(root,'.wasm-build/simulations',spec.file));assert.equal(sha256(bytes),spec.sha256);return JSON.parse(bytes);};
    for(const spec of reference.cases){const item=load(spec);
        for(const backend of ['rust','wasm'])await t.test(`${item.name} / ${backend}`,()=>{
            const actual=backend==='rust'?native('simulations',item.request):JSON.parse(engine.simulate(JSON.stringify(item.request)));
            assert.equal(compareSimulation(item.expected,actual),null,item.name);
            for(const [key,min]of Object.entries(item.minimumCoverage || {})){
                const amount={respawns:actual.events.playerRespawn || 0,completed:actual.result.dungeonsCompleted,failed:actual.result.dungeonsFailed,wipeEvents:actual.result.wipeEvents.length,labyrinthAttempts:actual.result.labyAttemptCount,timeSeriesSamples:actual.result.timeSeriesData.timestamps.length}[key];
                assert.ok(amount>=min,`${key} coverage`);
            }
        });
    }
    for(const spec of reference.traces){const item=load(spec);
        for(const backend of ['rust','wasm'])await t.test(`${item.name}: events ${spec.startEvent+1}..${spec.startEvent+spec.frames} / ${backend}`,()=>{
            const actual=backend==='rust'?native('simulationTraces',item.input):JSON.parse(engine.simulation_trace(JSON.stringify(item.input)));
            assert.equal(firstEventDifference(item.expected,actual,spec.startEvent),null);
        });
    }
    const sample=load(reference.cases[0]);
    await t.test('chunks 1 / 7 / 1000 preserve progress, full stats and lifecycle',()=>{
        for(const chunk of [1,7,1000]){
            const probe=engine.create_simulation(JSON.stringify(sample.request));let previous=0;
            try {
                assert.equal(wasm.live_simulations(),1);assert.throws(()=>probe.result());assert.throws(()=>probe.advance(0));assert.throws(()=>probe.advance(10001));
                while(!probe.done()){const progress=JSON.parse(probe.advance(chunk));assert.ok(progress.processed>previous);previous=progress.processed;assert.ok(progress.progress>=0&&progress.progress<=1);}
                assert.equal(compareSimulation(sample.expected,JSON.parse(probe.result())),null);
                const last=JSON.parse(probe.advance(chunk));assert.equal(last.processed,previous);assert.equal(last.progress,1);
            }finally{probe.free();}assert.equal(wasm.live_simulations(),0);
        }
    });
    await t.test('input failures release all handles and later simulations recover',()=>{
        for(const change of [{timeLimit:0},{timeLimit:Infinity},{zone:null,labyrinth:null},{zone:{hrid:'/missing',difficultyTier:0}},{players:[]},{labyrinth:{hrid:'/missing',roomLevel:1},zone:null}]){
            assert.throws(()=>engine.create_simulation(JSON.stringify({...sample.request,...change})));assert.equal(wasm.live_simulations(),0);
        }
        assert.equal(compareSimulation(sample.expected,JSON.parse(engine.simulate(JSON.stringify(sample.request)))),null);
    });
    await t.test('run owns definitions after engine release',()=>{
        const other=new wasm.PrototypeEngine(fs.readFileSync(dataPath,'utf8'),manifest.dataFingerprint),probe=other.create_simulation(JSON.stringify(sample.request));other.free();
        try{while(!probe.done())probe.advance(1000);assert.equal(compareSimulation(sample.expected,JSON.parse(probe.result())),null);}finally{probe.free();}
        assert.equal(wasm.live_simulations(),0);
    });
    await t.test('diagnostic reports the first changed event and RNG state',()=>{
        const item=load(reference.traces[0]),actual=structuredClone(item.expected);actual[3].randomCalls++;actual[7].randomCalls++;
        const diff=firstEventDifference(item.expected,actual);assert.equal(diff.eventIndex,4);assert.equal(diff.path,'$["randomCalls"]');assert.deepEqual(diff.expectedEvent,item.expected[3].event);
        assert.equal(diff.expectedRandomCalls,item.expected[3].randomCalls);assert.deepEqual(diff.previousEvent,item.expected[2].event);
    });
});
