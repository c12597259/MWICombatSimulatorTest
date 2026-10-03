const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const webpack = require('webpack');
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');

function simulationBuildSources(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? simulationBuildSources(file) : /\.(js|json)$/.test(file) ? [file] : [];
  }).sort();
}

module.exports = (env, argv = {}) => ({
  entry: './src/main.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'bundle.js',
    clean: true,
  },
  mode: argv.mode || 'development',
  devtool: argv.mode === 'production' ? false : 'source-map',
  devServer: {
    static: {
      directory: path.join(__dirname, 'dist'),
    },
    compress: true,
    port: 9000,
    open: true,
  },
  plugins: [
    new webpack.DefinePlugin({
      __SIMULATION_EXPORT_BUILD__: webpack.DefinePlugin.runtimeValue(() => {
        const hash = createHash('sha256');
        for (const file of simulationBuildSources(path.join(__dirname, 'src'))) {
          hash.update(path.relative(__dirname, file).replaceAll('\\', '/'));
          hash.update('\0'); hash.update(fs.readFileSync(file)); hash.update('\0');
        }
        let commit = null;
        try { commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: __dirname, encoding: 'utf8', windowsHide: true }).trim(); } catch { /* Source archives may lack Git metadata. */ }
        return JSON.stringify({ commit, sourceSha256: hash.digest('hex'), builtAt: new Date().toISOString() });
      }, { contextDependencies: [path.join(__dirname, 'src')] }),
    }),
    new CopyWebpackPlugin({
      patterns: [
        { from: path.resolve(__dirname, 'patchNote.json'), to: 'patchNote.json' },
        { from: path.resolve(__dirname, 'index.html'), to: 'index.html' }, // Correctly copy to dist/index.html
        { from: path.resolve(__dirname, 'js'), to: 'js' },
        { from: path.resolve(__dirname, 'locales'), to: 'locales' },
        // Preserve Tampermonkey metadata headers in production builds.
        { from: path.resolve(__dirname, 'userscripts'), to: 'userscripts', info: { minimized: true } }
      ],
    }),
  ],
});
