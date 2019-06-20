/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/
import { injectable, IDebuggeeRuntimeVersionProvider, Version } from 'vscode-chrome-debug-core';
import { CDTPComponentsVersions } from 'vscode-chrome-debug-core';

@injectable()
export class FakeNodeVersionProvider implements IDebuggeeRuntimeVersionProvider {
    public async version(): Promise<Version> {
        return Version.coerce('10.0.0');
    }

    public async componentVersions(): Promise<CDTPComponentsVersions> {
        return {
            crdp: '1.0.0.0',
            product: '1.0.0.0',
            revision: '1.0.0.0',
            userAgent: '1.0.0.0',
            v8: '1.0.0.0',
        };
    }
}
