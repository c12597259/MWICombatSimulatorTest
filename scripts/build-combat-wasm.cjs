const fs = require('node:fs');
const path = require('node:path');
const { root, run, versions } = require('./rust-tools.cjs');
const { prepareData } = require('./prepare-combat-data.cjs');
const { sha256 } = require('../bench/lib/reference.cjs');

function build() {
    const manifestPath = path.join(root, '.wasm-build/manifest.json');
    const browserReady = path.join(root, '.wasm-build/browser-ready.json');
    if (fs.existsSync(browserReady)) fs.unlinkSync(browserReady);
    // Never leave a successful manifest next to a failed current build.
    if (fs.existsSync(manifestPath)) fs.unlinkSync(manifestPath);
    const tools = versions();
    const manifest = prepareData();
    run('wasm-pack', ['build', 'rust/combat-wasm', '--target', 'web', '--release',
        '--out-name', 'combat_wasm', '--out-dir', path.join(root, '.wasm-build/pkg'), '--', '--locked'],
    { env: { MWI_COMBAT_DATA_SHA: manifest.dataFingerprint } });
    const artifacts = ['combat_wasm.js', 'combat_wasm_bg.wasm', 'combat_wasm.d.ts', 'combat_wasm_bg.wasm.d.ts'];
    manifest.artifacts = Object.fromEntries(artifacts.map(file => [file, sha256(fs.readFileSync(path.join(root, '.wasm-build/pkg', file)))]));
    manifest.tools = tools;
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`WASM prototype built: ${manifest.definitionCount} definitions, ${manifest.dataFingerprint}`);
}

if (require.main === module) build();
module.exports = { build };
