/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import {ChromeDebugAdapter, logger} from 'vscode-chrome-debug-core';
import {DebugProtocol} from 'vscode-debugprotocol';
import {TerminatedEvent, OutputEvent} from 'vscode-debugadapter';

import * as path from 'path';
import * as fs from 'fs';
import * as cp from 'child_process';

import {Terminal} from './terminal';
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

	private _nodeProcessId: number;

    public launch(args: LaunchRequestArguments): Promise<void> {
        this.setupLogging(args);

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

		// we always break on entry (but if user did not request this, we will not stop in the UI).
		let launchArgs = [runtimeExecutable];
		if (!args.noDebug) {
			launchArgs.push(`--inspect=${port}`);
		}

		launchArgs = launchArgs.concat(runtimeArgs, [program], programArgs);

		const address = args.address;
		const timeout = args.timeout;

		this.logLaunchCommand(launchArgs);

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
					id:2017,
					format: localize('VSND2017', "Cannot launch debug target ({0}).", '{_error}'),
					variables: { _error: error.message },
					showUser: true,
					sendTelemetry: true
				});

				// Needed?
				// this._terminated(`failed to launch target (${error})`);
			});
			nodeProcess.on('exit', () => {
				this.terminated('target exited');
			});
			nodeProcess.on('close', (code) => {
				this.terminated('target closed');
			});

			this._nodeProcessId = nodeProcess.pid;

			// Capture process output
			process.stdout.on('data', (data: string) => {
				this.fireEvent(new OutputEvent(data.toString(), 'stdout'));
			});
			process.stderr.on('data', (data: string) => {
				this.fireEvent(new OutputEvent(data.toString(), 'stderr'));
			});

			return args.noDebug ?
				Promise.resolve() :
				this.doAttach(port, undefined, address, timeout);
		});
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

		logger.log(cli, /*forceLog=*/true);
	}

	private terminated(reason: string): void {
		logger.log(`_terminated: ${reason}`);

		this.fireEvent(new TerminatedEvent());

		// if (this._terminalProcess) {
		// 	// if the debug adapter owns a terminal,
		// 	// we delay the TerminatedEvent so that the user can see the result of the process in the terminal.
		// 	return;
		// }

		// if (!this._isTerminated) {
		// 	this._isTerminated = true;
		// 	if (this._restartMode && !this._inShutdown) {
		// 		this.sendEvent(new TerminatedEvent(true));
		// 	} else {
		// 		this.sendEvent(new TerminatedEvent());
		// 	}
		// }
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
