/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as path from 'path';

import * as ts from 'vscode-chrome-debug-core-testsupport';
import { DebugProtocol } from 'vscode-debugprotocol';

import * as utils from '../src/utils';
import * as testSetup from './testSetup';

const DATA_ROOT = testSetup.DATA_ROOT;

suite('Node Debug Adapter etc', () => {

    let dc: ts.debugClient.ExtendedDebugClient;
    setup(() => {
        return testSetup.setup()
            .then(_dc => dc = _dc);
    });

    teardown(() => {
        return testSetup.teardown();
    });

    suite('basic', () => {
        test('unknown request should produce error', done => {
            dc.send('illegal_request').then(() => {
                done(new Error('does not report error on unknown request'));
            }).catch(() => {
                done();
            });
        });
    });

    suite('initialize', () => {
        test('should return supported features', () => {
            return dc.initializeRequest().then(response => {
                assert.equal(response.body.supportsConfigurationDoneRequest, true);
            });
        });

        test('should produce error for invalid \'pathFormat\'', () => {
            return dc.initializeRequest({
                adapterID: 'mock',
                linesStartAt1: true,
                columnsStartAt1: true,
                pathFormat: 'url'
            }).then(response => {
                throw new Error('does not report error on invalid \'pathFormat\' attribute');
            }).catch(err => {
                // error expected
            });
        });
    });

    suite('launch', () => {
        test('should run program to the end', () => {
            if (utils.compareSemver(process.version, 'v8.0.0') < 0) {
                // Skip test if the node version doesn't emit the Runtime.executionContextDestroyed event
                return Promise.resolve();
            }

            const PROGRAM = path.join(DATA_ROOT, 'program.js');

            return Promise.all([
                dc.configurationSequence(),
                dc.launch({ program: PROGRAM }),
                dc.waitForEvent('terminated')
            ]);
        });

        test('should stop on entry', () => {
            const PROGRAM = path.join(DATA_ROOT, 'program.js');
            const ENTRY_LINE = 1;

            return Promise.all([
                dc.configurationSequence(),
                dc.launch({ program: PROGRAM, stopOnEntry: true }),
                dc.assertStoppedLocation('entry', { path: PROGRAM, line: ENTRY_LINE } )
            ]);
        });

        test('should stop on debugger statement', () => {
            const PROGRAM = path.join(DATA_ROOT, 'programWithDebugger.js');
            const DEBUGGER_LINE = 6;

            return Promise.all([
                dc.configurationSequence(),
                dc.launch({ program: PROGRAM }),
                dc.assertStoppedLocation('debugger_statement', { path: PROGRAM, line: DEBUGGER_LINE } )
            ]);
        });

    });


    suite('output events', () => {
        // https://github.com/Microsoft/vscode/issues/37770
        test('get output events in correct order', async () => {
            const PROGRAM = path.join(DATA_ROOT, 'programWithConsoleLogging.js');
            await Promise.all([
                dc.configurationSequence(),
                dc.launch({ program: PROGRAM })]);

            let lastEventType: string;
            return new Promise((resolve, reject) => {
                dc.on('output', outputEvent => {
                    const msg: string = outputEvent.body.output.trim();
                    if (msg.startsWith('log:') || msg.startsWith('error:')) {
                        const type: string = outputEvent.body.category;
                        if (type === lastEventType) {
                            return reject(new Error(`Got two messages in a row of type ${type}`));
                        } else if (msg === 'error: 9') {
                            return resolve();
                        }

                        lastEventType = type;
                    }
                });
            });
        });

        // https://github.com/Microsoft/vscode-node-debug2/issues/156
        test(`don't lose error output at the end of the program`, async () => {
            // It's possible for some Node versions to exit and never report the exception
            if (utils.compareSemver(process.version, 'v8.5.0') < 0) {
                return Promise.resolve();
            }

            const PROGRAM = path.join(DATA_ROOT, 'programWithUncaughtException.js');
            await Promise.all([
                dc.configurationSequence(),
                dc.launch({ program: PROGRAM })]);

            let gotOutput = false;
            return new Promise((resolve, reject) => {
                dc.on('output', outputEvent => {
                    const msg: string = outputEvent.body.output.trim();
                    if (msg.startsWith('Error: uncaught exception')) {
                        gotOutput = true;
                        resolve();
                    }
                });

                dc.on('terminated', () => {
                    if (!gotOutput) {
                        reject(new Error('Terminated before exception output received'));
                    }
                });
            });
        });
    });

    suite('eval', () => {
        const PROGRAM = path.join(DATA_ROOT, 'programWithFunction.js');
        function start(): Promise<void> {
            return Promise.all([
                dc.configurationSequence(),
                dc.launch({ program:  PROGRAM }),
                dc.waitForEvent('initialized')
            ]).then(() => { });
        }

        test('works for a simple case', () => {
            return start()
                .then(() => dc.evaluateRequest({ expression: '1 + 1' }))
                .then(response => {
                        assert(response.success);
                        assert.equal(response.body.result, '2');
                        assert.equal(response.body.variablesReference, 0);
                });
        });

        test('evaluates a global node thing', () => {
            return start()
                .then(() => dc.evaluateRequest({ expression: 'Object' }))
                .then(response => {
                    assert(response.success);
                    assert.equal(response.body.result, 'function Object() { … }');
                    assert(response.body.variablesReference > 0);
                });
        });

        test('returns "not available" for a reference error', () => {
            return start()
                .then(() => dc.evaluateRequest({ expression: 'notDefinedThing' }))
                .catch(response => {
                    assert.equal(response.message, 'not available');
                });
        });

        test('returns the error message for another error', () => {
            return start()
                .then(() => dc.evaluateRequest({ expression: 'throw new Error("fail")' }))
                .catch(response => {
                    assert.equal(response.message, 'Error: fail');
                });
        });

        test('Shows object previews', () => {
            return start()
                .then(() => dc.evaluateRequest({ expression: 'x = {a: 1, b: [1], c: {a: 1}}' }))
                .then(response => {
                    assert(response.success);
                    assert(response.body.result === 'Object {a: 1, b: Array(1), c: Object}' ||
                        response.body.result === 'Object {a: 1, b: Array[1], c: Object}');
                    assert(response.body.variablesReference > 0);
                });
        });

        test('Shows array previews', () => {
            return start()
                .then(() => dc.evaluateRequest({ expression: '[1, [1], {a: 3}]' }))
                .then(response => {
                    assert(response.success);
                    assert(response.body.result === 'Array[3] [1, Array[1], Object]' ||
                        response.body.result === 'Array(3) [1, Array(1), Object]');
                    assert(response.body.variablesReference > 0);
                });
        });
    });

    suite('completions', () => {
        const PROGRAM = path.join(DATA_ROOT, 'programWithVariables.js');

        function start(): Promise<void> {
            return Promise.all([
                dc.configurationSequence(),
                dc.launch({ program:  PROGRAM }),
                dc.waitForEvent('initialized'),
                dc.waitForEvent('stopped')
            ]).then(() => { });
        }

        function testCompletions(text: string, column = text.length + 1, frameIdx = 0): Promise<DebugProtocol.CompletionItem[]> {
            return start()
                .then(() => dc.stackTraceRequest())
                .then(stackTraceResponse => stackTraceResponse.body.stackFrames.map(frame => frame.id))
                .then(frameIds => dc.send('completions', <DebugProtocol.CompletionsArguments>{ text, column, frameId: frameIds[frameIdx] }))
                .then((response: DebugProtocol.CompletionsResponse) => response.body.targets);
        }

        function inCompletionsList(completions: DebugProtocol.CompletionItem[], ...labels: string[]): boolean {
            return labels.every(label => completions.filter(target => target.label === label).length === 1);
        }

        test('returns global vars', () => {
            return testCompletions('')
                .then(completions => assert(inCompletionsList(completions, 'global')));
        });

        test('returns local vars', () => {
            return testCompletions('')
                .then(completions => assert(inCompletionsList(completions, 'num', 'str', 'arr', 'obj')));
        });

        test('returns methods', () => {
            return testCompletions('arr.')
                .then(completions => assert(inCompletionsList(completions, 'push', 'indexOf')));
        });

        test('returns object properties', () => {
            return testCompletions('obj.')
                .then(completions => assert(inCompletionsList(completions, 'a', 'b')));
        });

        test('multiple dots', () => {
            return testCompletions('obj.b.')
                .then(completions => assert(inCompletionsList(completions, 'startsWith', 'endsWith')));
        });

        test('returns from the correct column', () => {
            return testCompletions('obj.b.', /*column=*/6)
                .then(completions => assert(inCompletionsList(completions, 'a', 'b')));
        });

        test('returns from the correct frameId', () => {
            return testCompletions('obj', undefined, /*frameId=*/1)
                .then(completions => assert(!inCompletionsList(completions, 'obj')));
        });

        test('returns properties of string literals', () => {
            return testCompletions('"".')
                .then(completions => assert(inCompletionsList(completions, 'startsWith')));
        });
    });

    suite('hit condition bps', () => {
        const PROGRAM = path.join(DATA_ROOT, 'programWithFunction.js');
        function continueAndStop(line: number): Promise<any> {
            return dc.continueTo('breakpoint', { path: PROGRAM, line });
        }

        test('Works for =', () => {
            const noCondBpLine = 15;
            const condBpLine = 14;
            const bps: DebugProtocol.SourceBreakpoint[] = [
                    { line: condBpLine, hitCondition: '=2' },
                    { line: noCondBpLine }];

            return Promise.all([
                ts.debugClient.setBreakpointOnStart(dc, bps, PROGRAM),

                dc.launch({ program: PROGRAM }),

                // Assert that it skips
                dc.assertStoppedLocation('breakpoint', { path: PROGRAM, line: noCondBpLine })
                    .then(() => continueAndStop(condBpLine))
                    .then(() => continueAndStop(noCondBpLine))
                    .then(() => continueAndStop(noCondBpLine))
            ]);
        });

        test('Works for %', () => {
            const noCondBpLine = 15;
            const condBpLine = 14;
            const bps: DebugProtocol.SourceBreakpoint[] = [
                    { line: condBpLine, hitCondition: '%3' },
                    { line: noCondBpLine }];

            return Promise.all([
                ts.debugClient.setBreakpointOnStart(dc, bps, PROGRAM),

                dc.launch({ program: PROGRAM }),

                // Assert that it skips
                dc.assertStoppedLocation('breakpoint', { path: PROGRAM, line: noCondBpLine })
                    .then(() => continueAndStop(noCondBpLine))
                    .then(() => continueAndStop(condBpLine))
                    .then(() => continueAndStop(noCondBpLine))
            ]);
        });

        test('Does not bind when invalid', () => {
            const condBpLine = 14;
            const bps: DebugProtocol.SourceBreakpoint[] = [
                    { line: condBpLine, hitCondition: 'lsdf' }];

            return Promise.all([
                ts.debugClient.setBreakpointOnStart(dc, bps, PROGRAM, undefined, undefined, /*expVerified=*/false),
                dc.launch({ program: PROGRAM })
            ]);
        });
    });

    suite('get loaded scripts', () => {
        function assertHasSource(loadedSources: DebugProtocol.Source[], expectedPath: string): void {
            assert(loadedSources.find(source => source.path === expectedPath));
        }

        test('returns all scripts', async () => {
            const PROGRAM = path.join(DATA_ROOT, 'simple-eval/index.js');
            await dc.hitBreakpoint({ program: PROGRAM }, { path: PROGRAM, line: 3 });
            const { sources } = await dc.loadedSources({ });

            assert(!!sources);
            assert(sources.length > 10);

            // Has the program
            assertHasSource(sources, PROGRAM);

            // Has some node_internals script
            const nodeInternalsScript = '<node_internals>/timers.js';
            assertHasSource(sources, nodeInternalsScript);

            // Has the eval script
            assert(sources.filter(source => source.path.match(/VM\d+/)).length >= 1);
        });
    });

    suite('async callstacks', () => {
        function assertAsyncLabelCount(stackTrace: DebugProtocol.StackTraceResponse, expectedAsyncLabels: number): void {
            assert.equal(stackTrace.body.stackFrames.filter(frame => !frame.source).length, expectedAsyncLabels);
        }

        function assertStackFrame(stackTrace: DebugProtocol.StackTraceResponse, i: number, sourcePath: string, line: number): void {
            const frame = stripAsyncHookFrames(stackTrace)[i];

            assert(!!frame);
            assert.equal(frame.source && frame.source.path, sourcePath);

            // Before node 8.7, a stackframe before an async call is on the first line of the calling function, not the function decl line.
            // Same with 8.9.4 exactly. So just check for either one.
            assert(frame.line === line || frame.line === line - 1, `Expected line ${line} or ${line - 1}`);
        }

        /**
         * After node 8.7, there are two async_hooks frames to count. In 8.9.4 exactly, the async_hook frames don't show up in the stack.
         * Then in later versions they show up again. Easier to just remove them to use the same stack trace indexes for all versions.
         */
        function stripAsyncHookFrames(stackTrace: DebugProtocol.StackTraceResponse): DebugProtocol.StackFrame[] {
            return stackTrace.body.stackFrames.filter(frame => !frame.source || frame.source.path.indexOf('async_hook') < 0);
        }

        test('shows async stacks for promise resolution', async () => {
            const PROGRAM = path.join(DATA_ROOT, 'promise-chain/main.js');
            const breakpoints: DebugProtocol.SourceBreakpoint[] = [7, 13, 19, 25, 31].map(line => ({ line }));

            await dc.hitBreakpoint({ program: PROGRAM, showAsyncStacks: true }, { path: PROGRAM, line: 45});
            await dc.setBreakpointsRequest({ source: { path: PROGRAM }, breakpoints });

            await dc.continueAndStop();
            assertAsyncLabelCount(await dc.stackTraceRequest(), 1);

            await dc.continueAndStop();
            assertAsyncLabelCount(await dc.stackTraceRequest(), 2);

            await dc.continueAndStop();
            assertAsyncLabelCount(await dc.stackTraceRequest(), 3);

            await dc.continueAndStop();
            assertAsyncLabelCount(await dc.stackTraceRequest(), 4);

            // Hit the limit of 4 async parents
            await dc.continueAndStop();
            assertAsyncLabelCount(await dc.stackTraceRequest(), 4);
        });

        async function stepOverNativeAwait(fromLine: number, afterBp = false) {
            const toLine = fromLine + 1;

            if (utils.compareSemver(process.version, 'v8.0.0') < 0 || (utils.compareSemver(process.version, 'v8.4.0') >= 0 && utils.compareSemver(process.version, 'v8.7.0') < 0)) {
                // In pre-8, must always step twice over await lines
                await dc.nextTo('step', { line: fromLine });
                await dc.nextTo('step', { line: fromLine });
            } else if (!afterBp && utils.compareSemver(process.version, 'v8.7.0') < 0) {
                // In 8, must step an extra time if a BP on this line didn't cause the break
                await dc.nextTo('step', { line: fromLine });
            }

            await dc.nextTo('step', { line: toLine });
        }

        test('shows async stacks and steps correctly for native async/await, pre v10', async () => {
            if (utils.compareSemver(process.version, 'v7.6.0') < 0 || utils.compareSemver(process.version, 'v10.0.0') >= 0) {
                return Promise.resolve();
            }

            const PROGRAM = path.join(DATA_ROOT, 'native-async-await/main.js');
            await dc.hitBreakpoint({ program: PROGRAM, showAsyncStacks: true, skipFiles: ['<node_internals>/**'] }, { path: PROGRAM, line: 8 });

            await stepOverNativeAwait(8, /*afterBp=*/true);
            let stackTrace = await dc.stepInTo('step', { line: 13 });
            assertStackFrame(stackTrace, 3, PROGRAM, 8);
            assertStackFrame(stackTrace, 4, PROGRAM, 40);
            assertAsyncLabelCount(stackTrace, 1);

            await stepOverNativeAwait(13);
            stackTrace = await dc.stepInTo('step', { line: 18 });
            assertStackFrame(stackTrace, 3, PROGRAM, 13);
            assertStackFrame(stackTrace, 4, PROGRAM, 9);
            assertAsyncLabelCount(stackTrace, 2);

            await stepOverNativeAwait(18);
            stackTrace = await dc.stepInTo('step', { line: 23 });
            assertStackFrame(stackTrace, 3, PROGRAM, 18);
            assertStackFrame(stackTrace, 4, PROGRAM, 14);
            assertAsyncLabelCount(stackTrace, 3);

            await stepOverNativeAwait(23);
            stackTrace = await dc.stepInTo('step', { line: 28 });
            assertStackFrame(stackTrace, 3, PROGRAM, 23);
            assertStackFrame(stackTrace, 4, PROGRAM, 19);
            assertAsyncLabelCount(stackTrace, 4);
        });

        // test.only('shows async stacks and steps correctly for native async/await', async () => {
        //     if (utils.compareSemver(process.version, 'v10.0.0') < 0) {
        //         return Promise.resolve();
        //     }

        //     const PROGRAM = path.join(DATA_ROOT, 'native-async-await/main.js');
        //     await dc.hitBreakpoint({ program: PROGRAM, showAsyncStacks: true, skipFiles: ['<node_internals>/**'] }, { path: PROGRAM, line: 8 });

        //     await stepOverNativeAwait(8, /*afterBp=*/true);
        //     let stackTrace = await dc.stepInTo('step', { line: 13 });
        //     assertStackFrame(stackTrace, 3, PROGRAM, 8);
        //     assertStackFrame(stackTrace, 4, PROGRAM, 40);
        //     assertAsyncLabelCount(stackTrace, 1);

        //     await stepOverNativeAwait(13);
        //     stackTrace = await dc.stepInTo('step', { line: 18 });
        //     assertStackFrame(stackTrace, 3, PROGRAM, 8);
        //     assertAsyncLabelCount(stackTrace, 2);

        //     await stepOverNativeAwait(18);
        //     stackTrace = await dc.stepInTo('step', { line: 23 });
        //     assertStackFrame(stackTrace, 3, PROGRAM, 13);
        //     assertAsyncLabelCount(stackTrace, 3);

        //     await stepOverNativeAwait(23);
        //     stackTrace = await dc.stepInTo('step', { line: 28 });
        //     assertStackFrame(stackTrace, 3, PROGRAM, 18);
        //     assertAsyncLabelCount(stackTrace, 4);
        // });
    });
});
