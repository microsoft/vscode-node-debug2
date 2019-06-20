import { DebugProtocol } from 'vscode-debugprotocol';
import { ILaunchRequestArguments, IAttachRequestArguments } from './nodeDebugInterfaces';
import {
    BasePathTransformer, ISession, inject, TYPES, ICommonRequestArgs, CDTP, BaseSourceMapTransformer, CDTPScriptsRegistry, EagerSourceMapTransformer,
    InternalSourceBreakpoint, ISetBreakpointResult, ISetBreakpointsArgs, ChromeUtils, ILaunchResult, PausedEvent, logger, utils, StepProgressEventsEmitter
} from 'vscode-chrome-debug-core';
import { IOnPausedResult } from './v1-backwards-compatiblity/interfaces';

const noCallback = () => { };

export class NodeDebugAdapterBase {
    public static EVAL_NAME_PREFIX = ChromeUtils.EVAL_NAME_PREFIX;

    protected _attachMode: boolean;
    protected _promiseRejectExceptionFilterEnabled: boolean;
    protected _isVSClient: boolean;
    protected _expectingStopReason: string;
    protected _clientRequestedSessionEnd: boolean;
    protected _port: number;
    protected _launchAttachArgs: ICommonRequestArgs;

    protected events = new StepProgressEventsEmitter();

    public launchResult: ILaunchResult = {};

    // These variables need to be initialized later in the configure method
    protected _pathTransformer: BasePathTransformer;
    protected _protocolApi: CDTP.ProtocolApi;
    protected _sourceMapTransformer: BaseSourceMapTransformer;

    private onConfigurationDoneCallback: () => void = noCallback;
    private _waitForInitializedDefer = utils.promiseDefer<void>();

    public constructor(
        @inject(TYPES.ISession) protected readonly _session: ISession, ) { }

    public initialize(args: DebugProtocol.InitializeRequestArguments): DebugProtocol.Capabilities {
        return {};
    }

    public configure(pathTransformer: BasePathTransformer, sourceMapTransformer: BaseSourceMapTransformer, protocolAPI: CDTP.ProtocolApi) {
        this._pathTransformer = pathTransformer;
        this._sourceMapTransformer = sourceMapTransformer;
        this._protocolApi = protocolAPI;

        this.hookConnectionEvents();
    }

    public async launch(args: ILaunchRequestArguments): Promise<void> {
        this._launchAttachArgs = args;

        // this._sourceMapTransformer is sometimes needed before configure is called when resolveProgramPath() is called from launch()
        // this "pseudo-fake" version should work for most purposes
        this._sourceMapTransformer = new EagerSourceMapTransformer({ args, clientCapabilities: { clientID: 'vscode' } }, new CDTPScriptsRegistry());
    }

    protected async doAttach(port: number, targetUrl?: string, address?: string, timeout?: number, websocketUrl?: string, extraCRDPChannelPort?: number): Promise<void> {
        this.launchResult = { address, url: targetUrl, port };
    }

    protected async sendInitializedEvent(): Promise<void> {
        this._waitForInitializedDefer.resolve();
    }

    public waitForInitialized(): Promise<void> {
        return this._waitForInitializedDefer.promise;
    }

    protected commonArgs(args: ICommonRequestArgs): void {
        throw new Error(`not implemented commonArgs`);
    }

    protected hookConnectionEvents(): void {
    }

    protected onConsoleAPICalled(params: CDTP.Runtime.ConsoleAPICalledEvent): void {
        throw new Error(`not implemented onConsoleAPICalled`);
    }

    public async configurationDone(): Promise<void> {
        await this.onConfigurationDoneCallback();
    }

    public async continue(internal: boolean): Promise<void> {
        logger.log(`Continue called on node debug adapter base`);
    }

    protected async onPaused(notification: PausedEvent, expectingStopReason = this._expectingStopReason): Promise<IOnPausedResult> {
        return { didPause: false };
    }

    public onConfigurationDoneCall(callback: () => void): void {
        if (this.onConfigurationDoneCallback !== noCallback) {
            throw new Error(`Can't reasign onContinueCallback`);
        }

        this.onConfigurationDoneCallback = callback;
    }

    protected async evaluateOnCallFrame(condition: string, frame: CDTP.Debugger.CallFrame): Promise<CDTP.Debugger.EvaluateOnCallFrameResponse> {
        throw new Error(`not implemented evaluateOnCallFrame`);
    }

    protected async addBreakpoints(url: string, breakpoints: InternalSourceBreakpoint[]): Promise<ISetBreakpointResult[]> {
        throw new Error(`not implemented addBreakpoints`);
    }

    protected async validateBreakpointsPath(args: ISetBreakpointsArgs): Promise<void> {
        throw new Error(`not implemented validateBreakpointsPath`);
    }

    protected async globalEvaluate(args: CDTP.Runtime.EvaluateRequest): Promise<CDTP.Runtime.EvaluateResponse> {
        throw new Error(`not implemented globalEvaluate`);
    }

    protected realPathToDisplayPath(realPath: string): string {
        throw new Error(`not implemented realPathToDisplayPath`);
    }

    public async terminateSession(reason: string, args?: DebugProtocol.DisconnectArguments, opts?: { port: number }): Promise<void> {
        this._session.dispatchRequest({ command: 'disconnect', type: 'request', seq: 0 });
    }

    protected displayPathToRealPath(displayPath: string): string {
        throw new Error(`not implemented displayPathToRealPath`);
    }

    public async attach(args: IAttachRequestArguments): Promise<void> {
        throw new Error(`not implemented attach`);
    }
}