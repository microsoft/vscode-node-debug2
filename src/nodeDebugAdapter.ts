/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import {ChromeDebugAdapter, logger, utils as coreUtils, ISetBreakpointsArgs, ISetBreakpointsResponseBody} from 'vscode-chrome-debug-core';
import * as Chrome from 'vscode-chrome-debug-core/lib/src/chrome/chromeDebugProtocol';
import {DebugProtocol} from 'vscode-debugprotocol';
import {TerminatedEvent, OutputEvent, InitializedEvent} from 'vscode-debugadapter';

import * as path from 'path';
import * as fs from 'fs';
import * as cp from 'child_process';

import {Terminal} from './terminal/terminal';
import {LaunchRequestArguments, NodeDebugError} from './nodeDebugInterfaces';
import * as pathUtils from './pathUtils';
import * as utils from './utils';

/**
 * Placeholder localize function
 */
function localize(id: string, msg: string, ...args: any[]): string {
    args.forEach((arg, i) => {
        msg = msg.replace(new RegExp(`\\{${i}\\}`, 'g'), arg);
    });

    return msg;
};

export class NodeDebugAdapter extends ChromeDebugAdapter {
    private static NODE = 'node';
    private static RUNINTERMINAL_TIMEOUT = 3000;
    private static NODE_TERMINATION_POLL_INTERVAL = 3000;

    private _nodeProcessId: number;
    private _pollForNodeProcess: boolean;

    private _continueAfterConfigDone = true;
    private _entryPauseEvent: Chrome.Debugger.PausedParams;

    public launch(args: LaunchRequestArguments): Promise<void> {
        super.launch(args);

        const port = args.port || utils.random(3000, 50000);

        let runtimeExecutable = args.runtimeExecutable;
        if (runtimeExecutable) {
            if (!path.isAbsolute(runtimeExecutable)) {
                return this.getRelativePathErrorResponse('runtimeExecutable', runtimeExecutable);
            }

            if (!fs.existsSync(runtimeExecutable)) {
                return this.getNotExistErrorResponse('runtimeExecutable', runtimeExecutable);
            }
        } else {
            if (!Terminal.isOnPath(NodeDebugAdapter.NODE)) {
                return Promise.reject(<DebugProtocol.Message>{
                    id: 2001,
                    format: localize('VSND2001', "Cannot find runtime '{0}' on PATH.", '{_runtime}'),
                    variables: { _runtime: NodeDebugAdapter.NODE }
                });
            }

            // use node from PATH
            runtimeExecutable = NodeDebugAdapter.NODE;
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
        } else {
            return this.getAttributeMissingErrorResponse('program');
        }

        if (utils.isJavaScript(programPath)) {
            // resolve sourcemaps if needed
        } else {
            // error
        }

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
            program = path.relative(cwd, programPath);
        }
        else { // should not happen
            // if no working dir given, we use the direct folder of the executable
            cwd = path.dirname(programPath);
            program = path.basename(programPath);
        }

        const runtimeArgs = args.runtimeArgs || [];
        const programArgs = args.args || [];

        let launchArgs = [runtimeExecutable, '--nolazy'];
        if (!args.noDebug) {
            launchArgs.push(`--inspect=${port}`);
        }

        // Always stop on entry to set breakpoints
        launchArgs.push('--debug-brk');
        this._continueAfterConfigDone = !args.stopOnEntry;

        launchArgs = launchArgs.concat(runtimeArgs, [program], programArgs);
        this.logLaunchCommand(launchArgs);

