/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { ChromeDebugAdapter, chromeUtils, ISourceMapPathOverrides, utils as CoreUtils, logger, telemetry as CoreTelemetry, Crdp, ChromeDebugSession, IOnPausedResult } from 'vscode-chrome-debug-core';
const telemetry = CoreTelemetry.telemetry;

import { DebugProtocol } from 'vscode-debugprotocol';
import { OutputEvent, CapabilitiesEvent, Event } from 'vscode-debugadapter';
import { ErrorWithMessage } from 'vscode-chrome-debug-core/out/src/errors';

import * as path from 'path';
import * as fs from 'fs';
import * as cp from 'child_process';

import { ILaunchRequestArguments, IAttachRequestArguments, ICommonRequestArgs, ILaunchVSCodeArguments, ILaunchVSCodeArgument } from './nodeDebugInterfaces';
import * as pathUtils from './pathUtils';
import * as utils from './utils';
import * as errors from './errors';
import * as wsl from './wslSupport';

import * as nls from 'vscode-nls';
import { FinishedStartingUpEventArguments } from 'vscode-chrome-debug-core/lib/src/executionTimingsReporter';
import { ReasonType } from 'vscode-chrome-debug-core/lib/src/chrome/stoppedEvent';
let localize = nls.loadMessageBundle();

const DefaultSourceMapPathOverrides: ISourceMapPathOverrides = {
    'webpack:///./~/*': '${cwd}/node_modules/*',
    'webpack:///./*': '${cwd}/*',
    'webpack:///*': '*',
    'meteor://💻app/*': '${cwd}/*',
};

export class ProcessEvent extends Event implements DebugProtocol.ProcessEvent {
    body: {
        name: string;
        systemProcessId?: number;
        isLocalProcess?: boolean;
        startMethod?: 'launch' | 'attach' | 'attachForSuspendedLaunch';
        pointerSize?: number;
    };

    public constructor(name: string, systemProcessId?: number) {
        super('process');
        this.body = {
            name,
            systemProcessId
        };
    }
}
export class NodeDebugAdapter extends ChromeDebugAdapter {
    private static NODE = 'node';
    private static RUNINTERMINAL_TIMEOUT = 5000;
    private static NODE_TERMINATION_POLL_INTERVAL = 3000;
    private static DEBUG_BRK_DEP_MSG = /\(node:\d+\) \[DEP0062\] DeprecationWarning: `node --inspect --debug-brk` is deprecated\. Please use `node --inspect-brk` instead\.\s*/;

    public static NODE_INTERNALS = '<node_internals>';

    protected _launchAttachArgs: ICommonRequestArgs;

    private _jsDeterminant = new utils.JavaScriptDeterminant();
    private _loggedTargetVersion: boolean;
    private _nodeProcessId: number;
    private _pollForNodeProcess: boolean;

    // Flags relevant during init
    private _continueAfterConfigDone = true;
    private _entryPauseEvent: Crdp.Debugger.PausedEvent;
    private _waitingForEntryPauseEvent = true;
    private _finishedConfig = false;
    private _handlingEarlyNodeMsgs = true;
    private _captureFromStd: boolean = false;

    private _supportsRunInTerminalRequest: boolean;
    private _restartMode: boolean;
    private _isTerminated: boolean;
    private _adapterID: string;

    get entryPauseEvent(): Crdp.Debugger.PausedEvent | undefined {
        return this._entryPauseEvent;
    }

    get jsDeterminant(): utils.JavaScriptDeterminant {
        return this._jsDeterminant;
    }

    get finishedConfig(): boolean {
        return this._finishedConfig;
    }

    get continueAfterConfigDone(): boolean {
        return this._continueAfterConfigDone;
    }

    set continueAfterConfigDone(v: boolean) {
        this._continueAfterConfigDone = v;
    }

    get expectingStopReason(): ReasonType {
        return this._expectingStopReason;
    }

    set expectingStopReason(v: ReasonType) {
        this._expectingStopReason = v;
    }

    private get nodeProcessId(): number {
        return this._nodeProcessId;
    }

    private set nodeProcessId(id: number) {
        this._nodeProcessId = id;

        if (id !== 0) {
            this.session.sendEvent(new ProcessEvent('', id));
        }
    }

    get launchAttachArgs(): ICommonRequestArgs {
        return this._launchAttachArgs;
    }

    /**
     * Returns whether this is a non-EH attach scenario
     */
    private get normalAttachMode(): boolean {
        return this._attachMode && !this.isExtensionHost();
    }

    private get supportsTerminateRequest(): boolean {
        return process.platform !== 'win32' && !this.isExtensionHost();
    }

