const fs = require('node:fs');
const path = require('node:path');
const { sha256, sourceIdentity } = require('../bench/lib/reference.cjs');
const { root } = require('./rust-tools.cjs');

function prepareData() {
    const identity = sourceIdentity();
    const definitions = {};
    for (const { file } of identity.files.data) {
        definitions[path.basename(file, '.json')] = JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
    }
    const bytes = JSON.stringify({ schemaVersion: 1, sourceSha256: identity.gameDataSha256, definitions });
    const output = path.join(root, '.wasm-build/data');
    fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(path.join(output, 'combat-data.json'), bytes);
    return { schemaVersion: 1, generatorVersion: 1, interfaceVersion: 1,
        rngVersion: 'mulberry32-js-number-v1', dataFingerprint: identity.gameDataSha256,
        dataAssetSha256: sha256(bytes), definitionCount: Object.keys(definitions).length,
        sourceFiles: identity.files.data };
}

if (require.main === module) console.log(JSON.stringify(prepareData(), null, 2));
module.exports = { prepareData };
