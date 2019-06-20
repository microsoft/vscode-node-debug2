import {
    IDebuggeeInitializer, injectable
} from 'vscode-chrome-debug-core';
import { getDA } from '../v1-backwards-compatiblity/getDA';

@injectable()
export class NodeInitializer implements IDebuggeeInitializer {
    public async initialize(): Promise<void> {
        await getDA().waitForInitialized();
    }

    public async stop(): Promise<void> { }
}