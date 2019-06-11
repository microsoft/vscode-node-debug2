/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import {
    BaseCDAState, injectable, IInitializeRequestArgs, UninitializedCDA, ITelemetryPropertyCollector,
    IDebugAdapterState, ISession, inject, TYPES, logger
} from 'vscode-chrome-debug-core';
import { DebugProtocol } from 'vscode-debugprotocol';
import { getDAOrCreate } from '../v1-backwards-compatiblity/getDA';

/**
 * We use our own version of the UninitializedCDA component to declare some extra capabilities that this client supports
 */
@injectable()
export class CustomizedUninitializedCDA extends BaseCDAState {
    public constructor(
        @inject(TYPES.ISession) protected readonly _session: ISession,
        private readonly _wrappedUninitializedCDA: UninitializedCDA) {
        super([], { 'initialize': (args, telemetryPropertyCollector) => this.initialize(args, telemetryPropertyCollector) });
    }

    public async install(): Promise<this> {
        await super.install();
        await this._wrappedUninitializedCDA.install();
        return this;
    }

    private async initialize(args: IInitializeRequestArgs, telemetryPropertyCollector?: ITelemetryPropertyCollector): Promise<{ capabilities: DebugProtocol.Capabilities, newState: IDebugAdapterState }> {
        const coreResponse = await this._wrappedUninitializedCDA.initialize(args, telemetryPropertyCollector);
        const coreCapabilitites = coreResponse.capabilities;
        const daResponse = getDAOrCreate(this._session).initialize(args);
        const capabilities = Object.assign({}, coreCapabilitites, daResponse);
        return { newState: coreResponse.newState, capabilities };
    }
}
