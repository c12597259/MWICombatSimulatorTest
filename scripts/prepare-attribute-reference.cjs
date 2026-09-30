const fs = require('node:fs');
const path = require('node:path');
const webpack = require('webpack');
const { root } = require('./rust-tools.cjs');
const { loadReference, sha256 } = require('../bench/lib/reference.cjs');

function compile(config) {
    return new Promise((resolve, reject) => {
        const compiler = webpack(config);
        compiler.run((error, stats) => compiler.close(closeError => {
            if (error || closeError || !stats || stats.hasErrors()) reject(error || closeError || new Error(stats?.toString({ all: false, errors: true })));
            else resolve(stats.toJson({ all: false, modules: true, nestedModules: true }).modules);
        }));
    });
}

async function prepare() {
    const reference = loadReference('js-reference-2783b09-p0');
    const archive = path.join(root, '.bench', reference.sourceArchive);
    for (const { file, sha256: expected } of [...reference.files.engine, ...reference.files.data]) {
        if (sha256(fs.readFileSync(path.join(archive, file))) !== expected) throw new Error(`Frozen source changed: ${file}`);
    }
    const source = path.join(root, 'src');
    const modules = await compile({ mode: 'development', target: 'node', devtool: false, context: root,
        entry: './bench/attributesReference.js', output: { path: path.join(root, '.bench'), filename: 'attributes-reference.cjs', library: { type: 'commonjs2' } },
        plugins: [new webpack.NormalModuleReplacementPlugin(/.*/, resource => {
            const absolute = path.resolve(resource.context, resource.request);
            if (absolute.startsWith(source + path.sep)) resource.request = path.join(archive, 'src', path.relative(source, absolute));
        })] });
    const resources = [];
    const collect = entries => entries.forEach(entry => {
        if (entry.identifier) resources.push(entry.identifier);
        if (entry.modules) collect(entry.modules);
    });
    collect(modules);
    if (resources.some(file => file.startsWith(source + path.sep))) throw new Error('Attribute reference imported live src files');
    for (const file of ['combatsimulator/player.js', 'combatsimulator/monster.js', 'worker.js', 'guildCombatShrines.js']) {
        if (!resources.includes(path.join(archive, 'src', file))) throw new Error(`Frozen reference module not found: ${file}`);
    }
    await compile({ mode: 'development', target: 'node', devtool: false, context: root, entry: './bench/attributesCases.js',
        output: { path: path.join(root, '.bench'), filename: 'attributes-cases.cjs', library: { type: 'commonjs2' } } });
    globalThis.onmessage = () => {};
    globalThis.CustomEvent ??= class CustomEvent extends Event { constructor(type, options) { super(type); this.detail = options.detail; } };
    const { attributeTrace } = require('../.bench/attributes-reference.cjs');
    const { attributeGroups } = require('../.bench/attributes-cases.cjs');
    const groups = attributeGroups();
    const output = path.join(root, '.wasm-build/attributes');
    fs.mkdirSync(output, { recursive: true });
    const summary = {};
    for (const [name, cases] of Object.entries(groups)) {
        const expected = await attributeTrace(cases.map(item => item.request));
        const bytes = JSON.stringify({ name, cases, expected });
        fs.writeFileSync(path.join(output, name + '.json'), bytes);
        summary[name] = { cases: cases.length, frames: expected.reduce((sum, frames) => sum + frames.length, 0), sha256: sha256(bytes) };
    }
    const manifest = { schemaVersion: 1, phase: 'P2.1', engineSourceSha256: reference.engineSourceSha256,
        dataFingerprint: reference.gameDataSha256, groups: summary };
    fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2));
    console.log(JSON.stringify(manifest, null, 2));
    return manifest;
}
if (require.main === module) prepare().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { prepare };
