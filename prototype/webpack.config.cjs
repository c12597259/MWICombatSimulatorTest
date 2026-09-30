const path = require('node:path');
const CopyPlugin = require('copy-webpack-plugin');
const root = path.resolve(__dirname, '..');
module.exports = { mode: 'production', context: root, devtool: false,
    entry: './prototype/main.js',
    output: { path: path.join(root, '.wasm-build/browser'), filename: 'prototype.js',
        chunkFilename: '[name].[contenthash:12].js', assetModuleFilename: 'assets/[name].[contenthash:12][ext]', publicPath: 'auto' },
    module: { rules: [{ oneOf: [{ test: /\.wasm$/, type: 'asset/resource' }, { resourceQuery: /asset/, type: 'asset/resource' }] }] },
    plugins: [new CopyPlugin({ patterns: [ { from: 'prototype/index.html', to: 'index.html' },
        { from: 'rust/THIRD-PARTY-NOTICES.md', to: 'THIRD-PARTY-NOTICES.md' } ] })],
    performance: { hints: false } };
