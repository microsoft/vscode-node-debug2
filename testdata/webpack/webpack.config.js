const webpack = require('webpack');
const path = require('path');
const fs = require('fs');
const glob = require('glob');

const nodeModules = {};
fs.readdirSync('node_modules')
  .filter(f => !f.startsWith('bin'))
  .forEach(mod => {
    nodeModules[mod] = 'commonjs ' + mod;
  });

module.exports = {
    entry: {
        src: './app.ts'
    },
    devtool: 'source-map',
    resolve: {
        extensions: ['.ts']
    },
    output: {
        filename: 'out/bundle.js'
    },
    module: {
        rules: [
            { test: /\.ts$/, exclude: /node_modules/, loader: 'ts-loader' },
        ]
    },
    externals: nodeModules,
    target: 'node'
};