    public initialize(args: DebugProtocol.InitializeRequestArguments): DebugProtocol.Capabilities {
        this._adapterID = args.adapterID;
        this._promiseRejectExceptionFilterEnabled = this.isExtensionHost();
        this._supportsRunInTerminalRequest = args.supportsRunInTerminalRequest;

        if (args.locale) {
            localize = nls.config({ locale: args.locale })();
        }

        const capabilities = super.initialize(args);
        capabilities.supportsLogPoints = true;
        capabilities.supportsTerminateRequest = this.supportsTerminateRequest;

        return capabilities;
    }

    public async launch(args: ILaunchRequestArguments): Promise<void> {
        if (typeof args.enableSourceMapCaching !== 'boolean') {
            args.enableSourceMapCaching = this.isExtensionHost();
        }

        if (args.console && args.console !== 'internalConsole' && typeof args._suppressConsoleOutput === 'undefined') {
            args._suppressConsoleOutput = true;
        }

        await super.launch(args);
        if (args.__restart && typeof args.__restart.port === 'number') {
            return this.doAttach(args.__restart.port, undefined, args.address, args.timeout);
        }

        const port = args.port || utils.random(3000, 50000);

        if (args.useWSL && !wsl.subsystemForLinuxPresent()) {
            return Promise.reject(new ErrorWithMessage(<DebugProtocol.Message>{
                id: 2007,
                format: localize('attribute.wsl.not.exist', 'Cannot find Windows Subsystem for Linux installation.')
            }));
        }

        this._continueAfterConfigDone = !args.stopOnEntry;

        if (this.isExtensionHost()) {
            return this.extensionHostLaunch(args, port);
        }

        let runtimeExecutable = args.runtimeExecutable;
        if (args.useWSL) {
            runtimeExecutable = runtimeExecutable || NodeDebugAdapter.NODE;
        } else if (runtimeExecutable) {
            if (path.isAbsolute(runtimeExecutable)) {
                const re = pathUtils.findExecutable(runtimeExecutable, args.env);
                if (!re) {
                    return this.getNotExistErrorResponse('runtimeExecutable', runtimeExecutable);
                }

                runtimeExecutable = re;
            } else {
                const re = pathUtils.findOnPath(runtimeExecutable, args.env);
                if (!re) {
                    return this.getRuntimeNotOnPathErrorResponse(runtimeExecutable);
                }

                runtimeExecutable = re;
            }
        } else {
            const re = pathUtils.findOnPath(NodeDebugAdapter.NODE, args.env);
            if (!re) {
                return Promise.reject(errors.runtimeNotFound(NodeDebugAdapter.NODE));
            }

            // use node from PATH
            runtimeExecutable = re;
        }

        let programPath = args.program;
        if (programPath) {
            if (!path.isAbsolute(programPath)) {
                return this.getRelativePathErrorResponse('program', programPath);
            }

            if (!fs.existsSync(programPath)) {
                if (fs.existsSync(programPath + '.js')) {
                    programPath += '.js';
                } else {
                    return this.getNotExistErrorResponse('program', programPath);
                }
            }

            programPath = path.normalize(programPath);
            if (pathUtils.normalizeDriveLetter(programPath) !== pathUtils.realCasePath(programPath)) {
                logger.warn(localize('program.path.case.mismatch.warning', 'Program path uses differently cased character as file on disk; this might result in breakpoints not being hit.'));
            }
        }

        this._captureFromStd = args.outputCapture === 'std';

        if (args.__debuggablePatterns) {
            this._jsDeterminant.updatePatterns(args.__debuggablePatterns);
        }

        const resolvedProgramPath = await this.resolveProgramPath(programPath, args.sourceMaps);
        let program: string;
        let cwd = args.cwd;
        if (cwd) {
            if (!path.isAbsolute(cwd)) {
                return this.getRelativePathErrorResponse('cwd', cwd);
            }

            if (!fs.existsSync(cwd)) {
                return this.getNotExistErrorResponse('cwd', cwd);
            }

            // if working dir is given and if the executable is within that folder, we make the executable path relative to the working dir
            if (resolvedProgramPath) {
                program = await pathUtils.isSymlinkedPath(cwd) ?
                    resolvedProgramPath :
                    path.relative(cwd, resolvedProgramPath);
            }
        } else if (resolvedProgramPath) {
            // if no working dir given, we use the direct folder of the executable
            cwd = path.dirname(resolvedProgramPath);
            program = await pathUtils.isSymlinkedPath(cwd) ?
                resolvedProgramPath :
                path.basename(resolvedProgramPath);
        }

        const runtimeArgs = args.runtimeArgs || [];
        const programArgs = args.args || [];

        const debugArgs = detectSupportedDebugArgsForLaunch(args, runtimeExecutable, args.env);
        let launchArgs = [];
        if (!args.noDebug && !args.port) {
            // Always stop on entry to set breakpoints
            if (debugArgs === DebugArgs.Inspect_DebugBrk) {
                launchArgs.push(`--inspect=${port}`);
                launchArgs.push('--debug-brk');
            } else {
                launchArgs.push(`--inspect-brk=${port}`);
            }
        }

        launchArgs = runtimeArgs.concat(launchArgs, program ? [program] : [], programArgs);

        const wslLaunchArgs = wsl.createLaunchArg(args.useWSL, args.console === 'externalTerminal', cwd, runtimeExecutable, launchArgs, program);
        // if using subsystem for linux, we will trick the debugger to map source files
        if (args.useWSL && !args.localRoot && !args.remoteRoot) {
            this.pathTransformer.attach(<IAttachRequestArguments>{
                remoteRoot: wslLaunchArgs.remoteRoot,
                localRoot: wslLaunchArgs.localRoot
            });
        }

        const envArgs = this.collectEnvFileArgs(args) || args.env;
        if ((args.console === 'integratedTerminal' || args.console === 'externalTerminal') && this._supportsRunInTerminalRequest) {
            const termArgs: DebugProtocol.RunInTerminalRequestArguments = {
                kind: args.console === 'integratedTerminal' ? 'integrated' : 'external',
                title: localize('node.console.title', 'Node Debug Console'),
                cwd,
                args: wslLaunchArgs.combined,
                env: envArgs
            };
            await this.launchInTerminal(termArgs);
            if (args.noDebug) {
                this.terminateSession('cannot track process');
            }
        } else if (!args.console || args.console === 'internalConsole') {
            await this.launchInInternalConsole(wslLaunchArgs.executable, wslLaunchArgs.args, envArgs, cwd);
        } else {
            throw errors.unknownConsoleType(args.console);
        }

        if (!args.noDebug) {
            await this.doAttach(port, undefined, args.address, args.timeout, undefined, args.extraCRDPChannelPort);
        }
    }

