/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as path from 'path';
import {DebugClient} from 'vscode-debugadapter-testsupport';

import * as testUtils from './testUtils';
import * as testSetup from './testSetup';

const THREAD_ID = testUtils.THREAD_ID;

suite('Stepping', () => {
    const DATA_ROOT = testSetup.DATA_ROOT;

    let dc: DebugClient;
    setup(() => {
        return testSetup.setup()
            .then(_dc => dc = _dc);
    });

    teardown(() => {
        return testSetup.teardown();
    });

    suite('basic', () => {
        const PROGRAM = path.join(DATA_ROOT, 'program.js');

        function start(): Promise<void> {
            return dc.hitBreakpoint({ program: PROGRAM }, { path: PROGRAM, line: 1 });
        }

        test('returns the same frameIDs between steps', () => {
            let firstFrameIDs: number[];
            return start()
                .then(() => {
                    return Promise.all([
                        dc.nextRequest({threadId: THREAD_ID }),
                        testUtils.waitForEvent(dc, 'stopped')]);
                })
                .then(() => dc.stackTraceRequest({ threadId: THREAD_ID }))
                .then(stackTraceResponse => {
                    firstFrameIDs = stackTraceResponse.body.stackFrames.map(frame => frame.id);

                    return Promise.all([
                        dc.nextRequest({threadId: THREAD_ID }),
                        testUtils.waitForEvent(dc, 'stopped')]);
                })
                .then(() => dc.stackTraceRequest({ threadId: THREAD_ID }))
                .then(frameResponse => {
                    const secondFrameIDs = frameResponse.body.stackFrames.map(frame => frame.id);
                    assert.deepEqual(firstFrameIDs, secondFrameIDs);
                });
        });

        test('smart stepping steps over unmapped files', () => {
            const program = path.join(DATA_ROOT, 'sourcemaps-with-and-without/out/mapped.js');
            const programSource = path.join(DATA_ROOT, 'sourcemaps-with-and-without/src/mapped.ts');

            return dc.hitBreakpoint({ program, smartStep: true, sourceMaps: true }, { path: programSource, line: 7 })
                .then(() => Promise.all([
                    dc.stepInRequest({ threadId: THREAD_ID }),
                    testUtils.waitForEvent(dc, 'stopped')
                ]))
                .then(() => dc.stackTraceRequest({threadId: THREAD_ID }))
                .then(stackTraceResponse => {
                    const firstFrame = stackTraceResponse.body.stackFrames[0];
                    assert.equal(firstFrame.source.path, programSource);
                    assert.equal(firstFrame.line, 4);
                });
        });

        test('smart stepping stops on exceptions in unmapped files', () => {
            const PROGRAM = path.join(DATA_ROOT, 'programWithException.js');
            const EXCEPTION_LINE = 6;

            return Promise.all([
                testUtils.waitForEvent(dc, 'initialized').then(event => {
                    return dc.setExceptionBreakpointsRequest({
                        filters: [ 'all' ]
                    });
                }).then(response => {
                    return dc.configurationDoneRequest();
                }),

                dc.launch({ program: PROGRAM, sourceMaps: true, smartStep: true }),

                dc.assertStoppedLocation('exception', { path: PROGRAM, line: EXCEPTION_LINE } )
            ]);
        });
    });

    suite('skipFiles', () => {
        test('steps through un-sourcemapped file', () => {
            const program = path.join(DATA_ROOT, 'sourcemaps-with-and-without/out/mapped.js');
            const programSource = path.join(DATA_ROOT, 'sourcemaps-with-and-without/src/mapped.ts');

            const experimentalSkipFiles = ['unmapped'];

            return dc.hitBreakpoint({ program, sourceMaps: true, experimentalSkipFiles }, { path: programSource, line: 7 })
                .then(() => Promise.all([
                    dc.stepInRequest({ threadId: THREAD_ID }),
                    testUtils.waitForEvent(dc, 'stopped')
                ]))
                .then(() => dc.stackTraceRequest({threadId: THREAD_ID }))
                .then(stackTraceResponse => {
                    const firstFrame = stackTraceResponse.body.stackFrames[0];
                    assert.equal(firstFrame.source.path, programSource);
                    assert.equal(firstFrame.line, 4);
                });
        });

        test('steps through sourcemapped file', () => {
            const program = path.join(DATA_ROOT, 'calls-between-sourcemapped-files/out/sourceA.js');
            const programSource = path.join(DATA_ROOT, 'calls-between-sourcemapped-files/src/sourceA.ts');

            const experimentalSkipFiles = ['calls-between-sourcemapped-*/*B'];

            return dc.hitBreakpoint({ program, sourceMaps: true, experimentalSkipFiles }, { path: programSource, line: 7 })
                .then(() => Promise.all([
                    dc.stepInRequest({ threadId: THREAD_ID }),
                    testUtils.waitForEvent(dc, 'stopped')
                ]))
                .then(() => dc.stackTraceRequest({threadId: THREAD_ID }))
                .then(stackTraceResponse => {
                    const firstFrame = stackTraceResponse.body.stackFrames[0];
                    assert.equal(firstFrame.source.path, programSource);
                    assert.equal(firstFrame.line, 4);
                });
        });

        test('steps over exception in skipped file', () => {
            const program = path.join(DATA_ROOT, 'calls-between-files-with-exception/out/sourceA.js');
            const programSource = path.join(DATA_ROOT, 'calls-between-files-with-exception/src/sourceA.ts');

            const experimentalSkipFiles = ['calls-between-files-*/*B'];

            return Promise.all([
                testUtils.waitForEvent(dc, 'initialized').then(event => {
                    return dc.setExceptionBreakpointsRequest({
                        filters: ['caught']
                    });
                })
                .then(() => dc.setBreakpointsRequest({ source: { path: programSource }, breakpoints: [{ line: 7 }]}))
                .then(() => dc.configurationDoneRequest()),

                dc.launch({ program, sourceMaps: true, experimentalSkipFiles }),
                dc.assertStoppedLocation('breakpoint', { path: programSource, line: 7 })
            ]).then(() => Promise.all([
                dc.nextRequest({ threadId: THREAD_ID }),
                dc.assertStoppedLocation('step', { path: programSource, line: 8 })
            ]));
        });
    });
});
