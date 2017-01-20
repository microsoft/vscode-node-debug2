/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import * as path from 'path';
import * as fs from 'fs';
import * as cp from 'child_process';

const NODE_SHEBANG_MATCHER = new RegExp('#! */usr/bin/env +node');

export function isJavaScript(aPath: string): boolean {
    const name = path.basename(aPath).toLowerCase();
    if (name.endsWith('.js')) {
        return true;
    }

    try {
        const buffer = new Buffer(30);
        const fd = fs.openSync(aPath, 'r');
        fs.readSync(fd, buffer, 0, buffer.length, 0);
        fs.closeSync(fd);
        const line = buffer.toString();
        if (NODE_SHEBANG_MATCHER.test(line)) {
            return true;
        }
    } catch (e) {
        // silently ignore problems
    }

    return false;
}

export function random(low: number, high: number): number {
    return Math.floor(Math.random() * (high - low) + low);
}

/**
 * Placeholder localize function
 */
export function localize(id: string, msg: string, ...args: any[]): string {
    args.forEach((arg, i) => {
        msg = msg.replace(new RegExp(`\\{${i}\\}`, 'g'), arg);
    });

    return msg;
}

export function killTree(processId: number): void {
    if (process.platform === 'win32') {
        const TASK_KILL = 'C:\\Windows\\System32\\taskkill.exe';

        // when killing a process in Windows its child processes are *not* killed but become root processes.
        // Therefore we use TASKKILL.EXE
        try {
            cp.execSync(`${TASK_KILL} /F /T /PID ${processId}`);
        } catch (err) {
        }
    } else {
        // on linux and OS X we kill all direct and indirect child processes as well
        try {
            const cmd = path.join(__dirname, './terminateProcess.sh');
            cp.spawnSync(cmd, [ processId.toString() ]);
        } catch (err) {
        }
    }
}

export function isOnPath(program: string): boolean {
    if (process.platform === 'win32') {
        const WHERE = 'C:\\Windows\\System32\\where.exe';
        try {
            if (fs.existsSync(WHERE)) {
                cp.execSync(`${WHERE} ${program}`);
            } else {
                // do not report error if 'where' doesn't exist
            }
            return true;
        } catch (Exception) {
            // ignore
        }
    } else {
        const WHICH = '/usr/bin/which';
        try {
            if (fs.existsSync(WHICH)) {
                cp.execSync(`${WHICH} '${program}'`);
            } else {
                // do not report error if 'which' doesn't exist
            }
            return true;
        } catch (Exception) {
        }
    }
    return false;
}

export function trimLastNewline(msg: string): string {
    return msg.replace(/(\n|\r\n)$/, '');
}

export function extendObject<T>(toObject: T, fromObject: T): T {
    for (let key in fromObject) {
        if (fromObject.hasOwnProperty(key)) {
            toObject[key] = fromObject[key];
        }
    }

    return toObject;
}
