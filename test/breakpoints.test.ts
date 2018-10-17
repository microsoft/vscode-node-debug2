/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as child_process from 'child_process';
import * as path from 'path';
import { DebugProtocol } from 'vscode-debugprotocol';
import * as ts from 'vscode-chrome-debug-core-testsupport';
import * as utils from '../src/utils';

import * as testSetup from './testSetup';

suite('Breakpoints', () => {
    const DATA_ROOT = testSetup.DATA_ROOT;

    let dc: ts.debugClient.ExtendedDebugClient;
    setup(() => {
        return testSetup.setup()
            .then(_dc => dc = _dc);
    });

    teardown(() => {
        return testSetup.teardown();
    });

    suite('setBreakpoints', () => {
        test('should stop on a breakpoint', () => {
            const PROGRAM = path.join(DATA_ROOT, 'program.js');
            const BREAKPOINT_LINE = 2;

            return dc.hitBreakpoint({ program: PROGRAM }, { path: PROGRAM, line: BREAKPOINT_LINE} );
        });

        test('should stop on a breakpoint in file with spaces in its name', () => {
            const PROGRAM = path.join(DATA_ROOT, 'folder with spaces', 'file with spaces.js');
            const BREAKPOINT_LINE = 2;

            return dc.hitBreakpoint({ program: PROGRAM }, { path: PROGRAM, line: BREAKPOINT_LINE} );
        });

        test('should stop on a breakpoint identical to the entrypoint', () => {        // verifies the 'hide break on entry point' logic
            const PROGRAM = path.join(DATA_ROOT, 'program.js');
            const ENTRY_LINE = 1;

            return dc.hitBreakpoint({ program: PROGRAM }, { path: PROGRAM, line: ENTRY_LINE } );
        });

        // Microsoft/vscode-chrome-debug-core#73
        test.skip('should break on a specific column in a single line program', () => {
            const SINGLE_LINE_PROGRAM = path.join(DATA_ROOT, 'programSingleLine.js');
            const LINE = 1;
            const COLUMN = 55;

            return dc.hitBreakpoint({ program: SINGLE_LINE_PROGRAM }, { path: SINGLE_LINE_PROGRAM, line: LINE, column: COLUMN } );
        });

        test('should stop on a conditional breakpoint', () => {
            const PROGRAM = path.join(DATA_ROOT, 'program.js');
            const COND_BREAKPOINT_LINE = 13;

            const bp: DebugProtocol.SourceBreakpoint = { line: COND_BREAKPOINT_LINE, condition: 'i === 3' };
            return Promise.all([
                ts.debugClient.setBreakpointOnStart(dc, [bp], PROGRAM, COND_BREAKPOINT_LINE),

                dc.launch({ program: PROGRAM }),

                dc.assertStoppedLocation('breakpoint', { path: PROGRAM, line: COND_BREAKPOINT_LINE } ).then(response => {
                    const frame = response.body.stackFrames[0];
                    return dc.evaluateRequest({ context: 'watch', frameId: frame.id, expression: 'x' }).then(response => {
                        assert.equal(response.body.result, 9, 'x !== 9');
                        return response;
                    });
                })
            ]);
        });
    });

    suite('setBreakpoints in TypeScript', () => {
        test('should stop on a breakpoint in source (all files top level)', () => {
            const PROGRAM = path.join(DATA_ROOT, 'sourcemaps-simple/classes.js');
            const TS_SOURCE = path.join(DATA_ROOT, 'sourcemaps-simple/classes.ts');
            const TS_LINE = 17;

            return dc.hitBreakpoint({
                program: PROGRAM,
                sourceMaps: true,
                runtimeArgs: [ '--nolazy' ]
            }, {
                path: TS_SOURCE,
                line: TS_LINE
            });
        });

        // Find map beside generated
        test.skip('should stop on a breakpoint in source (all files top level, missing sourceMappingURL)', () => {
            const PROGRAM = path.join(DATA_ROOT, 'sourcemaps-simple-no-sourceMappingURL/classes.js');
            const TS_SOURCE = path.join(DATA_ROOT, 'sourcemaps-simple-no-sourceMappingURL/classes.ts');
            const TS_LINE = 17;

            return dc.hitBreakpoint({
                program: PROGRAM,
                sourceMaps: true,
                runtimeArgs: [ '--nolazy' ]
            }, {
                path: TS_SOURCE,
                line: TS_LINE
            });
        });

        test('should stop on a breakpoint in source (outDir)', () => {
            const PROGRAM = path.join(DATA_ROOT, 'sourcemaps-inline/src/classes.ts');
            const OUT_DIR = path.join(DATA_ROOT, 'sourcemaps-inline/dist');
            const BREAKPOINT_LINE = 17;

            return dc.hitBreakpoint({
                program: PROGRAM,
                sourceMaps: true,
                outDir: OUT_DIR,
                runtimeArgs: [ '--nolazy' ]
            }, {
                path: PROGRAM,
                line: BREAKPOINT_LINE
            });
        });

        test('should stop on a breakpoint in source (outFiles)', () => {
            const PROGRAM = path.join(DATA_ROOT, 'sourcemaps-inline/src/classes.ts');
            const OUT_FILES = path.join(DATA_ROOT, 'sourcemaps-inline/dist/**/*.js');
            const BREAKPOINT_LINE = 17;

            return dc.hitBreakpoint({
                program: PROGRAM,
                sourceMaps: true,
                outFiles: [ OUT_FILES ],
                runtimeArgs: [ '--nolazy' ],
                verboseDiagnosticLogging: true
            }, {
                path: PROGRAM,
                line: BREAKPOINT_LINE
            });
        });

        test('should stop on a breakpoint in source with spaces in paths (outDir)', () => {
            const PROGRAM = path.join(DATA_ROOT, 'sourcemaps with spaces', 'the source/classes.ts');
            const OUT_DIR = path.join(DATA_ROOT, 'sourcemaps with spaces/the distribution');
            const BREAKPOINT_LINE = 17;

            return dc.hitBreakpoint({
                program: PROGRAM,
                sourceMaps: true,
                outDir: OUT_DIR,
                runtimeArgs: [ '--nolazy' ],
                verboseDiagnosticLogging: true
            }, {
                path: PROGRAM,
                line: BREAKPOINT_LINE
            });
        });

        test('should stop on a breakpoint in source with spaces in paths (outFiles)', () => {
            const PROGRAM = path.join(DATA_ROOT, 'sourcemaps with spaces', 'the source/classes.ts');
            const OUT_FILES = path.join(DATA_ROOT, 'sourcemaps with spaces/the distribution/**/*.js');
            const BREAKPOINT_LINE = 17;

            return dc.hitBreakpoint({
                program: PROGRAM,
                sourceMaps: true,
                outFiles: [ OUT_FILES ],
                runtimeArgs: [ '--nolazy' ],
                verboseDiagnosticLogging: true
            }, {
                path: PROGRAM,
                line: BREAKPOINT_LINE
            });
        });


        test('should stop on a breakpoint in source - Microsoft/vscode#2574', () => {
            const PROGRAM = path.join(DATA_ROOT, 'sourcemaps-2574/out/classes.js');
            const OUT_DIR = path.join(DATA_ROOT, 'sourcemaps-2574/out');
            const TS_SOURCE = path.join(DATA_ROOT, 'sourcemaps-2574/src/classes.ts');
            const TS_LINE = 17;

            return dc.hitBreakpoint({
                program: PROGRAM,
                sourceMaps: true,
                outDir: OUT_DIR,
                runtimeArgs: [ '--nolazy' ]
            }, {
                path: TS_SOURCE,
                line: TS_LINE
            });
        });

        // Find map next to js
        test.skip('should stop on a breakpoint in source (sourceMappingURL missing)', () => {
            const PROGRAM = path.join(DATA_ROOT, 'sourcemap-no-sourceMappingURL/out/classes.js');
            const OUT_DIR = path.join(DATA_ROOT, 'sourcemap-no-sourceMappingURL/out');
            const TS_SOURCE = path.join(DATA_ROOT, 'sourcemap-no-sourceMappingURL/src/classes.ts');
            const TS_LINE = 17;

            return dc.hitBreakpoint({
                program: PROGRAM,
                sourceMaps: true,
                outDir: OUT_DIR,
                runtimeArgs: [ '--nolazy' ]
            }, {
                path: TS_SOURCE,
                line: TS_LINE
            });
        });

        test('should stop on a breakpoint in source even if breakpoint was set in JavaScript - Microsoft/vscode-node-debug#43', () => {
            const PROGRAM = path.join(DATA_ROOT, 'sourcemaps-2574/out/classes.js');
            const OUT_DIR = path.join(DATA_ROOT, 'sourcemaps-2574/out');
            const JS_SOURCE = PROGRAM;
            const JS_LINE = 21;
            const TS_SOURCE = path.join(DATA_ROOT, 'sourcemaps-2574/src/classes.ts');
            const TS_LINE = 17;

            return dc.hitBreakpoint({
                program: PROGRAM,
                sourceMaps: true,
                outDir: OUT_DIR,
                runtimeArgs: [ '--nolazy' ]
            }, {
                path: JS_SOURCE,
                line: JS_LINE
            }, {
                path: TS_SOURCE,
                line: TS_LINE
            });
        });

        test('should stop on a breakpoint when the sourcemap is loaded after the bp is set', () => {
            const projectRoot = path.join(DATA_ROOT, 'sourcemaps-setinterval');
            const BP_PROGRAM = path.join(projectRoot, 'src/file2.ts');
            const LAUNCH_PROGRAM = path.join(projectRoot, 'dist/program.js');
            const BP_LINE = 10;
            const outFiles = [path.join(projectRoot, 'dist/*.js')];

            let bpChangedEventCount = 0;
            return Promise.all<DebugProtocol.ProtocolMessage>([
                dc.waitForEvent('initialized').then(event => {
                    return dc.setBreakpointsRequest({ source: { path: BP_PROGRAM }, breakpoints: [{ line: BP_LINE }]}).then(response => {
                        assert.equal(response.body.breakpoints.length, 1);
                        assert(!response.body.breakpoints[0].verified, 'Expected bp to not be verified yet');

                        dc.on('breakpoint', e => {
                            bpChangedEventCount++;
                        });

                        return dc.configurationDoneRequest();
                    });
                }),
                dc.launch({ program: LAUNCH_PROGRAM, outFiles }),
                dc.waitForEvent('breakpoint').then((event: DebugProtocol.BreakpointEvent) => {
                    assert(event.body.breakpoint.verified);
                    return null;
                }),

                dc.assertStoppedLocation('breakpoint', { path: BP_PROGRAM, line: BP_LINE } ).then(() => {
                    if (bpChangedEventCount > 1) {
                        // Test that we didn't unnecessarily reset the BP when the script loaded
                        throw new Error('Too many BP changed events');
                    }
                })
            ]);
        });

        // Microsoft/vscode-chrome-debug-core#38
        test('should stop on a breakpoint in source even if program\'s entry point is in JavaScript', () => {
            const PROGRAM = path.join(DATA_ROOT, 'sourcemaps-js-entrypoint/out/entry.js');
            const OUT_DIR = path.join(DATA_ROOT, 'sourcemaps-js-entrypoint/out');
            const TS_SOURCE = path.join(DATA_ROOT, 'sourcemaps-js-entrypoint/src/classes.ts');
            const TS_LINE = 17;

            return dc.hitBreakpointUnverified({
                program: PROGRAM,
                sourceMaps: true,
                outDir: OUT_DIR,
                runtimeArgs: [ '--nolazy' ]
            }, { path: TS_SOURCE, line: TS_LINE } );
        });

        test('can set a breakpoint in inlined sources', async () => {
            const TEST_ROOT = path.join(DATA_ROOT, 'sourcemaps-inline-sources');
            const outFiles = [path.join(TEST_ROOT, '**/*.js')];
            const LAUNCH_PROGRAM = path.join(TEST_ROOT, 'program.js');
            const PROGRAM = path.join(TEST_ROOT, 'program.ts');
            const DEBUGGER_LINE = 5;
            const BP_LINE = 4;

            let inlinedSource: DebugProtocol.Source;
            await Promise.all([
                dc.configurationSequence(),
                dc.launch({ program: LAUNCH_PROGRAM, outFiles }),
                dc.assertStoppedLocation('debugger_statement', { path: PROGRAM, line: DEBUGGER_LINE }).then(stackTrace => {
                    inlinedSource = stackTrace.body.stackFrames[0].source;
                })
            ]);

            const bpRequest = await dc.setBreakpointsRequest({ breakpoints: [{ line: BP_LINE }], source: inlinedSource });
            assert(bpRequest.body.breakpoints[0] && bpRequest.body.breakpoints[0].verified);

            await dc.continueTo('breakpoint', { line: BP_LINE, path: PROGRAM });
        });

        const execP = (command, options) => {
            return new Promise((resolve, reject) => {
                child_process.exec(command, options, (err, stdout) => {
                    if (err) {
                        return reject(err);
                    }

                    resolve(stdout);
                });
            });
        };

        test('still resolves sourcemap paths when they are absolute local paths', async () => {
            const TEST_ROOT = path.join(DATA_ROOT, 'sourcemaps-local-paths');

            await execP('npm install', { cwd: TEST_ROOT });
            await execP('npm run postinstall', { cwd: TEST_ROOT }); // This doesn't run automatically on Linux for some reason.
            const PROGRAM = path.join(DATA_ROOT, 'sourcemaps-local-paths/out/classes.js');
            const TS_SOURCE = path.join(DATA_ROOT, 'sourcemaps-local-paths/src/classes.ts');
            const TS_LINE = 17;

            return dc.hitBreakpointUnverified({
                program: PROGRAM,
                outFiles: [path.join(DATA_ROOT, 'sourcemaps-local-paths/out/*.js')],
                runtimeArgs: ['--nolazy']
            }, { path: TS_SOURCE, line: TS_LINE });
        });
    });

    suite('setExceptionBreakpoints', () => {
        const PROGRAM = path.join(DATA_ROOT, 'programWithException.js');

        test('should not stop on an exception', () => {
            if (utils.compareSemver(process.version, 'v8.0.0') < 0) {
                // Terminating at program end only works after Node 8
                return Promise.resolve();
            }

            return Promise.all<DebugProtocol.ProtocolMessage>([
                dc.waitForEvent('initialized').then(event => {
                    return dc.setExceptionBreakpointsRequest({
                        filters: [ ]
                    });
                }).then(response => {
                    return dc.configurationDoneRequest();
                }),

                dc.launch({ program: PROGRAM }),

                dc.waitForEvent('terminated')
            ]);
        });

        test('should stop on a caught exception', () => {
            const EXCEPTION_LINE = 6;

            return Promise.all([
                dc.waitForEvent('initialized').then(event => {
                    return dc.setExceptionBreakpointsRequest({
                        filters: [ 'all' ]
                    });
                }).then(response => {
                    return dc.configurationDoneRequest();
                }),

                dc.launch({ program: PROGRAM }),

                dc.assertStoppedLocation('exception', { path: PROGRAM, line: EXCEPTION_LINE } )
            ]);
        });

        test('should stop on uncaught exception', () => {
            const UNCAUGHT_EXCEPTION_LINE = 12;

            return Promise.all([
                dc.waitForEvent('initialized').then(event => {
                    return dc.setExceptionBreakpointsRequest({
                        filters: [ 'uncaught' ]
                    });
                }).then(response => {
                    return dc.configurationDoneRequest();
                }),

                dc.launch({ program: PROGRAM }),

                dc.assertStoppedLocation('exception', { path: PROGRAM, line: UNCAUGHT_EXCEPTION_LINE } )
            ]);
        });

        test('should not stop on exception in <node_internals> when skipFiles is used', async () => {
            const program = path.join(DATA_ROOT, 'nodeInternalsCaughtException.js');

            return Promise.all([
                dc.waitForEvent('initialized').then(event => {
                    return dc.setExceptionBreakpointsRequest({
                        filters: ['all']
                    });
                }).then(response => {
                    return dc.setBreakpointsRequest({ source: { path: program }, breakpoints: [{ line: 7 }]});
                }).then(() => {
                    return dc.configurationDoneRequest();
                }),

                dc.launch({ program, skipFiles: ['<node_internals>/**'] }),

                // assert that we did not stop on the exception, but stopped on the breakpoint
                dc.assertStoppedLocation('breakpoint', { path: program, line: 7 })
            ]);
        });

        test('should still stop on exception in user code when skipFiles is used with <node_internals>', async () => {
            const program = path.join(DATA_ROOT, 'programWithException.js');

            return Promise.all([
                dc.waitForEvent('initialized').then(event => {
                    return dc.setExceptionBreakpointsRequest({
                        filters: ['all']
                    });
                }).then(response => {
                    return dc.setBreakpointsRequest({ source: { path: program }, breakpoints: [{ line: 11 }] });
                }).then(() => {
                    return dc.configurationDoneRequest();
                }),

                dc.launch({ program, skipFiles: ['<node_internals>/**'] }),

                // assert that we did not stop on the exception, but stopped on the breakpoint
                dc.assertStoppedLocation('exception', { path: program, line: 6 })
            ]);
        });
    });

    suite('exception scope', () => {
        const PROGRAM = path.join(DATA_ROOT, 'programWithException.js');

        test('should only show exception scope in the first frame', () => {
            const EXCEPTION_LINE = 6;

            return Promise.all([
                dc.waitForEvent('initialized')
                    .then(event =>  dc.setExceptionBreakpointsRequest({ filters: ['all'] }))
                    .then(response =>  dc.configurationDoneRequest()),

                dc.launch({ program: PROGRAM }),

                dc.assertStoppedLocation('exception', { path: PROGRAM, line: EXCEPTION_LINE }).then(async response => {
                    const frame0Id = response.body.stackFrames[0].id;
                    const frame0Scopes = await dc.scopesRequest({ frameId: frame0Id });
                    assert.equal(frame0Scopes.body.scopes[0].name, 'Exception', 'First frame should be named Exception');

                    const frame1Id = response.body.stackFrames[1].id;
                    const frame1Scopes = await dc.scopesRequest({ frameId: frame1Id });
                    assert.notEqual(frame1Scopes.body.scopes[0].name, 'Exception', 'First frame should not be named Exception');
                })
            ]);
        });
    });

    suite('setBreakpoints using Webpack', () => {
        test('webpack', () => {
            const TS_SOURCE = path.join(DATA_ROOT, 'webpack/app.ts');
            const TS_LINE = 1;

            return dc.hitBreakpoint({
                program: TS_SOURCE,
                sourceMaps: true,
                outFiles: [ path.join(DATA_ROOT, 'webpack/**/*.js') ],
                cwd: path.join(DATA_ROOT, 'webpack'),
                runtimeArgs: [ '--nolazy' ]
            }, {
                path: TS_SOURCE,
                line: TS_LINE
            });
        });
    });

    suite('es modules', () => {
        test('breakpoint in es module', () => {
            const file2 = path.join(DATA_ROOT, 'es-modules/file2.mjs');
            const line = 1;

            return dc.hitBreakpoint({
                program: file2,
                cwd: path.join(DATA_ROOT, 'es-modules'),
                runtimeArgs: ['--nolazy']
            }, {
                path: file2,
                line: line
            });
        });
    });

    suite('symlinks', () => {
        test('breakpoint in symlinked library module', () => {
            if (process.platform === 'win32') {
                return Promise.resolve();
            }

            const main = path.join(DATA_ROOT, 'symlinked-file/main.js');
            const file2 = path.join(DATA_ROOT, 'symlinked-file/symlinkToSrc/file.js');
            const line = 1;

            return dc.hitBreakpointUnverified({
                program: main,
                cwd: path.join(DATA_ROOT, 'symlinked-file'),
                runtimeArgs: ['--nolazy', '--preserve-symlinks']
            }, {
                path: file2,
                line: line
            });
        });

        test('breakpoint in symlinked main module', () => {
            if (utils.compareSemver(process.version, 'v10.0.0') < 0 || process.platform === 'win32') {
                // --preserve-symlinks-main only supported after Node 10
                return Promise.resolve();
            }

            const main = path.join(DATA_ROOT, 'symlinked-file/symlinkToSrc/file.js');
            const line = 1;

            return dc.hitBreakpointUnverified({
                program: main,
                cwd: path.join(DATA_ROOT, 'symlinked-file'),
                runtimeArgs: ['--nolazy', '--preserve-symlinks', '--preserve-symlinks-main']
            }, {
                path: main,
                line: line
            });
        });

        test('breakpoint in symlinked cwd', () => {
            if (utils.compareSemver(process.version, 'v10.0.0') < 0 || process.platform === 'win32') {
                // --preserve-symlinks-main only supported after Node 10
                return Promise.resolve();
            }

            const main = path.join(DATA_ROOT, 'symlinked-file/symlinkToSrc/file.js');
            const line = 1;

            return dc.hitBreakpointUnverified({
                program: main,
                cwd: path.join(DATA_ROOT, 'symlinked-file/symlinkToSrc'),
                runtimeArgs: ['--nolazy', '--preserve-symlinks', '--preserve-symlinks-main']
            }, {
                path: main,
                line: line
            });
        });
    });
});