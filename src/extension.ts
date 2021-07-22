/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import * as vscode from 'vscode';
import * as Core from 'vscode-chrome-debug-core';

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.commands.registerCommand('extension.node-debug2.toggleSkippingFile', toggleSkippingFile));
    context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('extensionHost', new ExtensionHostDebugConfigurationProvider()));
}

export function deactivate() {
}

function toggleSkippingFile(path: string | number): void {
    if (!path) {
        const activeEditor = vscode.window.activeTextEditor;
        path = activeEditor && activeEditor.document.fileName;
    }

    if (path && vscode.debug.activeDebugSession) {
        const args: Core.IToggleSkipFileStatusArgs = typeof path === 'string' ? { path } : { sourceReference: path };
        vscode.debug.activeDebugSession.customRequest('toggleSkipFileStatus', args);
    }
}

const useNewSettings = ['debug.extensionHost.useV3', 'debug.javascript.usePreview'];

class ExtensionHostDebugConfigurationProvider implements vscode.DebugConfigurationProvider {
    resolveDebugConfiguration(folder: vscode.WorkspaceFolder | undefined, debugConfiguration: vscode.DebugConfiguration): vscode.ProviderResult<vscode.DebugConfiguration> {
        const useV3 = useNewSettings.some(getWithoutDefault) ?? true;

        if (useV3) {
            folder = folder || (vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0] : undefined);
            debugConfiguration['__workspaceFolder'] = folder?.uri.fsPath;
            debugConfiguration.type = 'pwa-extensionHost';
        } else {
            annoyingDeprecationNotification();
        }

        return debugConfiguration;
    }
}

function getWithoutDefault<T>(setting: string): T | undefined {
    const info = vscode.workspace.getConfiguration().inspect<T>(setting);
    return info?.workspaceValue ?? info?.globalValue;
}

let hasShownDeprecation = false;

async function annoyingDeprecationNotification() {
    if (hasShownDeprecation) {
        return;
    }

    const useNewDebugger = 'Upgrade';
    hasShownDeprecation = true;
    const result = await vscode.window.showWarningMessage("You're using an old Node.js debugger which will be deprecated soon. Please upgrade to our new debugger, and file issues if you run into any problems", useNewDebugger);

    if (result !== useNewDebugger) {
        return;
    }

    const config = vscode.workspace.getConfiguration();
    for (const setting of useNewSettings) {
        const inspect = config.inspect(setting);
        if (inspect.globalValue === false) {
            config.update(setting, true, vscode.ConfigurationTarget.Global);
        }
        if (inspect.workspaceValue === false) {
            config.update(setting, true, vscode.ConfigurationTarget.Workspace);
        }
    }
}
