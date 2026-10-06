const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { parseArgs } = require('node:util');
const { root, buildBundle } = require('./lib/build.cjs');
const { sha256, validateName, sourceIdentity } = require('./lib/reference.cjs');
const { RNG_VERSION } = require('./lib/seededRandom.cjs');

async function main() {
    const { values } = parseArgs({ options: { name: { type: 'string' } } });
    if (!values.name) throw new Error('Pass --name a-new-reference-name');
    const name = validateName(values.name);
    const output = path.join(root, '.bench');
    fs.mkdirSync(output, { recursive: true });
    const bundleFile = `${name}.cjs`;
    const manifestFile = path.join(output, `${name}.manifest.json`);
    const archive = path.join(output, `${name}.sources`);
    if ([path.join(output, bundleFile), manifestFile, archive].some(file => fs.existsSync(file))) {
        throw new Error('Reference already exists. Reuse it; choose a new name to freeze another version.');
    }
    const dirty = execFileSync('git', ['status', '--porcelain', '--', 'src', 'package-lock.json'], { cwd: root, encoding: 'utf8' });
    if (dirty.trim()) throw new Error('Commit or preserve engine/data edits before freezing a reference');
    const lock = path.join(output, `${name}.freeze.lock`);
    const fd = fs.openSync(lock, 'wx');
    try {
        const before = sourceIdentity();
        fs.mkdirSync(archive);
        for (const { file } of Object.values(before.files).flat()) {
            const destination = path.join(archive, file);
            fs.mkdirSync(path.dirname(destination), { recursive: true });
            fs.copyFileSync(path.join(root, file), destination, fs.constants.COPYFILE_EXCL);
        }
        fs.copyFileSync(path.join(root, 'package-lock.json'), path.join(archive, 'package-lock.json'), fs.constants.COPYFILE_EXCL);
        await buildBundle(bundleFile);
        const after = sourceIdentity();
        if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('Sources changed during snapshot creation');
        const manifest = {
            schemaVersion: 1, name, createdAt: new Date().toISOString(), ...before,
            rngVersion: RNG_VERSION,
            node: process.version, webpack: require('webpack/package.json').version,
            heapJs: JSON.parse(fs.readFileSync(path.join(root, 'node_modules/heap-js/package.json'))).version,
            build: { mode: 'development', target: 'node', entry: 'bench/entry.js' },
            bundleFile, bundleSha256: sha256(fs.readFileSync(path.join(output, bundleFile))),
            sourceArchive: `${name}.sources`,
        };
        fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
        console.log(JSON.stringify({ reference: name, baseCommit: before.baseCommit, engineSourceSha256: before.engineSourceSha256,
            gameDataSha256: before.gameDataSha256, bundleSha256: manifest.bundleSha256 }));
    } finally {
        fs.closeSync(fd);
        fs.unlinkSync(lock);
    }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
