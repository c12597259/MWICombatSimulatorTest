const { run } = require('./rust-tools.cjs');
(async()=>{
    await require('./prepare-simulation-reference.cjs').prepare({ requireLiveBrowserSource: false });
    run('cargo',['build','--manifest-path','rust/Cargo.toml','--package','mwi-combat-cli','--release','--locked']);
    run(process.execPath,['--test','tests/combatSimulations.test.cjs','tests/combatFocusTraining.test.cjs']);
})().catch(error=>{console.error(error);process.exitCode=1;});
