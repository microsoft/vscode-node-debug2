/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as net from 'net';

const initialConfigurations = [
    {
        name: "Launch Program",
        type: "node2",
        request: "launch",
        program: "${workspaceRoot}/app.js",
        cwd: "${workspaceRoot}"
    },
    {
        name: "Attach to Process",
        type: "node2",
        request: "attach",
        port: 9229
    }
];

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.commands.registerCommand('extension.node-debug2.provideInitialConfigurations', provideInitialConfigurations));
    context.subscriptions.push(vscode.commands.registerCommand('extension.node-debug2.addFrameToSkipFiles', addFrameToSkipFiles));
}

export function deactivate() {
}

function provideInitialConfigurations(): string {
    let program = getProgram();

    if (program) {
        program = path.isAbsolute(program) ? program : path.join('${workspaceRoot}', program);
        initialConfigurations.forEach(config => {
            if (config['program']) {
                config['program'] = program;
            }
        });
    }

    // If this looks like a typescript/coffeescript workspace, add sourcemap-related props
    if (vscode.workspace.textDocuments.some(document => document.languageId === 'typescript' || document.languageId === 'coffeescript')) {
        initialConfigurations.forEach(config => {
            config['outFiles'] = [];
        });
    }

    // Massage the configuration string, add an aditional tab and comment out processId
    const configurationsMassaged = JSON.stringify(initialConfigurations, null, '\t').replace(',\n\t\t"processId', '\n\t\t//"processId')
        .split('\n').map(line => '\t' + line).join('\n').trim();

    return [
        '{',
        '\t// Use IntelliSense to find out which attributes exist for node debugging',
        '\t// Use hover for the description of the existing attributes',
        '\t// For further information visit https://go.microsoft.com/fwlink/?linkid=830387',
        '\t"version": "0.2.0",',
        '\t"configurations": ' + configurationsMassaged,
        '}'
    ].join('\n');
}

function getProgram(): string {
    const packageJsonPath = path.join(vscode.workspace.rootPath, 'package.json');
    let program = '';

    // Get 'program' from package.json 'main' or 'npm start'
    try {
        const jsonContent = fs.readFileSync(packageJsonPath, 'utf8');
        const jsonObject = JSON.parse(jsonContent);
        if (jsonObject.main) {
            program = jsonObject.main;
        } else if (jsonObject.scripts && typeof jsonObject.scripts.start === 'string') {
            program = (<string>jsonObject.scripts.start).split(' ').pop();
        }
    } catch (error) { }

    return program;
}

function addFrameToSkipFiles(url: any): void {
    console.log(`addFrameToSkipFiles`);
    console.log(url);

    const socket = net.connect({ port: 7891 }, () => {
        socket.write(url);
    });

    socket.on("data", (data: any) => {
    });

    socket.on("error", function(reason: Error) {
        console.log(`socket error: ` + reason);
    });

    socket.on("end", function() {
        console.log(`socket end`);
    });
}
