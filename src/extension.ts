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


class ExtensionHostDebugConfigurationProvider implements vscode.DebugConfigurationProvider {
    resolveDebugConfiguration(folder: vscode.WorkspaceFolder | undefined, debugConfiguration: vscode.DebugConfiguration): vscode.ProviderResult<vscode.DebugConfiguration> {
        if (useV3()) {
            folder = folder || (vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0] : undefined);
            debugConfiguration['__workspaceFolder'] = folder?.uri.fsPath;
            debugConfiguration.type = 'pwa-extensionHost';
        } else {
            annoyingDeprecationNotification();
        }

        return debugConfiguration;
    }
}

const v3Setting = 'debug.javascript.usePreview';

function useV3() {
    return getWithoutDefault(v3Setting) ?? true;
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
    const inspect = vscode.workspace.getConfiguration().inspect(v3Setting);
    const isWorkspace = inspect?.workspaceValue === false;
    const result = await vscode.window.showWarningMessage(
        `You're using a ${isWorkspace ? 'workspace' : 'user'} setting to use VS Code's legacy Node.js debugger, which will be removed soon. Please update your settings using the "Upgrade" button to use our modern debugger.`,
        useNewDebugger,
    );

    if (result !== useNewDebugger) {
        return;
    }

    const config = vscode.workspace.getConfiguration();
    if (inspect?.globalValue === false) {
        config.update(v3Setting, true, vscode.ConfigurationTarget.Global);
    }
    if (inspect?.workspaceValue === false) {
        config.update(v3Setting, true, vscode.ConfigurationTarget.Workspace);
    }
}
