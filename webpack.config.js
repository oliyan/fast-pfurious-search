const path = require('path');

/** @type {import('webpack').Configuration} */
const config = {
    target: 'node', // VS Code extensions run in Node.js context
    mode: 'none', // Let VS Code's build process handle the mode

    entry: './src/extension.ts', // The entry point of this extension
    output: {
        // The bundle is stored in the 'dist' folder (check package.json)
        path: path.resolve(__dirname, 'dist'),
        filename: 'extension.js',
        libraryTarget: 'commonjs2'
    },
    externals: {
        vscode: 'commonjs vscode' // The vscode-module is created on-the-fly and must be excluded
    },
    resolve: {
        // Support reading TypeScript and JavaScript files
        extensions: ['.ts', '.js']
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                exclude: /node_modules/,
                use: [
                    {
                        loader: 'ts-loader'
                    }
                ]
            }
        ]
    },
    devtool: 'nosources-source-map',
    infrastructureLogging: {
        level: 'log' // Enables logging for problem matchers
    }
};

module.exports = config;