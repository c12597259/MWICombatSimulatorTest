const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { root } = require('./build.cjs');

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function validateName(name) {
    if (!/^[\w-]+$/.test(name)) throw new Error('Invalid bundle name');
    return name;
}

function listFiles(directory, extension) {
    return fs.readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap(entry => {
        const relative = `${directory}/${entry.name}`;
        return entry.isDirectory() ? listFiles(relative, extension) : relative.endsWith(extension) ? [relative] : [];
    }).sort();
}

function fileRecords(files) {
    return files.map(file => ({ file, sha256: sha256(fs.readFileSync(path.join(root, file))) }));
}

function sourceIdentity() {
    const engine = fileRecords([...listFiles('src/combatsimulator', '.js'),
        'src/worker.js', 'src/parsePlayerJson.js', 'src/guildCombatShrines.js'].sort());
    const data = fileRecords(listFiles('src/combatsimulator/data', '.json'));
    const harness = fileRecords([...listFiles('bench', '.cjs'), ...listFiles('bench', '.js')].sort());
    return {
        baseCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
        engineSourceSha256: sha256(JSON.stringify(engine)), gameDataSha256: sha256(JSON.stringify(data)),
        harnessSha256: sha256(JSON.stringify(harness)),
        dependencyLockSha256: sha256(fs.readFileSync(path.join(root, 'package-lock.json'))),
        files: { engine, data, harness },
    };
}

function loadReference(name) {
    validateName(name);
    const filename = path.join(root, '.bench', `${name}.manifest.json`);
    const manifest = JSON.parse(fs.readFileSync(filename, 'utf8'));
    if (manifest.schemaVersion !== 1 || manifest.name !== name || manifest.bundleFile !== `${name}.cjs`) {
        throw new Error('Invalid frozen reference manifest');
    }
    const actual = sha256(fs.readFileSync(path.join(root, '.bench', manifest.bundleFile)));
    if (actual !== manifest.bundleSha256) throw new Error('Frozen reference bundle has changed');
    return manifest;
}

module.exports = { sha256, validateName, sourceIdentity, loadReference, listFiles };
