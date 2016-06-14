# vscode-node-cdp-debug
This is a prototype of a debug adapter for VS Code that can target Node, using the Chrome Debugging Protocol. At the moment, this is only supported in Node v7. It's based on the vscode-debug-chrome-core library.

## How to run
Clone this repo, run npm install. Open the directory in Code and press ctrl+shift+b to build and F5 to run as a debug server.

Open your app's directory in Code and set up a launch config. It should look something like this:

```
{
    "version": "0.2.0",
    "debugServer": "4712", // To use the vscode-node-cdp-debug server, instead of vscode's built in Node debugger
    "configurations": [
        {
            "name": "Node",
            "type": "chrome",
            "request": "attach",
            "port": 9229, // Default port, check the message printed - "Debugger listening on port X"
            "sourceMaps": true,
            "webRoot": "${workspaceRoot}"
            // "diagnosticLogging": true // May be useful for debugging
        }
    ]
}
```

Start your app using "node --inspect". Press F5 in Code to attach.