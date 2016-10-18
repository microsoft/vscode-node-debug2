/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import {ChromeDebugAdapter, logger} from 'vscode-chrome-debug-core';
import Crdp from 'chrome-remote-debug-protocol';
import {DebugProtocol} from 'vscode-debugprotocol';
import {OutputEvent} from 'vscode-debugadapter';

import * as path from 'path';
import * as fs from 'fs';
import * as cp from 'child_process';

import {LaunchRequestArguments, AttachRequestArguments} from './nodeDebugInterfaces';
import * as pathUtils from './pathUtils';
import * as utils from './utils';
import {localize} from './utils';
import * as errors from './errors';

export class NodeDebugAdapter extends ChromeDebugAdapter {
    private static NODE = 'node';
    private static RUNINTERMINAL_TIMEOUT = 5000;
    private static NODE_TERMINATION_POLL_INTERVAL = 3000;

    private _loggedTargetVersion: boolean;
    private _nodeProcessId: number;
    private _pollForNodeProcess: boolean;

    // Flags relevant during init
    private _continueAfterConfigDone = true;
    private _entryPauseEvent: Crdp.Debugger.PausedEvent;
    private _waitingForEntryPauseEvent = true;
    private _finishedConfig = false;

    private _supportsRunInTerminalRequest: boolean;
    private _restartMode: boolean;
    private _isTerminated: boolean;
    private _adapterID: string;

    public initialize(args: DebugProtocol.InitializeRequestArguments): DebugProtocol.Capabilities {
        this._supportsRunInTerminalRequest = args.supportsRunInTerminalRequest;
        this._adapterID = args.adapterID;

        return super.initialize(args);
    }

