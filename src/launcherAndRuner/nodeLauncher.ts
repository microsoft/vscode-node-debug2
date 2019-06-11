import {
    injectable, IDebuggeeLauncher, ITelemetryPropertyCollector, ILaunchResult,
    inject, TYPES, BasePathTransformer, BaseSourceMapTransformer, ISession
} from 'vscode-chrome-debug-core';
import { ILaunchRequestArguments } from '../nodeDebugInterfaces';
import { getDAOrCreate } from '../v1-backwards-compatiblity/getDA';

/**
 * Launch node
 */
@injectable()
export class NodeLauncher implements IDebuggeeLauncher {
    public constructor(
        @inject(TYPES.BasePathTransformer) protected readonly _pathTransformer: BasePathTransformer,
        // @inject(TYPES.CDTPClient) protected readonly chrome: CDTP.ProtocolApi,
        @inject(TYPES.BaseSourceMapTransformer) protected readonly _sourceMapTransformer: BaseSourceMapTransformer,
        @inject(TYPES.ISession) protected readonly _session: ISession, ) { }

    public async launch(args: ILaunchRequestArguments, telemetryPropertyCollector: ITelemetryPropertyCollector): Promise<ILaunchResult> {
        const debugAdapter = getDAOrCreate(this._session);
        await debugAdapter.launch(args);
        return debugAdapter.launchResult;
    }

    public async stop(): Promise<void> {
    }
}