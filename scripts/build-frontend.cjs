const webpack = require('webpack');
const { build } = require('./build-combat-wasm.cjs');
build();
const mode = process.argv.includes('--production') ? 'production' : 'development';
const compiler = webpack(require('../webpack.config.js')({}, { mode }));
compiler.run((error, stats) => compiler.close(closeError => {
    if (error || closeError || !stats || stats.hasErrors()) {
        console.error(error || closeError || stats?.toString({ all: false, errors: true }));
        process.exitCode = 1;
    } else console.log(stats.toString({ all: false, assets: true, warnings: true }));
}));
