/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import {ChromeDebugSession, logger} from 'vscode-chrome-debug-core';
import * as path from 'path';

import {NodeDebugAdapter} from './nodeDebugAdapter';

ChromeDebugSession.run(ChromeDebugSession.getSession(
    {
        logFilePath: path.resolve(__dirname, '../../vscode-node-debug2.txt'), // non-.txt file types can't be uploaded to github
        adapter: NodeDebugAdapter,
        extensionName: 'node-debug2'
    }));

/* tslint:disable:no-var-requires */
logger.log('node-debug2: ' + require('../../package.json').version);
