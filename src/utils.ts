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

export function killTree(processId: number): void {
    if (process.platform === 'win32') {
        const windir = process.env['WINDIR'] || 'C:\\Windows';
        const TASK_KILL = path.join(windir, 'System32', 'taskkill.exe');

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

export function stripBOM(s: string): string {
    if (s && s[0] === '\uFEFF') {
        s = s.substr(1);
    }
    return s;
}
