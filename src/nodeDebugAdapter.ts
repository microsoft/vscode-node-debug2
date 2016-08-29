/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import {ChromeDebugAdapter} from 'vscode-chrome-debug-core';
import {DebugProtocol} from 'vscode-debugprotocol';

import * as path from 'path';
import * as fs from 'fs';

import {Terminal} from './terminal';
import {LaunchRequestArguments, NodeDebugError} from './nodeDebugInterfaces';

/**
 * Placeholder localize function
 */
function localize(id: string, msg: string, ...args: any[]): string {
    args.forEach((arg, i) => {
        msg = msg.replace(new RegExp(`{${i}}`, 'g'), arg);
    });

    return msg;
};

export class NodeDebugAdapter extends ChromeDebugAdapter {
    private static NODE = 'node';

    public launch(args: LaunchRequestArguments): Promise<void> {
        this.setupLogging(args);

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
			if (PathUtils.normalizeDriveLetter(programPath) !== PathUtils.realPath(programPath)) {
				this.outLine(localize('program.path.case.mismatch.warning', "Program path uses differently cased character as file on disk; this might result in breakpoints not being hit."));
			}
		} else {
			this.sendAttributeMissingErrorResponse(response, 'program');
			return;
		}

        return this._attach(port, launchUrl, args.address);
    }

    // /**
	//  * 'Attribute missing' error
	//  */
	// private sendAttributeMissingErrorResponse(response: DebugProtocol.Response, attribute: string) {
	// 	this.sendErrorResponse(response, 2005, localize('attribute.missing', "Attribute '{0}' is missing or empty.", attribute));
	// }

	/**
	 * 'Path does not exist' error
	 */
	private getNotExistErrorResponse(attribute: string, path: string): Promise<void> {
		return Promise.reject({
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
