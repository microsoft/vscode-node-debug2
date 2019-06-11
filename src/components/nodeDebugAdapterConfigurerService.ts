/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/
import { IServiceComponent, injectable, inject, TYPES, BasePathTransformer, CDTP, BaseSourceMapTransformer } from 'vscode-chrome-debug-core';
import { getDA } from '../v1-backwards-compatiblity/getDA';

@injectable()
export class NodeDebugAdapterConfigurerService implements IServiceComponent {
    public constructor(
        @inject(TYPES.BasePathTransformer) private readonly _pathTransformer: BasePathTransformer,
        @inject(TYPES.CDTPClient) private readonly _protocolApi: CDTP.ProtocolApi,
        @inject(TYPES.BaseSourceMapTransformer) private readonly _sourceMapTransformer: BaseSourceMapTransformer) { }

    public install(): this {
        getDA().configure(this._pathTransformer, this._sourceMapTransformer, this._protocolApi);
        return this;
    }
}