    private extensionHostLaunch(launchArgs: ILaunchRequestArguments, debugPort: number): Promise<void> {

        // Separate all "paths" from an arguments into separate attributes.
        const args = launchArgs.args.map<ILaunchVSCodeArgument>(arg => {
            if (arg.startsWith('-')) {
                // arg is an option
                const pair = arg.split('=', 2);
                if (pair.length === 2 && (fs.existsSync(pair[1]) || fs.existsSync(pair[1] + '.js'))) {
                    return { prefix: pair[0] + '=', path: pair[1] };
                }
                return { prefix: arg };
            } else {
                // arg is a path
                try {
                    const stat = fs.lstatSync(arg);
                    if (stat.isDirectory()) {
                        return { prefix: '--folder-uri=', path: arg };
                    } else if (stat.isFile()) {
                        return { prefix: '--file-uri=', path: arg };
                    }
                } catch (err) {
                    // file not found
                }
                return { path: arg }; // just return the path blindly and hope for the best...
            }
        });

        if (!launchArgs.noDebug) {
            args.unshift({ prefix: `--inspect-brk-extensions=${debugPort}` });
        }

        args.unshift({ prefix: `--debugId=${launchArgs.__sessionId}` });  // pass the debug session ID so that broadcast events know where they come from

        const launchVSCodeArgs: ILaunchVSCodeArguments = {
            args: args,
            env: this.collectEnvFileArgs(launchArgs) || launchArgs.env
        };

        return new Promise<void>((resolve, reject) => {
            this._session.sendRequest('launchVSCode', launchVSCodeArgs, NodeDebugAdapter.RUNINTERMINAL_TIMEOUT, response => {
                if (response.success) {
                    if (response.body && typeof response.body.processId === 'number') {
                        this.nodeProcessId = response.body.processId;
                    }
                    resolve();
                } else {
                    reject(errors.cannotDebugExtension(response.message));
                    this.terminateSession('launchVSCode error: ' + response.message);
                }
            });
        });
    }

    public async attach(args: IAttachRequestArguments): Promise<void> {
        try {
            if (typeof args.enableSourceMapCaching !== 'boolean') {
                args.enableSourceMapCaching = true;
            }

            return super.attach(args);
        } catch (err) {
            if (err.format && err.format.indexOf('Cannot connect to runtime process') >= 0) {
                // hack -core error msg
                err.format = 'Ensure Node was launched with --inspect. ' + err.format;
            }

            throw err;
        }
    }

    protected commonArgs(args: ICommonRequestArgs): void {
        args.sourceMapPathOverrides = getSourceMapPathOverrides(args.cwd, args.sourceMapPathOverrides);
        fixNodeInternalsSkipFiles(args);

        args.smartStep = typeof args.smartStep === 'undefined' ? !this._isVSClient : args.smartStep;

        this._restartMode = args.restart;
        super.commonArgs(args);
    }

    protected hookConnectionEvents(): void {
        super.hookConnectionEvents();

        this.chrome.Runtime.on('executionContextDestroyed', params => {
            if (params.executionContextId === 1) {
                this.terminateSession('Program ended');
            }
        });
    }

