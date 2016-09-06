/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import {DebugProtocol} from 'vscode-debugprotocol';

/**
 * Arguments shared between Launch and Attach requests.
 */
export interface CommonArguments {
	/** comma separated list of trace selectors. Supported:
	 * 'all': all
	 * 'la': launch/attach
	 * 'ls': load scripts
	 * 'bp': breakpoints
	 * 'sm': source maps
	 * 'va': data structure access
	 * 'ss': smart steps
	 * 'rc': ref caching
	 * */
	trace?: string;
	/** The debug port to attach to. */
	port: number;
	/** The TCP/IP address of the port (remote addresses only supported for node >= 5.0). */
	address?: string;
	/** Retry for this number of milliseconds to connect to the node runtime. */
	timeout?: number;
	/** Automatically stop target after launch. If not specified, target does not stop. */
	stopOnEntry?: boolean;
	/** Configure source maps. By default source maps are disabled. */
	sourceMaps?: boolean;
	/** Where to look for the generated code. Only used if sourceMaps is true. */
	outDir?: string;
	/** Try to automatically step over uninteresting source. */
	smartStep?: boolean;

	// unofficial flags

	/** Step back supported. */
	stepBack?: boolean;
	/** Control mapping of node.js scripts to files on disk. */
	mapToFilesOnDisk?: boolean;
	/** make completion request available in evaluate request. */
	completionInEvaluate?: boolean;
}

type ConsoleType = "internalConsole" | "integratedTerminal" | "externalTerminal";

/**
 * This interface should always match the schema found in the node-debug extension manifest.
 */
export interface LaunchRequestArguments extends DebugProtocol.LaunchRequestArguments, CommonArguments {
	/** An absolute path to the program to debug. */
	program: string;
	/** Optional arguments passed to the debuggee. */
	args?: string[];
	/** Launch the debuggee in this working directory (specified as an absolute path). If omitted the debuggee is lauched in its own directory. */
	cwd?: string;
	/** Absolute path to the runtime executable to be used. Default is the runtime executable on the PATH. */
	runtimeExecutable?: string;
	/** Optional arguments passed to the runtime executable. */
	runtimeArgs?: string[];
	/** Optional environment variables to pass to the debuggee. The string valued properties of the 'environmentVariables' are used as key/value pairs. */
	env?: { [key: string]: string; };
	/** Where to launch the debug target. */
	console?: ConsoleType;

	/** Logging options */
	diagnosticLogging?: boolean;
    verboseDiagnosticLogging?: boolean;
}

/**
 * This interface should always match the schema found in the node-debug extension manifest.
 */
export interface AttachRequestArguments extends DebugProtocol.AttachRequestArguments, CommonArguments {
	/** Request frontend to restart session on termination. */
	restart?: boolean;
	/** Node's root directory. */
	remoteRoot?: string;
	/** VS Code's root directory. */
	localRoot?: string;
	/** Send a USR1 signal to this process. */
	processId?: string;
}

export type NodeDebugError = DebugProtocol.Message & Error;
