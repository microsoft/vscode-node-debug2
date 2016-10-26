# VS Code Node Debug 2 (Experimental)
[![build status](https://travis-ci.org/Microsoft/vscode-node-debug2.svg?branch=master)](https://travis-ci.org/Microsoft/vscode-node-debug2)
[![Build status](https://ci.appveyor.com/api/projects/status/qrr2hff3eagw5k05?svg=true)](https://ci.appveyor.com/project/roblourens/vscode-node-debug2)

This repository contains an experimental debug extension for [node.js](https://nodejs.org) that ships with [VS Code](https://code.visualstudio.com) and uses the [Chrome Debugging Protocol](https://chromedevtools.github.io/debugger-protocol-viewer/v8/), which Node now exposes via the `--inspect` flag, only in Node versions 6.3+. It's built on the [vscode-chrome-debug-core](https://github.com/Microsoft/vscode-chrome-debug-core) library.

This extension has essentially reached feature-parity with vscode-node-debug. You can see the remaining issues in the [vscode-node-debug2](https://github.com/Microsoft/vscode-node-debug2/issues) repo and the [vscode-chrome-debug-core](https://github.com/microsoft/vscode-chrome-debug-core/issues) repo. You should be able to set `"type": "node2"` in your existing Node launch config and have things work the same, as long as it's running in Node v6.3+.

See an overview of debugging Node.js in VS Code [here](https://code.visualstudio.com/docs/editor/debugging).

## Node version compatibility
Typically it should work with any version of Node greater than 6.3. But there is some instability in Node with this option before 6.8, especially in Windows. Due to [nodejs/node#8155](https://github.com/nodejs/node/issues/8155), I recommend using at least 6.8 in Windows.

## Troubleshooting
* If something doesn't work, please try on the original Node debug adapter (`"type": "node"`) and this one, and file an issue for any regression.
* If there may be an issue with sourcemaps, try running with sourcemaps disabled and setting breakpoints in the generated script.
* Or try adding 'debugger' statements to ensure that the debugger pauses.
* Watch for error messages in the debug console or terminal. There may be bugs on Node's side and it could crash. It's most stable in Node v6.9 and v7. If Node seems to be crashing, you can launch with `"console": "integratedTerminal"` to watch for error messages that don't show up in the debug console.
* Set `"diagnosticLogging": true` or `"verboseDiagnosticLogging": true` in your launch config. The adapter will log its own diagnostic info to the console, and to a file in your temp directory, the path to which will be printed at the top of the console. This is useful in figuring out why breakpoints don't resolve, or why sourcemaps don't work properly, or anything else. This is often useful info to include when filing an issue on GitHub. Note that it will include paths and file names from your machine.

## Contributing
Contributions are welcome, please see [CONTRIBUTING.txt](CONTRIBUTING.txt).

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/). For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.

## License
[MIT](LICENSE.txt)
