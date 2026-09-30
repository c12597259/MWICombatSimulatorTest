const fs = require('node:fs');
const path = require('node:path');
const webpack = require('webpack');
const { root } = require('./rust-tools.cjs');
const { build } = require('./build-combat-wasm.cjs');

(async () => {
    const ready = path.join(root, '.wasm-build/browser-ready.json');
    if (fs.existsSync(ready)) fs.unlinkSync(ready);
    build();
    await new Promise((resolve, reject) => {
        const compiler = webpack(require('../prototype/webpack.config.cjs'));
        compiler.run((error, stats) => compiler.close(closeError => {
            if (error || closeError || !stats || stats.hasErrors()) reject(error || closeError || new Error(stats?.toString({ all: false, errors: true })));
            else { console.log(stats.toString({ all: false, assets: true, warnings: true })); resolve(); }
        }));
    });
    const manifest = JSON.parse(fs.readFileSync(path.join(root, '.wasm-build/manifest.json')));
    fs.writeFileSync(ready, JSON.stringify({ wasmSha256: manifest.artifacts['combat_wasm_bg.wasm'], dataFingerprint: manifest.dataFingerprint }));
})().catch(error => { console.error(error); process.exitCode = 1; });
