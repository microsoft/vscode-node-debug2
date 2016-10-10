# VS Code Node Debug 2 (Experimental)
[![build status](https://travis-ci.org/Microsoft/vscode-node-debug2.svg?branch=master)](https://travis-ci.org/Microsoft/vscode-node-debug2)
[![Gitter](https://badges.gitter.im/Join Chat.svg)](https://gitter.im/microsoft/vscode)

This repository contains an experimental debug extension for [node.js](https://nodejs.org) that ships with [VS Code](https://code.visualstudio.com) and uses the [Chrome Debugging Protocol](https://chromedevtools.github.io/debugger-protocol-viewer/v8/), which Node now exposes via the `--inspect` flag, only in Node versions 6.3+. It's built on the [vscode-chrome-debug-core](https://github.com/Microsoft/vscode-chrome-debug-core) library.

This extension will eventually have feature-parity with vscode-node-debug, but isn't there yet. An overview is recorded [here](https://github.com/Microsoft/vscode-node-debug/issues/7) and you can see issues in the [vscode-node-debug2](https://github.com/Microsoft/vscode-node-debug2/issues) repo and the [vscode-chrome-debug-core](https://github.com/microsoft/vscode-chrome-debug-core/issues) repo. For the most part, you should be able to set `"type": "node2"` in your existing Node launch config and have things work the same, as long as it's running in Node v6.3+.

See an overview of debugging Node.js in VS Code [here](https://code.visualstudio.com/docs/editor/debugging).

## Troubleshooting
* If something doesn't work, please try on the original Node debug adapter (`"type": "node"`) and this one, and file an issue for any regression.
* If there may be an issue with sourcemaps, try running with sourcemaps disabled and setting breakpoints in the generated script.
* Or try adding 'debugger' statements to ensure that the debugger pauses.
* Set `"diagnosticLogging": true` or `"verboseDiagnosticLogging": true` in your launch config. The adapter will log its own diagnostic info to the console, and to this file: `~/.vscode/extensions/ms-vscode.vscode-node-debug2/vscode-node-debug2.txt`. This is useful in figuring out why breakpoints don't resolve, or why sourcemaps don't work properly, or anything else. This is often useful info to include when filing an issue on GitHub. Note that it will include paths and file names from your machine.
* Watch for error messages in the debug console or terminal. There may be bugs on Node's side and it could crash.

## Contributing
Contributions are welcome, please see [CONTRIBUTING.txt](CONTRIBUTING.txt).

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/). For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.

## License
[MIT](LICENSE.txt)
