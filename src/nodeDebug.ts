/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import {ChromeDebugSession, logger} from 'vscode-chrome-debug-core';
import * as path from 'path';

ChromeDebugSession.run(ChromeDebugSession.getSession(
    {
        logFilePath: path.resolve(__dirname, '../../vscode-node-cdp-debug.txt') // non-.txt file types can't be uploaded to github
    }));

/* tslint:disable:no-var-requires */
logger.log('debugger-for-chrome: ' + require('../../package.json').version);
