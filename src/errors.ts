/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { DebugProtocol } from 'vscode-debugprotocol';

import * as nls from 'vscode-nls';
import { ErrorWithMessage } from 'vscode-chrome-debug-core';
const localize = nls.loadMessageBundle();

export function runtimeNotFound(_runtime: string): DebugProtocol.Message {
    return new ErrorWithMessage({
        id: 2001,
        format: localize('VSND2001', "Cannot find runtime '{0}' on PATH. Is '{0}' installed?", '{_runtime}'),
        variables: { _runtime }
    });
}

export function cannotLaunchInTerminal(_error: string): DebugProtocol.Message {
    return new ErrorWithMessage({
        id: 2011,
        format: localize('VSND2011', 'Cannot launch debug target in terminal ({0}).', '{_error}'),
        variables: { _error }
    });
}

export function cannotLaunchDebugTarget(_error: string): DebugProtocol.Message {
    return new ErrorWithMessage({
        id: 2017,
        format: localize('VSND2017', 'Cannot launch debug target ({0}).', '{_error}'),
        variables: { _error },
        showUser: true,
        sendTelemetry: true
    });
}

export function cannotDebugExtension(_error: string): DebugProtocol.Message {
    return new ErrorWithMessage({
        id: 2035,
        format: localize('VSND2035', 'Cannot debug extension ({0}).', '{_error}'),
        variables: { _error },
        showUser: true,
        sendTelemetry: true
    });
}

export function unknownConsoleType(consoleType: string): DebugProtocol.Message {
    return new ErrorWithMessage({
        id: 2028,
        format: localize('VSND2028', "Unknown console type '{0}'.", consoleType)
    });
}

export function cannotLaunchBecauseSourceMaps(programPath: string): DebugProtocol.Message {
    return new ErrorWithMessage({
        id: 2002,
        format: localize('VSND2002', "Cannot launch program '{0}'; configuring source maps might help.", '{path}'),
        variables: { path: programPath }
    });
}

export function cannotLaunchBecauseOutFiles(programPath: string): DebugProtocol.Message {
    return new ErrorWithMessage({
        id: 2003,
        format: localize('VSND2003', "Cannot launch program '{0}'; setting the '{1}' attribute might help.", '{path}', 'outFiles'),
        variables: { path: programPath }
    });
}

export function cannotLaunchBecauseJsNotFound(programPath: string): DebugProtocol.Message {
    return new ErrorWithMessage({
        id: 2009,
        format: localize('VSND2009', "Cannot launch program '{0}' because corresponding JavaScript cannot be found.", '{path}'),
        variables: { path: programPath }
    });
}

export function cannotLoadEnvVarsFromFile(error: string): DebugProtocol.Message {
    return new ErrorWithMessage({
        id: 2029,
        format: localize('VSND2029', "Can't load environment variables from file ({0}).", '{_error}'),
        variables: { _error: error }
    });
}
