/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as path from 'path';

import * as ts from 'vscode-chrome-debug-core-testsupport';
// import { DebugProtocol } from 'vscode-debugprotocol';

import * as testSetup from './testSetup';

const DATA_ROOT = testSetup.DATA_ROOT;

suite('Variables', () => {

    let dc: ts.debugClient.ExtendedDebugClient;
    setup(() => {
        return testSetup.setup()
            .then(_dc => dc = _dc);
    });

    teardown(() => {
        return testSetup.teardown();
    });

    test('retrieves props of a large buffer', async () => {
        const PROGRAM = path.join(DATA_ROOT, 'large-buffer/largeBuffer.js');
        await dc.hitBreakpoint({ program: PROGRAM }, { path: PROGRAM, line: 2 });

        const stack = await dc.stackTraceRequest();
        assert(stack.body.stackFrames && stack.body.stackFrames.length > 0, 'Did not return any stackframes');

        const firstFrameId = stack.body.stackFrames[0].id;
        const scopes = await dc.scopesRequest({ frameId: firstFrameId });
        assert(scopes.body.scopes && scopes.body.scopes.length > 0, 'Did not return any scopes');

        const localScope = scopes.body.scopes[0];
        const localScopeVars = await dc.variablesRequest({ variablesReference: localScope.variablesReference });
        const bufferVar = localScopeVars.body.variables.find(vbl => vbl.name === 'buffer');
        assert(bufferVar, 'Did not return a var named buffer');
        assert(bufferVar.indexedVariables > 0, 'Must return some indexedVariables');
        assert(bufferVar.namedVariables === 0, 'Must not return namedVariables');

        const bufferProps = await dc.variablesRequest({ variablesReference: bufferVar.variablesReference, filter: 'indexed', start: 0, count: 100 });

        // Just assert that something is returned, and that the last request doesn't fail or time out
        assert(bufferProps.body.variables.length > 0, 'Some variables must be returned');
    });
});