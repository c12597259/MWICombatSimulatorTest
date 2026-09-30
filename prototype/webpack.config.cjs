const path = require('node:path');
const CopyPlugin = require('copy-webpack-plugin');
const root = path.resolve(__dirname, '..');
module.exports = { mode: 'production', context: root, devtool: false,
    entry: { prototype: './prototype/main.js', attributes: './prototype/attributes.js' },
    output: { path: path.join(root, '.wasm-build/browser'), filename: '[name].js',
        chunkFilename: '[name].[contenthash:12].js', assetModuleFilename: 'assets/[name].[contenthash:12][ext]', publicPath: 'auto' },
    module: { rules: [{ oneOf: [{ test: /\.wasm$/, type: 'asset/resource' }, { resourceQuery: /asset/, type: 'asset/resource' }] }] },
    plugins: [new CopyPlugin({ patterns: [ { from: 'prototype/index.html', to: 'index.html' },
        { from: 'rust/THIRD-PARTY-NOTICES.md', to: 'THIRD-PARTY-NOTICES.md' },
        { from: 'prototype/attributes.html', to: 'attributes.html' },
        { from: '.wasm-build/attributes', to: 'attribute-reference' } ] })],
    performance: { hints: false } };