        if (args.console === 'integratedTerminal') {
            const termArgs: DebugProtocol.RunInTerminalRequestArguments = {
                kind: 'integrated',
                title: localize('node.console.title', "Node Debug Console"),
                cwd,
                args: launchArgs,
                env: args.env
            };

            return new Promise<void>((resolve, reject) => {
                this.sendRequest('runInTerminal', termArgs, NodeDebugAdapter.RUNINTERMINAL_TIMEOUT, response => {
                    if (response.success) {
                        // since node starts in a terminal, we cannot track it with an 'exit' handler
                        // plan for polling after we have gotten the process pid.
                        this._pollForNodeProcess = true;

                        args.noDebug ?
                            resolve() :
                            this.doAttach(port, undefined, args.address, args.timeout)
                                .then(() => this.getNodeProcessIdIfNeeded())
                                .then(resolve, reject);
                    } else {
                        reject(<DebugProtocol.Message>{
                            id: 2011,
                            format: localize('VSND2011', "Cannot launch debug target in terminal ({0}).", '{_error}'),
                            variables: { _error: response.message }
                        });

                        this.terminateSession('terminal error: ' + response.message);
                    }
                });
            });
        } else if (!args.console || args.console === 'internalConsole') {
            // merge environment variables into a copy of the process.env
            const env = Object.assign({}, process.env, args.env);

            const options = {
                cwd,
                env
            };

            const nodeProcess = cp.spawn(runtimeExecutable, launchArgs.slice(1), options);

            return new Promise<void>((resolve, reject) => {
                nodeProcess.on('error', (error) => {
                    reject(<DebugProtocol.Message>{
                        id: 2017,
                        format: localize('VSND2017', "Cannot launch debug target ({0}).", '{_error}'),
                        variables: { _error: error.message },
                        showUser: true,
                        sendTelemetry: true
                    });

                    this.terminateSession(`failed to launch target (${error})`);
                });
                nodeProcess.on('exit', () => {
                    this.terminateSession('target exited');
                });
                nodeProcess.on('close', (code) => {
                    this.terminateSession('target closed');
                });

                this._nodeProcessId = nodeProcess.pid;

                // Capture process output
                process.stdout.on('data', (data: string) => {
                    this.sendEvent(new OutputEvent(data.toString(), 'stdout'));
                });
                process.stderr.on('data', (data: string) => {
                    this.sendEvent(new OutputEvent(data.toString(), 'stderr'));
                });

                return args.noDebug ?
                    Promise.resolve() :
                    this.doAttach(port, undefined, args.address, args.timeout)
                        .then(() => this.getNodeProcessIdIfNeeded());
            });
        } else {
            return coreUtils.errP('NOT IMPLEMENTED');
        }
    }

    /**
     * Override so that -core's call on attach will be ignored, and we can wait until the first break when ready to set BPs.
     */
    protected sendInitializedEvent(): void {
        if (this._entryPauseEvent) {
            super.sendInitializedEvent();
        }
    }

    public configurationDone(): Promise<void> {
        // This message means that all breakpoints have been set by the client. We should be paused at this point.
        // So, either tell the target to continue, or tell the client that we paused.
        if (this._continueAfterConfigDone) {
            this.continue();
        } else {
            this.onDebuggerPaused(this._entryPauseEvent);
        }

        return super.configurationDone();
    }

    public clearEverything(): void {
        super.clearEverything();

        if (this._nodeProcessId) {
            logger.log('Killing process with id: ' + this._nodeProcessId);
            Terminal.killTree(this._nodeProcessId);
        }
    }

    protected clearTargetContext(): void {
        super.clearTargetContext();

        // Mainly to ensure it's cleared in server mode, but if Node had some way to refresh in proc and stop on entry again,
        // then this would also be hit.
        this._entryPauseEvent = null;
    }

    public terminateSession(reason: string): void {
        super.terminateSession(reason);
        this._nodeProcessId = 0;

        // For restart
        // if (!this._isTerminated) {
        //     this._isTerminated = true;
        //     if (this._restartMode && !this._inShutdown) {
        //         this.sendEvent(new TerminatedEvent(true));
        //     } else {
        //         this.sendEvent(new TerminatedEvent());
        //     }
        // }
    }

    protected onDebuggerPaused(notification: Chrome.Debugger.PausedParams): void {
        // If we don't have the entry location, this must be the entry pause
        if (!this._entryPauseEvent) {
            logger.log('Paused on entry');
            this._entryPauseEvent = notification;
            this.getNodeProcessIdIfNeeded()
                .then(() => this.sendInitializedEvent());
        } else {
            super.onDebuggerPaused(notification);
        }
    }

    /**
     * Override addBreakpoints, which is called by setBreakpoints to make the actual call to Chrome.
     */
    protected addBreakpoints(url: string, lines: number[], cols?: number[]): Promise<Chrome.Debugger.SetBreakpointResponse[]> {
        return super.addBreakpoints(url, lines, cols).then(responses => {
            const entryLocation = this._entryPauseEvent.callFrames[0].location;
            if (this._continueAfterConfigDone && responses.some(response => response.result.actualLocation === entryLocation)) {
                // There is some initial breakpoint being set to the location where we stopped on entry, so need to pause even if
                // the stopOnEntry flag is not set
                logger.log('Got a breakpoint set in the entry location, so will stop even though stopOnEntry is not set');
                this._continueAfterConfigDone = false;
            }

            return responses;
        });
    }

    private getNodeProcessIdIfNeeded(): Promise<void> {
        if (this._nodeProcessId) {
            return Promise.resolve<void>();
        }

        return this._chromeConnection.runtime_evaluate('process.pid')
            .then(result => {
                if (result.error) {
                    logger.error('Error evaluating `process.pid`: ' + result.error);
                } else if (result.result.exceptionDetails) {
                    const details = result.result.exceptionDetails;
                    if (details.exception.description.startsWith('ReferenceError: process is not defined')) {
                        logger.verbose('Got expected exception: `process is not defined`. Will try again later.');
                    } else {
                        logger.error('Exception evaluating `process.pid`: ' + details.exception.description + '. Will try again later.');
                    }
                } else {
                    this._nodeProcessId = result.result.result.value;
                    this.startPollingForNodeTermination();
                }
            });
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
                this.terminateSession('Target process is dead');
            }
        }, NodeDebugAdapter.NODE_TERMINATION_POLL_INTERVAL);
    }

    private logLaunchCommand(args: string[]) {
        // print the command to launch the target to the debug console
        let cli = '';
        for (let a of args) {
            if (a.indexOf(' ') >= 0) {
                cli += '\'' + a + '\'';
            } else {
                cli += a;
            }
            cli += ' ';
        }

        logger.log(cli);
    }

    /**
     * 'Attribute missing' error
     */
    private getAttributeMissingErrorResponse(attribute: string): Promise<void> {
        return Promise.reject(<DebugProtocol.Message>{
            id: 2005,
            format: localize('attribute.missing', "Attribute '{0}' is missing or empty.", attribute)
        });
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
