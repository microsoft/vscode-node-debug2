/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as mocha from 'mocha';
import * as events from 'events';

class LoggingReporter extends mocha.reporters.Spec {
    static logEE = new events.EventEmitter();

    private testLogs: string[];

    constructor(runner: any) {
        super(runner);

        LoggingReporter.logEE.on('log', msg => {
            this.testLogs.push(msg);
        });

        runner.on('start', test => {
            this.testLogs = [];
        });

        runner.on('fail', test => {
            this.testLogs.forEach(msg => {
                console.log(msg);
            });
        });
    }
}

export = LoggingReporter;