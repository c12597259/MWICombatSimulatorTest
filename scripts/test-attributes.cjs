const { run } = require('./rust-tools.cjs');
const { prepare } = require('./prepare-attribute-reference.cjs');
(async () => {
    await prepare();
    run('cargo', ['build', '--manifest-path', 'rust/Cargo.toml', '--package', 'mwi-combat-cli', '--release', '--locked']);
    run(process.execPath, ['--test', 'tests/combatAttributes.test.cjs']);
})().catch(error => { console.error(error); process.exitCode = 1; });
