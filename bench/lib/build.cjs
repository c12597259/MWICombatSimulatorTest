const path = require('node:path');
const webpack = require('webpack');

const root = path.resolve(__dirname, '../..');

async function buildBundle(filename) {
    await new Promise((resolve, reject) => {
        const compiler = webpack({ mode: 'development', target: 'node', devtool: false,
            context: root, entry: path.join(root, 'bench/entry.js'),
            output: { path: path.join(root, '.bench'), filename, library: { type: 'commonjs2' } } });
        compiler.run((error, stats) => compiler.close(closeError => {
            if (error || closeError || !stats || stats.hasErrors()) {
                reject(error || closeError || new Error(stats?.toString({ all: false, errors: true }) || 'No webpack stats'));
            } else resolve();
        }));
    });
}

module.exports = { root, buildBundle };
