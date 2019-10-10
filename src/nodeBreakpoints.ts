/*---------------------------------------------------------
* Copyright (C) Microsoft Corporation. All rights reserved.
*--------------------------------------------------------*/

import { Breakpoints, chromeConnection, InternalSourceBreakpoint, ISetBreakpointResult, ISetBreakpointsArgs, logger, ScriptContainer } from 'vscode-chrome-debug-core';
import { NodeDebugAdapter } from './nodeDebugAdapter';

export class NodeBreakpoints extends Breakpoints {
    constructor(private nodeDebugAdapter: NodeDebugAdapter, chromeConnection: chromeConnection.ChromeConnection) {
        super(nodeDebugAdapter, chromeConnection);
    }

    /**
     * Override addBreakpoints, which is called by setBreakpoints to make the actual call to Chrome.
     */
    protected async addBreakpoints(url: string, breakpoints: InternalSourceBreakpoint[], scripts: ScriptContainer): Promise<ISetBreakpointResult[]> {
        const responses = await super.addBreakpoints(url, breakpoints, scripts);
        if (this.nodeDebugAdapter.entryPauseEvent && !this.nodeDebugAdapter.finishedConfig) {
            const entryLocation = this.nodeDebugAdapter.entryPauseEvent.callFrames[0].location;
            const bpAtEntryLocationIdx = responses.findIndex(response => {
                // Don't compare column location, because you can have a bp at col 0, then break at some other column
                return response && response.actualLocation && response.actualLocation.lineNumber === entryLocation.lineNumber &&
                    response.actualLocation.scriptId === entryLocation.scriptId;
            });
            const bpAtEntryLocation = bpAtEntryLocationIdx >= 0 && breakpoints[bpAtEntryLocationIdx];

            if (bpAtEntryLocation) {
                let conditionPassed = true;
                if (bpAtEntryLocation.condition) {
                    const evalConditionResponse = await this.nodeDebugAdapter.evaluateOnCallFrame(bpAtEntryLocation.condition, this.nodeDebugAdapter.entryPauseEvent.callFrames[0]);
                    conditionPassed = !evalConditionResponse.exceptionDetails && (!!evalConditionResponse.result.objectId || !!evalConditionResponse.result.value);
                }

                if (conditionPassed) {
                    // There is some initial breakpoint being set to the location where we stopped on entry, so need to pause even if
                    // the stopOnEntry flag is not set
                    logger.log('Got a breakpoint set in the entry location, so will stop even though stopOnEntry is not set');
                    this.nodeDebugAdapter.continueAfterConfigDone = false;
                    this.nodeDebugAdapter.expectingStopReason = 'breakpoint';
                } else {
                    logger.log('Breakpoint condition at entry location did not evaluate to truthy value');
                }
            }
        }

        return responses;
    }

    protected validateBreakpointsPath(args: ISetBreakpointsArgs): Promise<void> {
        return super.validateBreakpointsPath(args).catch(e => {
            if (!this.nodeDebugAdapter.launchAttachArgs.disableOptimisticBPs && args.source.path && this.nodeDebugAdapter.jsDeterminant.isJavaScript(args.source.path)) {
                return undefined;
            } else {
                return Promise.reject(e);
            }
        });
    }
}
