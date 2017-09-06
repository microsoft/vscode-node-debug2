/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as os from 'os';
import * as path from 'path';
import * as ts from 'vscode-chrome-debug-core-testsupport';

const NIGHTLY_NAME = os.platform() === 'win32' ? 'node-nightly.cmd' : 'node-nightly';

function patchLaunchArgs(launchArgs: any): void {
    launchArgs.trace = 'verbose';
    if (process.version.startsWith('v6.2')) {
        launchArgs.runtimeExecutable = NIGHTLY_NAME;
    }

    if (!launchArgs.port) {
        launchArgs.port = 9229;
        launchArgs.runtimeArgs = launchArgs.runtimeArgs || [];
        launchArgs.runtimeArgs.push(`--inspect=${launchArgs.port}`, '--debug-brk');
    }
}

export function setup(port?: number) {
    return ts.setup('./out/src/nodeDebug.js', 'node2', patchLaunchArgs, port);
}

export function teardown() {
    ts.teardown();
}

export const lowercaseDriveLetterDirname = __dirname.charAt(0).toLowerCase() + __dirname.substr(1);
export const PROJECT_ROOT = path.join(lowercaseDriveLetterDirname, '../../');
export const DATA_ROOT = path.join(PROJECT_ROOT, 'testdata/');