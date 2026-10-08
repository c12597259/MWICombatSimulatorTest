const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');
module.exports = (env, argv = {}) => ({
  entry: {
    main: { import: './src/main.js', filename: 'bundle.js' },
    labyrinth: { import: './src/labyrinthWorker.js', filename: 'labyrinth-worker.js', publicPath: '', chunkLoading: 'import-scripts' },
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'bundle.js',
    chunkFilename: '[name].[contenthash:12].js',
    assetModuleFilename: 'assets/[name].[contenthash:12][ext]',
    publicPath: 'auto',
    clean: true,
  },
  mode: argv.mode || 'development',
  module: { rules: [{ oneOf: [
    { test: /\.wasm$/, type: 'asset/resource' },
    { resourceQuery: /asset/, type: 'asset/resource' },
  ] }] },
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
    new CopyWebpackPlugin({
      patterns: [
        { from: path.resolve(__dirname, 'patchNote.json'), to: 'patchNote.json' },
        { from: path.resolve(__dirname, 'rust/THIRD-PARTY-NOTICES.md'), to: 'THIRD-PARTY-NOTICES.md' },
        { from: path.resolve(__dirname, 'index.html'), to: 'index.html' }, // Correctly copy to dist/index.html
        { from: path.resolve(__dirname, 'js'), to: 'js' },
        { from: path.resolve(__dirname, 'locales'), to: 'locales' },
        // Preserve Tampermonkey metadata headers in production builds.
        { from: path.resolve(__dirname, 'userscripts'), to: 'userscripts', info: { minimized: true } }
      ],
    }),
  ],
});
