/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/
import { injectable, IDOMInstrumentationBreakpointsSetter, CDTP } from 'vscode-chrome-debug-core';

@injectable()
export class FakeDOMInstrumentationBreakpointsSetter implements IDOMInstrumentationBreakpointsSetter {
    public async setInstrumentationBreakpoint(params: CDTP.DOMDebugger.SetInstrumentationBreakpointRequest): Promise<void> {
    }

    public async removeInstrumentationBreakpoint(params: CDTP.DOMDebugger.SetInstrumentationBreakpointRequest): Promise<void> {
    }
}
