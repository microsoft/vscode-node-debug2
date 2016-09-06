/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import {ChromeDebugSession, chromeTargetDiscoveryStrategy, logger} from 'vscode-chrome-debug-core';
import * as path from 'path';

import {NodeDebugAdapter} from './nodeDebugAdapter';

ChromeDebugSession.run(ChromeDebugSession.getSession(
    {
        logFilePath: path.resolve(__dirname, '../../vscode-node-cdp-debug.txt'), // non-.txt file types can't be uploaded to github
        adapter: new NodeDebugAdapter(),
        extensionName: 'node-debug'
    }));

/* tslint:disable:no-var-requires */
logger.log('node-debug: ' + require('../../package.json').version);
