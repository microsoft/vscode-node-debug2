/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as os from 'os';
import * as path from 'path';
import * as ts from 'vscode-chrome-debug-core-testsupport';
import * as findFreePort from 'find-free-port';

const NIGHTLY_NAME = os.platform() === 'win32' ? 'node-nightly.cmd' : 'node-nightly';

function findPort(): Promise<number> {
    return new Promise(resolve => {
        findFreePort(9000, (err, port) => {
            if (err) return resolve(9229);

            resolve(port);
        });
    });
}

async function patchLaunchArgs(launchArgs: any): Promise<void> {
    launchArgs.trace = 'verbose';
    if (process.version.startsWith('v6.2')) {
        launchArgs.runtimeExecutable = NIGHTLY_NAME;
    }

    if (!launchArgs.port) {
        launchArgs.port = await findPort();
        launchArgs.runtimeArgs = launchArgs.runtimeArgs || [];
        launchArgs.runtimeArgs.push(`--inspect-brk=${launchArgs.port}`);
    }
}

export function setup(_opts?: { port?: number, alwaysDumpLogs?: boolean }) {
    const opts = Object.assign(<ts.ISetupOpts>{
        entryPoint: './out/src/nodeDebug.js',
        type: 'node2',
        patchLaunchArgs
    }, _opts);

    return ts.setup(opts);
}

export function teardown() {
    ts.teardown();
}

export const lowercaseDriveLetterDirname = __dirname.charAt(0).toLowerCase() + __dirname.substr(1);
export const PROJECT_ROOT = path.join(lowercaseDriveLetterDirname, '../../');
export const DATA_ROOT = path.join(PROJECT_ROOT, 'testdata/');