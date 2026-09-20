const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');

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
