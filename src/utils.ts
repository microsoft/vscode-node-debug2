/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import * as path from 'path';
import * as fs from 'fs';

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
    } catch(e) {
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