    public launch(args: LaunchRequestArguments): Promise<void> {
        super.launch(args);

        const port = args.port || utils.random(3000, 50000);

        let runtimeExecutable = args.runtimeExecutable;
        if (runtimeExecutable) {
            if (!path.isAbsolute(runtimeExecutable)) {
                if (!pathUtils.isOnPath(runtimeExecutable)) {
                    return this.getRuntimeNotOnPathErrorResponse(runtimeExecutable);
                }
            } else if (!fs.existsSync(runtimeExecutable)) {
                return this.getNotExistErrorResponse('runtimeExecutable', runtimeExecutable);
            }
        } else {
            if (!utils.isOnPath(NodeDebugAdapter.NODE)) {
                return Promise.reject(errors.runtimeNotFound(NodeDebugAdapter.NODE));
            }

            // use node from PATH
            runtimeExecutable = NodeDebugAdapter.NODE;
        }

        if (this._adapterID === 'extensionHost') {
            // we always launch in 'debug-brk' mode, but we only show the break event if 'stopOnEntry' attribute is true.
            let launchArgs = [];
            if (!args.noDebug) {
                launchArgs.push(`--debugBrkPluginHost=${port}`, '--inspect');
            }

            const runtimeArgs = args.runtimeArgs || [];
            const programArgs = args.args || [];
            launchArgs = launchArgs.concat(runtimeArgs, programArgs);

            return this.launchInInternalConsole(runtimeExecutable, launchArgs);
        }

        let programPath = args.program;
        if (programPath) {
            if (!path.isAbsolute(programPath)) {
                return this.getRelativePathErrorResponse('program', programPath);
            }

            if (!fs.existsSync(programPath)) {
                return this.getNotExistErrorResponse('program', programPath);
            }

            programPath = path.normalize(programPath);
            if (pathUtils.normalizeDriveLetter(programPath) !== pathUtils.realPath(programPath)) {
                logger.log(localize('program.path.case.mismatch.warning', "Program path uses differently cased character as file on disk; this might result in breakpoints not being hit."), /*forceLog=*/true);
            }
        }

        return this.resolveProgramPath(programPath, args.sourceMaps).then(resolvedProgramPath => {
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
                    program = path.relative(cwd, resolvedProgramPath);
                }
            } else if (resolvedProgramPath) {
                // if no working dir given, we use the direct folder of the executable
                cwd = path.dirname(resolvedProgramPath);
                program = path.basename(resolvedProgramPath);
            }

            const runtimeArgs = args.runtimeArgs || [];
            const programArgs = args.args || [];

            let launchArgs = [runtimeExecutable];
            if (!args.noDebug) {
                launchArgs.push(`--inspect=${port}`);
            }

            // Always stop on entry to set breakpoints
            launchArgs.push('--debug-brk');
            this._continueAfterConfigDone = !args.stopOnEntry;

            launchArgs = launchArgs.concat(runtimeArgs, program ? [program] : [], programArgs);

            let launchP: Promise<void>;
            if (args.console === 'integratedTerminal' || args.console === 'externalTerminal') {
                const termArgs: DebugProtocol.RunInTerminalRequestArguments = {
                    kind: args.console === 'integratedTerminal' ? 'integrated' : 'external',
                    title: localize('node.console.title', "Node Debug Console"),
                    cwd,
                    args: launchArgs,
                    env: args.env
                };
                launchP = this.launchInTerminal(termArgs);
            } else if (!args.console || args.console === 'internalConsole') {
                // merge environment variables into a copy of the process.env
                const env = Object.assign({}, process.env, args.env);
                launchP = this.launchInInternalConsole(runtimeExecutable, launchArgs.slice(1), { cwd, env });
            } else {
                return Promise.reject(errors.unknownConsoleType(args.console));
            }

            return launchP
                .then(() => {
                    return args.noDebug ?
                        Promise.resolve() :
                        this.doAttach(port, undefined, args.address, args.timeout);
                });
        });
    }

    public attach(args: AttachRequestArguments): Promise<void> {
        this._restartMode = args.restart;
        return super.attach(args);
    }

    protected doAttach(port: number, targetUrl?: string, address?: string, timeout?: number): Promise<void> {
        return super.doAttach(port, targetUrl, address, timeout)
            .then(() => {
                this.beginWaitingForDebuggerPaused();
                this.getNodeProcessDetailsIfNeeded();
            });
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

    private launchInInternalConsole(runtimeExecutable: string, launchArgs: string[], spawnOpts?: cp.SpawnOptions): Promise<void> {
        this.logLaunchCommand(runtimeExecutable, launchArgs);
        const nodeProcess = cp.spawn(runtimeExecutable, launchArgs, spawnOpts);
        return new Promise<void>((resolve, reject) => {
            this._nodeProcessId = nodeProcess.pid;
            nodeProcess.on('error', (error) => {
                reject(errors.cannotLaunchDebugTarget(error));
                const msg = `Node process error: ${error}`;
                logger.error(msg);
                this.terminateSession(msg);
            });
            nodeProcess.on('exit', () => {
                const msg = 'Target exited';
                logger.log(msg);
                this.terminateSession(msg);
            });
            nodeProcess.on('close', (code) => {
                const msg = 'Target closed';
                logger.log(msg);
                this.terminateSession(msg);
            });

            nodeProcess.stdout.on('data', (data: string) => {
                let msg = data.toString();
                msg = utils.trimLastNewline(msg);
                logger.log(msg, /*forceLog=*/true);
            });

            nodeProcess.stderr.on('data', (data: string) => {
                // Print stderr, but chop off the Chrome-specific message
                let msg = data.toString();
                const chromeMsgIndex = msg.indexOf('To start debugging, open the following URL in Chrome:');
                if (chromeMsgIndex >= 0) {
                    msg = msg.substr(0, chromeMsgIndex).trim();
                }

                msg = utils.trimLastNewline(msg);
                logger.error(msg);
            });

            resolve();
         });
    }

    /**
     * Override so that -core's call on attach will be ignored, and we can wait until the first break when ready to set BPs.
     */
    protected sendInitializedEvent(): void {
        if (!this._waitingForEntryPauseEvent) {
            super.sendInitializedEvent();
        }
    }

    public configurationDone(): Promise<void> {
        // This message means that all breakpoints have been set by the client. We should be paused at this point.
        // So tell the target to continue, or tell the client that we paused, as needed
        this._finishedConfig = true;
        if (this._continueAfterConfigDone) {
            this._expectingStopReason = undefined;
            this.continue();
        } else if (this._entryPauseEvent) {
            this.onPaused(this._entryPauseEvent);
        }

        return super.configurationDone();
    }

    private killNodeProcess(): void {
        if (this._nodeProcessId && !this._attachMode) {
            logger.log('Killing process with id: ' + this._nodeProcessId);
            utils.killTree(this._nodeProcessId);
            this._nodeProcessId = 0;
        }
    }

    public terminateSession(reason: string): void {
        const requestRestart = this._restartMode && !this._inShutdown;
        this.killNodeProcess();
        super.terminateSession(reason, requestRestart);
    }

    protected onPaused(notification: Crdp.Debugger.PausedEvent): void {
        // If we don't have the entry location, this must be the entry pause
        if (this._waitingForEntryPauseEvent) {
            logger.log('Paused on entry');
            this._expectingStopReason = 'entry';
            this._entryPauseEvent = notification;
            this._waitingForEntryPauseEvent = false;

            if (this._attachMode) {
                // In attach mode, and we did pause right away,
                // so assume --debug-brk was set and we should show paused
                this._continueAfterConfigDone = false;
            }

            this.getNodeProcessDetailsIfNeeded()
                .then(() => this.sendInitializedEvent());
        } else {
            super.onPaused(notification);
        }
    }

    private resolveProgramPath(programPath: string, sourceMaps: boolean): Promise<string> {
        return Promise.resolve().then(() => {
            if (!programPath) {
                return programPath;
            }

            if (utils.isJavaScript(programPath)) {
                if (!sourceMaps) {
                    return programPath;
                }

                // if programPath is a JavaScript file and sourceMaps are enabled, we don't know whether
                // programPath is the generated file or whether it is the source (and we need source mapping).
                // Typically this happens if a tool like 'babel' or 'uglify' is used (because they both transpile js to js).
                // We use the source maps to find a 'source' file for the given js file.
                return this._sourceMapTransformer.getGeneratedPathFromAuthoredPath(programPath).then(generatedPath => {
                    if (generatedPath && generatedPath !== programPath) {
                        // programPath must be source because there seems to be a generated file for it
                        logger.log(`Launch: program '${programPath}' seems to be the source; launch the generated file '${generatedPath}' instead`);
                        programPath = generatedPath;
                    } else {
                        logger.log(`Launch: program '${programPath}' seems to be the generated file`);
                    }

                    return programPath;
                });
            } else {
                // node cannot execute the program directly
                if (!sourceMaps) {
                    return Promise.reject<string>(errors.cannotLaunchBecauseSourceMaps(programPath));
                }

                return this._sourceMapTransformer.getGeneratedPathFromAuthoredPath(programPath).then(generatedPath => {
                    if (!generatedPath) { // cannot find generated file
                        return Promise.reject<string>(errors.cannotLaunchBecauseOutFiles(programPath));
                    }

                    logger.log(`Launch: program '${programPath}' seems to be the source; launch the generated file '${generatedPath}' instead`);
                    return generatedPath;
                });
            }
        });
    }

    /**
     * Wait 500ms for the entry pause event, and if it doesn't come, move on with life.
     * During attach, we don't know whether it's paused when attaching.
     */
    private beginWaitingForDebuggerPaused(): void {
        let count = 10;
        const id = setInterval(() => {
            if (this._entryPauseEvent || this._isTerminated) {
                // Got the entry pause, stop waiting
                clearInterval(id);
            } else if (--count <= 0) {
                // No entry event, so fake it and continue
                logger.log('Did not get a pause event 500ms after starting, so continuing');
                clearInterval(id);
                this._continueAfterConfigDone = false;
                this._waitingForEntryPauseEvent = false;

                this.getNodeProcessDetailsIfNeeded()
                    .then(() => this.sendInitializedEvent());
            }
        }, 50);
    }

    /**
     * Override addBreakpoints, which is called by setBreakpoints to make the actual call to Chrome.
     */
    protected addBreakpoints(url: string, breakpoints: DebugProtocol.SourceBreakpoint[]): Promise<Crdp.Debugger.SetBreakpointResponse[]> {
        return super.addBreakpoints(url, breakpoints).then(responses => {
            if (this._entryPauseEvent && !this._finishedConfig) {
                const entryLocation = this._entryPauseEvent.callFrames[0].location;
                if (this._continueAfterConfigDone) {
                    const bpAtEntryLocation = responses.some(response => {
                        // Don't compare column location, because you can have a bp at col 0, then break at some other column
                        return response && response.actualLocation && response.actualLocation.lineNumber === entryLocation.lineNumber &&
                            response.actualLocation.scriptId === entryLocation.scriptId;
                    });

                    if (bpAtEntryLocation) {
                        // There is some initial breakpoint being set to the location where we stopped on entry, so need to pause even if
                        // the stopOnEntry flag is not set
                        logger.log('Got a breakpoint set in the entry location, so will stop even though stopOnEntry is not set');
                        this._continueAfterConfigDone = false;
                        this._expectingStopReason = 'breakpoint';
                    }
                }
            }

            return responses;
        });
    }

    private getNodeProcessDetailsIfNeeded(): Promise<void> {
        if (this._loggedTargetVersion || !this.chrome) {
            return Promise.resolve();
        }

        return this.chrome.Runtime.evaluate({ expression: '[process.pid, process.version, process.arch]', returnByValue: true, contextId: 1 }).then(response => {
            if (response.exceptionDetails) {
                const details = response.exceptionDetails;
                if (details.exception.description.startsWith('ReferenceError: process is not defined')) {
                    logger.verbose('Got expected exception: `process is not defined`. Will try again later.');
                } else {
                    logger.error('Exception evaluating `process.pid`: ' + details.exception.description + '. Will try again later.');
                }
            } else {
                const value = response.result.value;
                if (this._pollForNodeProcess) {
                    this._nodeProcessId = value[0];
                    this.startPollingForNodeTermination();
                }

                this._loggedTargetVersion = true;
                logger.log(`Target node version: ${value[1]} ${value[2]}`);
            }
        },
        error => logger.error('Error evaluating `process.pid`: ' + error.message));
    }

    protected onConsoleMessage(params: Crdp.Runtime.ConsoleAPICalledEvent): void {
        // Messages come from stdout
    }

    private startPollingForNodeTermination(): void {
        const intervalId = setInterval(() => {
            try {
                if (this._nodeProcessId) {
                    // kill with signal=0 just test for whether the proc is alive. It throws if not.
                    process.kill(this._nodeProcessId, 0);
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

        this._session.sendEvent(new OutputEvent(cli + '\n', 'console'));
    }

    /**
     * 'Path does not exist' error
     */
    private getNotExistErrorResponse(attribute: string, path: string): Promise<void> {
        return Promise.reject(<DebugProtocol.Message>{
            id: 2007,
            format: localize('attribute.path.not.exist', "Attribute '{0}' does not exist ('{1}').", attribute, '{path}'),
            variables: { path }
        });
    }

    /**
     * 'Path not absolute' error with 'More Information' link.
     */
    private getRelativePathErrorResponse(attribute: string, path: string): Promise<void> {
        const format = localize('attribute.path.not.absolute', "Attribute '{0}' is not absolute ('{1}'); consider adding '{2}' as a prefix to make it absolute.", attribute, '{path}', '${workspaceRoot}/');
        return this.getErrorResponseWithInfoLink(2008, format, { path }, 20003);
    }

    private getRuntimeNotOnPathErrorResponse(runtime: string): Promise<void> {
        return Promise.reject(<DebugProtocol.Message>{
            id: 2001,
            format: localize('VSND2001', "Cannot find runtime '{0}' on PATH.", '{_runtime}'),
            variables: { _runtime: runtime }
        });
    }

    /**
     * Send error response with 'More Information' link.
     */
    private getErrorResponseWithInfoLink(code: number, format: string, variables: any, infoId: number): Promise<void> {
        return Promise.reject(<DebugProtocol.Message>{
            id: code,
            format,
            variables,
            showUser: true,
            url: 'http://go.microsoft.com/fwlink/?linkID=534832#_' + infoId.toString(),
            urlLabel: localize('more.information', "More Information")
        });
    }
}
