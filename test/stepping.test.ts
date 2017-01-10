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

            const skipFiles = ['unmapped'];

            return dc.hitBreakpoint({ program, sourceMaps: true, skipFiles }, { path: programSource, line: 7 })
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

            const skipFiles = ['calls-between-sourcemapped-*/*B'];

            return dc.hitBreakpoint({ program, sourceMaps: true, skipFiles }, { path: programSource, line: 8 })
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

            const skipFiles = ['calls-between-files-*/*B'];

            return Promise.all([
                testUtils.waitForEvent(dc, 'initialized').then(event => {
                    return dc.setExceptionBreakpointsRequest({
                        filters: ['caught']
                    });
                })
                .then(() => dc.setBreakpointsRequest({ source: { path: programSource }, breakpoints: [{ line: 7 }]}))
                .then(() => dc.configurationDoneRequest()),

                dc.launch({ program, sourceMaps: true, skipFiles }),
                dc.assertStoppedLocation('breakpoint', { path: programSource, line: 7 })
            ]).then(() => Promise.all([
                dc.nextRequest({ threadId: THREAD_ID }),
                dc.assertStoppedLocation('step', { path: programSource, line: 8 })
            ]));
        });

        test('still stops at breakpoint in skipped file', async () => {
            const program = path.join(DATA_ROOT, 'calls-between-sourcemapped-files/out/sourceA.js');
            const programASource = path.join(DATA_ROOT, 'calls-between-sourcemapped-files/src/sourceA.ts');
            const programBSource = path.join(DATA_ROOT, 'calls-between-sourcemapped-files/src/sourceB.ts');

            const skipFiles = ['calls-between-sourcemapped-*/*B'];

            const bpLineB = 2;
            await dc.hitBreakpoint({ program, sourceMaps: true, skipFiles }, { path: programASource, line: 8 })
            await dc.setBreakpointsRequest({ source: { path: programBSource }, breakpoints: [{ line: bpLineB }]});
            await Promise.all([
                dc.stepInRequest({ threadId: THREAD_ID }),
                dc.assertStoppedLocation('breakpoint', { path: programBSource, line: bpLineB })
            ]);
        });

        test('can toggle skipping on and off', async () => {
            const program = path.join(DATA_ROOT, 'calls-between-sourcemapped-files/out/sourceA.js');
            const programASource = path.join(DATA_ROOT, 'calls-between-sourcemapped-files/src/sourceA.ts');
            const programBSource = path.join(DATA_ROOT, 'calls-between-sourcemapped-files/src/sourceB.ts');

            const bpLineA = 8;
            await Promise.all([
                testUtils.waitForEvent(dc, 'initialized').then(event => {
                    return dc.setExceptionBreakpointsRequest({
                        filters: ['caught']
                    });
                })
                .then(() => dc.setBreakpointsRequest({ source: { path: programASource }, breakpoints: [{ line: bpLineA }]}))
                .then(() => dc.configurationDoneRequest()),

                dc.launch({ program, sourceMaps: true }),
                dc.assertStoppedLocation('breakpoint', { path: programASource, line: bpLineA })
            ]);

            // Step into sourceB, set it to be skipped
            await Promise.all([
                dc.stepInRequest({ threadId: THREAD_ID }),
                dc.assertStoppedLocation('step', { path: programBSource, line: 2 })
            ]);
            await dc.send('toggleSkipFileStatus', { path: programBSource });

            // Continue back to sourceA, step through B, back to A
            await dc.continueRequest({ threadId: THREAD_ID });
            await dc.assertStoppedLocation('breakpoint', { path: programASource, line: bpLineA });
            await dc.stepInRequest({ threadId: THREAD_ID });
            await dc.assertStoppedLocation('step', { path: programASource, line: 4 });

            // Toggle B back to not being skipped, continue to A, step in to B
            await dc.send('toggleSkipFileStatus', { path: programBSource });
            await dc.continueRequest({ threadId: THREAD_ID });
            await dc.assertStoppedLocation('breakpoint', { path: programASource, line: bpLineA });
            await dc.stepInRequest({ threadId: THREAD_ID });
            await dc.assertStoppedLocation('step', { path: programBSource, line: 2 })
        });

        test('when generated script is skipped via regex, the source can be un-skipped', async () => {
            const program = path.join(DATA_ROOT, 'calls-between-merged-files/out/sourceA.js');
            const sourceA = path.join(DATA_ROOT, 'calls-between-merged-files/sourceA.ts');
            const sourceB2 = path.join(DATA_ROOT, 'calls-between-merged-files/sourceB2.ts');

            // Skip the full B generated script via launch config
            const skipFiles = ['**/out/sourceB1.js'];
            const bpLineA = 8;
            await dc.hitBreakpoint({ program, sourceMaps: true, skipFiles }, { path: sourceA, line: bpLineA });

            // Step in, verify B sources are skipped
            await dc.stepInRequest({ threadId: THREAD_ID });
            await dc.assertStoppedLocation('step', { path: sourceA, line: 4 });
            await dc.send('toggleSkipFileStatus', { path: sourceB2 });

            // Continue back to sourceA, step in, should skip B1 and land on B2
            await dc.continueRequest({ threadId: THREAD_ID });
            await dc.assertStoppedLocation('breakpoint', { path: sourceA, line: bpLineA });
            await dc.stepInRequest({ threadId: THREAD_ID });
            await dc.assertStoppedLocation('step', { path: sourceB2, line: 2 });
        });

        test('toggle non-sourcemapped')
    });
});