    protected async doAttach(port: number, targetUrl?: string, address?: string, timeout?: number, websocketUrl?: string, extraCRDPChannelPort?: number): Promise<void> {
        await super.doAttach(port, targetUrl, address, timeout, websocketUrl, extraCRDPChannelPort);
        this.beginWaitingForDebuggerPaused();
        this.getNodeProcessDetailsIfNeeded();

        this._session.sendEvent(new CapabilitiesEvent({ supportsStepBack: this.supportsStepBack() }));
    }

    private supportsStepBack(): boolean {
        return this._domains.has(<keyof Crdp.ProtocolApi>'TimeTravel');
    }

    private launchInTerminal(termArgs: DebugProtocol.RunInTerminalRequestArguments): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this._session.sendRequest('runInTerminal', termArgs, NodeDebugAdapter.RUNINTERMINAL_TIMEOUT, response => {
                if (response.success) {
                    // since node starts in a terminal, we cannot track it with an 'exit' handler
                    // plan for polling after we have gotten the process pid.
                    this._pollForNodeProcess = true;
                    resolve();
                } else {
                    reject(errors.cannotLaunchInTerminal(response.message));
                    this.terminateSession('terminal error: ' + response.message);
                }
            });
        });
    }

    private launchInInternalConsole(runtimeExecutable: string, launchArgs: string[], envArgs?: any, cwd?: string): Promise<void> {
        // merge environment variables into a copy of the process.env
        const env = Object.assign({}, process.env, envArgs);
        Object.keys(env).filter(k => env[k] === null).forEach(key => delete env[key]);

        const spawnOpts: cp.SpawnOptions = { cwd, env };

        // Workaround for bug Microsoft/vscode#45832
        if (process.platform === 'win32' && runtimeExecutable.indexOf(' ') > 0) {
            let foundArgWithSpace = false;

            // check whether there is one arg with a space
            const args: string[] = [];
            for (const a of launchArgs) {
                if (a.indexOf(' ') > 0) {
                    args.push(`"${a}"`);
                    foundArgWithSpace = true;
                } else {
                    args.push(a);
                }
            }

            if (foundArgWithSpace) {
                launchArgs = args;
                runtimeExecutable = `"${runtimeExecutable}"`;
                spawnOpts.shell = true;
            }
        }

        this.logLaunchCommand(runtimeExecutable, launchArgs);
        spawnOpts.detached = this.supportsTerminateRequest; // https://github.com/Microsoft/vscode/issues/57018
        const nodeProcess = cp.spawn(runtimeExecutable, launchArgs, spawnOpts);
        return new Promise<void>((resolve, reject) => {
            this.nodeProcessId = nodeProcess.pid;
            nodeProcess.on('error', (error) => {
                reject(errors.cannotLaunchDebugTarget(errors.toString()));
                const msg = `Node process error: ${error}`;
                logger.error(msg);
                this.terminateSession(msg);
            });
            nodeProcess.on('exit', () => {
                const msg = 'Target exited';
                logger.log(msg);
                if (!this.isExtensionHost()) {
                    this.terminateSession(msg);
                }
            });
            nodeProcess.on('close', (code) => {
                const msg = 'Target closed';
                logger.log(msg);
                if (!this.isExtensionHost()) {
                    this.terminateSession(msg);
                }
            });

            const noDebugMode = (<ILaunchRequestArguments>this._launchAttachArgs).noDebug;

            this.captureStderr(nodeProcess, noDebugMode);

            // Must attach a listener to stdout or process will hang on Windows
            nodeProcess.stdout.on('data', (data: string) => {
                if ((noDebugMode || this._captureFromStd) && !this._launchAttachArgs._suppressConsoleOutput) {
                    let msg = data.toString();
                    this._session.sendEvent(new OutputEvent(msg, 'stdout'));
                }
            });

            resolve();
         });
    }

    private captureStderr(nodeProcess: cp.ChildProcess, noDebugMode: boolean): void {
        nodeProcess.stderr.on('data', (data: string) => {
            let msg = data.toString();
            let isLastEarlyNodeMsg = false;

            // We want to send initial stderr output back to the console because they can contain useful errors.
            // But there are some messages printed to stderr at the start of debugging that can be misleading.
            // Node is "handlingEarlyNodeMsgs" from launch to when one of these messages is printed:
            //   "To start debugging, open the following URL in Chrome: ..." - Node <8
            //   --debug-brk deprecation message - Node 8+
            // In this mode, we strip those messages from stderr output. After one of them is printed, we don't
            // watch stderr anymore and pass it along (unless in noDebugMode).
            if (this._handlingEarlyNodeMsgs && !noDebugMode) {
                const chromeMsgIndex = msg.indexOf('To start debugging, open the following URL in Chrome:');
                if (chromeMsgIndex >= 0) {
                    msg = msg.substr(0, chromeMsgIndex);
                    isLastEarlyNodeMsg = true;
                }

                const msgMatch = msg.match(NodeDebugAdapter.DEBUG_BRK_DEP_MSG);
                if (msgMatch) {
                    isLastEarlyNodeMsg = true;
                    msg = msg.replace(NodeDebugAdapter.DEBUG_BRK_DEP_MSG, '');
                }

                const helpMsg = /For help see https:\/\/nodejs.org\/en\/docs\/inspector\s*/;
                msg = msg.replace(helpMsg, '');
            }

            if ((this._handlingEarlyNodeMsgs || noDebugMode || this._captureFromStd) && !this._launchAttachArgs._suppressConsoleOutput) {
                this._session.sendEvent(new OutputEvent(msg, 'stderr'));
            }

            if (isLastEarlyNodeMsg) {
                this._handlingEarlyNodeMsgs = false;
            }
        });
    }

    protected onConsoleAPICalled(params: Crdp.Runtime.ConsoleAPICalledEvent): void {
        // Once any console API message is received, we are done listening to initial stderr output
        this._handlingEarlyNodeMsgs = false;

        if (this._captureFromStd) {
            return;
        }

        // Strip the --debug-brk deprecation message which is printed at startup
        if (!params.args || params.args.length !== 1 || typeof params.args[0].value !== 'string' || !params.args[0].value.match(NodeDebugAdapter.DEBUG_BRK_DEP_MSG)) {
            super.onConsoleAPICalled(params);
        }
    }

    private collectEnvFileArgs(args: ILaunchRequestArguments): any {
        // read env from disk and merge into envVars
        if (args.envFile) {
            try {
                const env = {};
                const buffer = utils.stripBOM(fs.readFileSync(args.envFile, 'utf8'));
                buffer.split('\n').forEach(line => {
                    const r = line.match(/^\s*([\w\.\-]+)\s*=\s*(.*)?\s*$/);
                    if (r !== null) {
                        const key = r[1];
                        if (!process.env[key]) {	// .env variables never overwrite existing variables (see #21169)
                            let value = r[2] || '';
                            if (value.length > 0 && value.charAt(0) === '"' && value.charAt(value.length - 1) === '"') {
                                value = value.replace(/\\n/gm, '\n');
                            }
                            env[key] = value.replace(/(^['"]|['"]$)/g, '');
                        }
                    }
                });

                return utils.extendObject(env, args.env); // launch config env vars overwrite .env vars
            } catch (e) {
                throw errors.cannotLoadEnvVarsFromFile(e.message);
            }
        }
    }

    /**
     * Override so that -core's call on attach will be ignored, and we can wait until the first break when ready to set BPs.
     */
    protected async sendInitializedEvent(): Promise<void> {
        if (!this._waitingForEntryPauseEvent) {
            return super.sendInitializedEvent();
        }
    }

    public async configurationDone(): Promise<void> {
        if (!this.chrome) {
            // It's possible to get this request after we've detached, see #21973
            return super.configurationDone();
        }

        await this._breakpoints.breakpointsQueueDrained;

        // This message means that all breakpoints have been set by the client. We should be paused at this point.
        // So tell the target to continue, or tell the client that we paused, as needed
        this._finishedConfig = true;
        if (this._continueAfterConfigDone) {
            this._expectingStopReason = undefined;
            await this.continue(/*internal=*/true);
        } else if (this._entryPauseEvent) {
            await this.onPaused(this._entryPauseEvent);
        }

        this.events.emit(ChromeDebugSession.FinishedStartingUpEventName, { requestedContentWasDetected: true } as FinishedStartingUpEventArguments);
        await super.configurationDone();
    }

    private killNodeProcess(): void {
        if (this.nodeProcessId && !this.normalAttachMode) {
            if (this.nodeProcessId === 1) {
                logger.log('Not killing launched process. It has PID=1');
            } else {
                logger.log('Killing process with id: ' + this.nodeProcessId);
                utils.killTree(this.nodeProcessId);
            }

            this.nodeProcessId = 0;
        }
    }

    public async terminate(args: DebugProtocol.TerminateArguments): Promise<void> {
        this._clientRequestedSessionEnd = true;
        if (!this._attachMode && !(<ILaunchRequestArguments>this._launchAttachArgs).useWSL && this.nodeProcessId > 0) {
            // -pid to kill the process group
            // https://github.com/Microsoft/vscode/issues/57018
            const groupPID = -this.nodeProcessId;

            try {
                logger.log(`Sending SIGINT to ${groupPID}`);
                process.kill(groupPID, 'SIGINT');
            } catch (e) {
                if (e.message === 'kill ESRCH') {
                    logger.log(`Got 'kill ESRCH'. Sending SIGINT to ${this.nodeProcessId}`);
                    process.kill(this.nodeProcessId, 'SIGINT');
                }
            }
        }
    }

    public async terminateSession(reason: string, args?: DebugProtocol.DisconnectArguments): Promise<void> {
        if (this.isExtensionHost() && args && typeof args.restart === 'boolean' && args.restart) {
            this.nodeProcessId = 0;
        } else if (this._restartMode && !args)  {
            // If restart: true, only kill the process when the client has disconnected. 'args' present implies that a Disconnect request was received
            this.nodeProcessId = 0;
        }

        this.killNodeProcess();
        const restartArgs = this._restartMode && !this._clientRequestedSessionEnd ? { port: this._port } : undefined;
        return super.terminateSession(reason, undefined, restartArgs);
    }

    protected async onPaused(notification: Crdp.Debugger.PausedEvent, expectingStopReason = this._expectingStopReason): Promise<IOnPausedResult> {
        // If we don't have the entry location, this must be the entry pause
        if (this._waitingForEntryPauseEvent) {
            logger.log(Date.now() / 1000 + ': Paused on entry');
            this._expectingStopReason = 'entry';
            this._entryPauseEvent = notification;
            this._waitingForEntryPauseEvent = false;

            if ((this.normalAttachMode && this._launchAttachArgs.stopOnEntry !== false) ||
                (this.isExtensionHost() && this._launchAttachArgs.stopOnEntry)) {
                // In attach mode, and we did pause right away, so assume --debug-brk was set and we should show paused.
                // In normal attach mode, assume stopOnEntry unless explicitly disabled.
                // In extensionhost mode, only when stopOnEntry is explicitly enabled
                this._continueAfterConfigDone = false;
            }

            await this.getNodeProcessDetailsIfNeeded();
            await this.sendInitializedEvent();
            return { didPause: true };
        } else {
            return super.onPaused(notification, expectingStopReason);
        }
    }

    private async resolveProgramPath(programPath: string, sourceMaps: boolean): Promise<string> {
        logger.verbose(`Launch: Resolving programPath: ${programPath}`);
        if (!programPath) {
            return programPath;
        }

        if (this.jsDeterminant.isJavaScript(programPath)) {
            if (!sourceMaps) {
                return programPath;
            }

            // if programPath is a JavaScript file and sourceMaps are enabled, we don't know whether
            // programPath is the generated file or whether it is the source (and we need source mapping).
            // Typically this happens if a tool like 'babel' or 'uglify' is used (because they both transpile js to js).
            // We use the source maps to find a 'source' file for the given js file.
            const generatedPath = await this.sourceMapTransformer.getGeneratedPathFromAuthoredPath(programPath);
            if (generatedPath && generatedPath !== programPath) {
                // programPath must be source because there seems to be a generated file for it
                logger.log(`Launch: program '${programPath}' seems to be the source; launch the generated file '${generatedPath}' instead`);
                programPath = generatedPath;
            } else {
                logger.log(`Launch: program '${programPath}' seems to be the generated file`);
            }

            return programPath;
        } else {
            // node cannot execute the program directly
            if (!sourceMaps) {
                return Promise.reject<string>(errors.cannotLaunchBecauseSourceMaps(programPath));
            }

            const generatedPath = await this.sourceMapTransformer.getGeneratedPathFromAuthoredPath(programPath);
            if (!generatedPath) { // cannot find generated file
                if (this._launchAttachArgs.outFiles || this._launchAttachArgs.outDir) {
                    return Promise.reject<string>(errors.cannotLaunchBecauseJsNotFound(programPath));
                } else {
                    return Promise.reject<string>(errors.cannotLaunchBecauseOutFiles(programPath));
                }
            }

            logger.log(`Launch: program '${programPath}' seems to be the source; launch the generated file '${generatedPath}' instead`);
            return generatedPath;
        }
    }

    /**
     * Wait 500-5000ms for the entry pause event, and if it doesn't come, move on with life.
     * During attach, we don't know whether it's paused when attaching.
     */
    private beginWaitingForDebuggerPaused(): void {
        const checkPausedInterval = 50;
        const timeout = this._launchAttachArgs.timeout;

        // Wait longer in launch mode - it definitely should be paused.
        let count = this.normalAttachMode ? 10 :
            (typeof timeout === 'number' ?
                Math.floor(timeout / checkPausedInterval) :
                100);
        logger.log(Date.now() / 1000 + ': Waiting for initial debugger pause');
        const id = setInterval(() => {
            if (this._entryPauseEvent || this._isTerminated) {
                // Got the entry pause, stop waiting
                clearInterval(id);
            } else if (--count <= 0) {
                // No entry event, so fake it and continue
                logger.log(Date.now() / 1000 + ': Did not get a pause event after starting, so continuing');
                clearInterval(id);
                this._continueAfterConfigDone = false;
                this._waitingForEntryPauseEvent = false;

                this.getNodeProcessDetailsIfNeeded()
                    .then(() => this.sendInitializedEvent());
            }
        }, checkPausedInterval);
    }

    protected threadName(): string {
        return `Node (${this.nodeProcessId})`;
    }

    private async getNodeProcessDetailsIfNeeded(): Promise<void> {
        if (this._loggedTargetVersion || !this.chrome) {
            return Promise.resolve();
        }

        const response = await this.chrome.Runtime.evaluate({ expression: '[process.pid, process.version, process.arch]', returnByValue: true, contextId: 1 })
            .catch(error => logger.error('Error evaluating `process.pid`: ' + error.message));

        if (!response) {
            return;
        }

        if (this._loggedTargetVersion) {
            // Possible to get two of these requests going simultaneously
            return;
        }

        if (response.exceptionDetails) {
            const description = chromeUtils.errorMessageFromExceptionDetails(response.exceptionDetails);
            if (description.startsWith('ReferenceError: process is not defined')) {
                logger.verbose('Got expected exception: `process is not defined`. Will try again later.');
            } else {
                logger.log('Exception evaluating `process.pid`: ' + description + '. Will try again later.');
            }
        } else {
            const [pid, version, arch] = response.result.value;
            if (typeof pid !== 'number') {
                logger.log(`Node returned a pid of ${pid}. Will try again later.`);
                return;
            }

            if (!this.nodeProcessId) {
                this.nodeProcessId = pid;
            }

            if (this._pollForNodeProcess) {
                this.startPollingForNodeTermination();
            }

            this._loggedTargetVersion = true;
            logger.log(`Target node version: ${version} ${arch}`);
            /* __GDPR__
                "nodeVersion" : {
                    "version" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
                    "${include}": [ "${DebugCommonProperties}" ]
                }
             */
            telemetry.reportEvent('nodeVersion', { version });

            /* __GDPR__FRAGMENT__
                "DebugCommonProperties" : {
                    "Versions.Target.Version" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
                }
            */
            telemetry.addCustomGlobalProperty({ 'Versions.Target.Version': version });
        }
    }

    private startPollingForNodeTermination(): void {
        const intervalId = setInterval(() => {
            try {
                if (this.nodeProcessId) {
                    // kill with signal=0 just test for whether the proc is alive. It throws if not.
                    process.kill(this.nodeProcessId, 0);
                } else {
                    clearInterval(intervalId);
                }
            } catch (e) {
                clearInterval(intervalId);
                logger.log('Target process died');
                this.terminateSession('Target process died');
            }
        }, NodeDebugAdapter.NODE_TERMINATION_POLL_INTERVAL);
    }

    private logLaunchCommand(executable: string, args: string[]) {
        // print the command to launch the target to the debug console
        let cli = executable + ' ';
        for (let a of args) {
            if (a.indexOf(' ') >= 0) {
                cli += '\'' + a + '\'';
            } else {
                cli += a;
            }
            cli += ' ';
        }

        logger.warn(cli);
    }

    protected globalEvaluate(args: Crdp.Runtime.EvaluateRequest): Promise<Crdp.Runtime.EvaluateResponse> {
        // contextId: 1 - see https://github.com/nodejs/node/issues/8426
        if (!args.contextId) args.contextId = 1;

        return super.globalEvaluate(args);
    }

    /**
     * 'Path does not exist' error
     */
    private getNotExistErrorResponse(attribute: string, path: string): Promise<void> {
        return Promise.reject(new ErrorWithMessage(<DebugProtocol.Message>{
            id: 2007,
            format: localize('attribute.path.not.exist', "Attribute '{0}' does not exist ('{1}').", attribute, '{path}'),
            variables: { path }
        }));
    }

    /**
     * 'Path not absolute' error with 'More Information' link.
     */
    private getRelativePathErrorResponse(attribute: string, path: string): Promise<void> {
        const format = localize('attribute.path.not.absolute', "Attribute '{0}' is not absolute ('{1}'); consider adding '{2}' as a prefix to make it absolute.", attribute, '{path}', '${workspaceFolder}/');
        return this.getErrorResponseWithInfoLink(2008, format, { path }, 20003);
    }

    private getRuntimeNotOnPathErrorResponse(runtime: string): Promise<void> {
        return Promise.reject(new ErrorWithMessage(<DebugProtocol.Message>{
            id: 2001,
            format: localize('VSND2001', "Cannot find runtime '{0}' on PATH. Make sure to have '{0}' installed.", '{_runtime}'),
            variables: { _runtime: runtime }
        }));
    }

    /**
     * Send error response with 'More Information' link.
     */
    private getErrorResponseWithInfoLink(code: number, format: string, variables: any, infoId: number): Promise<void> {
        return Promise.reject(new ErrorWithMessage(<DebugProtocol.Message>{
            id: code,
            format,
            variables,
            showUser: true,
            url: 'http://go.microsoft.com/fwlink/?linkID=534832#_' + infoId.toString(),
            urlLabel: localize('more.information', 'More Information')
        }));
    }

    protected getReadonlyOrigin(aPath: string): string {
        return path.isAbsolute(aPath) || aPath.startsWith(ChromeDebugAdapter.EVAL_NAME_PREFIX) ?
            localize('origin.from.node', 'read-only content from Node.js') :
            localize('origin.core.module', 'read-only core module');
    }

    private isExtensionHost(): boolean {
        return this._adapterID === 'extensionHost2' || this._adapterID === 'extensionHost';
    }
}

function getSourceMapPathOverrides(cwd: string, sourceMapPathOverrides?: ISourceMapPathOverrides): ISourceMapPathOverrides {
    return sourceMapPathOverrides ? resolveCwdPattern(cwd, sourceMapPathOverrides, /*warnOnMissing=*/true) :
            resolveCwdPattern(cwd, DefaultSourceMapPathOverrides, /*warnOnMissing=*/false);
}

function fixNodeInternalsSkipFiles(args: ICommonRequestArgs): void {
    if (args.skipFiles) {
        args.skipFileRegExps = args.skipFileRegExps || [];
        args.skipFiles = args.skipFiles.filter(pattern => {
            const fixed = fixNodeInternalsSkipFilePattern(pattern);
            if (fixed) {
                args.skipFileRegExps.push(fixed);
                return false;
            } else {
                return true;
            }
        });
    }
}

const internalsRegex = new RegExp(`^${NodeDebugAdapter.NODE_INTERNALS}/(.*)`);
function fixNodeInternalsSkipFilePattern(pattern: string): string {
    const internalsMatch = pattern.match(internalsRegex);
    if (internalsMatch) {
        return `^(?!\/)(?![a-zA-Z]:)(?!file:///)${CoreUtils.pathGlobToBlackboxedRegex(internalsMatch[1])}`;
    } else {
        return null;
    }
}

/**
 * Returns a copy of sourceMapPathOverrides with the ${cwd} pattern resolved in all entries.
 */
function resolveCwdPattern(cwd: string, sourceMapPathOverrides: ISourceMapPathOverrides, warnOnMissing: boolean): ISourceMapPathOverrides {
    const resolvedOverrides: ISourceMapPathOverrides = {};
    for (let pattern in sourceMapPathOverrides) {
        const replacePattern = sourceMapPathOverrides[pattern];
        resolvedOverrides[pattern] = replacePattern;

        const cwdIndex = replacePattern.indexOf('${cwd}');
        if (cwdIndex === 0) {
            if (cwd) {
                resolvedOverrides[pattern] = replacePattern.replace('${cwd}', cwd);
            } else if (warnOnMissing) {
                logger.log('Warning: sourceMapPathOverrides entry contains ${cwd}, but cwd is not set');
            }
        } else if (cwdIndex > 0) {
            logger.log('Warning: in a sourceMapPathOverrides entry, ${cwd} is only valid at the beginning of the path');
        }
    }

    return resolvedOverrides;
}

export enum DebugArgs {
    InspectBrk,
    Inspect_DebugBrk
}

const defaultDebugArgs = DebugArgs.InspectBrk;
function detectSupportedDebugArgsForLaunch(config: ILaunchRequestArguments, runtimeExecutable: string, env: any): DebugArgs {
    if (config.__nodeVersion || (config.runtimeVersion  && config.runtimeVersion !== 'default')) {
        return getSupportedDebugArgsForVersion(config.__nodeVersion || config.runtimeVersion);
    } else if (config.runtimeExecutable) {
        logger.log('Using --inspect-brk because a runtimeExecutable is set');
        return defaultDebugArgs;
    } else {
        // only determine version if no runtimeExecutable is set (and 'node' on PATH is used)
        logger.log('Spawning `node --version` to determine supported debug args');
        let result: cp.SpawnSyncReturns<string>;
        try {
            result = cp.spawnSync(runtimeExecutable, ['--version']);
        } catch (e) {
            logger.error('Node version detection failed: ' + (e && e.message));
        }

        const semVerString = result.stdout ? result.stdout.toString().trim() : undefined;
        if (semVerString) {
            return getSupportedDebugArgsForVersion(semVerString);
        } else {
            logger.log('Using --inspect-brk because we couldn\'t get a version from node');
            return defaultDebugArgs;
        }
    }
}

function getSupportedDebugArgsForVersion(semVerString): DebugArgs {
    if (utils.compareSemver(semVerString, 'v7.6.0') >= 0) {
        logger.log(`Using --inspect-brk, Node version ${semVerString} detected`);
        return DebugArgs.InspectBrk;
    } else {
        logger.log(`Using --inspect --debug-brk, Node version ${semVerString} detected`);
        return DebugArgs.Inspect_DebugBrk;
    }
}
