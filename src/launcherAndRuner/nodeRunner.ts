import {
    IDebuggeeRunner, injectable, ITelemetryPropertyCollector
} from 'vscode-chrome-debug-core';
import { getDA } from '../v1-backwards-compatiblity/getDA';

@injectable()
export class NodeRunner implements IDebuggeeRunner {
    public async run(telemetryPropertyCollector: ITelemetryPropertyCollector): Promise<void> {
        await getDA().configurationDone();
    }

    public async stop(): Promise<void> { }
}