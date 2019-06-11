import { NodeDebugAdapter } from '../nodeDebugAdapter';
import { ISession } from 'vscode-chrome-debug-core';

let da: NodeDebugAdapter | null = null;

export function getDA(): NodeDebugAdapter {
    if (da === null) {
        throw new Error(`There is no existing instance of a Debug Adapter to return`);
    }

    return da;
}

export function getDAOrCreate(session: ISession): NodeDebugAdapter {

    if (da === null) {
        da = new NodeDebugAdapter(session);
    }

    return da;
}
