/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import * as path from 'path';
import * as fs from 'fs';
import * as cp from 'child_process';
import * as match from 'minimatch';

const NODE_SHEBANG_MATCHER = new RegExp('#! */usr/bin/env +node');

/**
 * Checks whether a file is a loadable JavaScript file.
 */
export class JavaScriptDeterminant {
    private static readonly defaultPatterns = ['*.js', '*.es6', '*.jsx', '*.mjs'];
    private customPatterns: ReadonlyArray<string> = [];

    public updatePatterns(patterns: ReadonlyArray<string>) {
        this.customPatterns = patterns;
    }

    public isJavaScript(aPath: string) {
        const basename = path.basename(aPath);
        const matchesPattern = [
            ...JavaScriptDeterminant.defaultPatterns,
            ...this.customPatterns,
        ].some(pattern => match(basename, pattern, { nocase: true }));

        return matchesPattern || this.isShebang(aPath);
    }

    private isShebang(aPath: string) {
        try {
            const buffer = Buffer.alloc(30);
            const fd = fs.openSync(aPath, 'r');
            fs.readSync(fd, buffer, 0, buffer.length, 0);
            fs.closeSync(fd);
            const line = buffer.toString();
            return NODE_SHEBANG_MATCHER.test(line);
        } catch (e) {
            return false;
        }
    }
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

const semverRegex = /v?(\d+)\.(\d+)\.(\d+)/;
export function compareSemver(a: string, b: string): number {
    const aNum = versionStringToNumber(a);
    const bNum = versionStringToNumber(b);

    return aNum - bNum;
}

function versionStringToNumber(str: string): number {
    const match = str.match(semverRegex);
    if (!match) {
        throw new Error('Invalid node version string: ' + str);
    }

    return parseInt(match[1], 10) * 10000 + parseInt(match[2], 10) * 100 + parseInt(match[3], 10);
}
