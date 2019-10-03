/*---------------------------------------------------------
* Copyright (C) Microsoft Corporation. All rights reserved.
*--------------------------------------------------------*/

import { ScriptContainer } from 'vscode-chrome-debug-core';
import { NodeDebugAdapter } from './nodeDebugAdapter';
import * as path from 'path';

export class NodeScriptContainer extends ScriptContainer {
    /**
     * If realPath is an absolute path or a URL, return realPath. Otherwise, prepend the node_internals marker
     */
    public realPathToDisplayPath(realPath: string): string {
        if (!realPath.match(/VM\d+/) && !path.isAbsolute(realPath)) {
            return `${NodeDebugAdapter.NODE_INTERNALS}/${realPath}`;
        }

        return super.realPathToDisplayPath(realPath);
    }

    /**
     * If displayPath starts with the NODE_INTERNALS indicator, strip it.
     */
    public displayPathToRealPath(displayPath: string): string {
        const match = displayPath.match(new RegExp(`^${NodeDebugAdapter.NODE_INTERNALS}[\\\\/](.*)`));
        return match ? match[1] : super.displayPathToRealPath(displayPath);
    }
}
