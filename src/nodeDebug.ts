/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { ChromeDebugSession, logger, telemetry } from 'vscode-chrome-debug-core';
import * as path from 'path';
import * as os from 'os';

import { NodeDebugAdapter } from './nodeDebugAdapter';
import { NodeBreakpoints } from './nodeBreakpoints';
import { NodeScriptContainer } from './nodeScripts';

ChromeDebugSession.run(ChromeDebugSession.getSession(
    {
        logFilePath: path.join(os.tmpdir(), 'vscode-node-debug2.txt'), // non-.txt file types can't be uploaded to github
        adapter: NodeDebugAdapter,
        extensionName: 'node-debug2',
        breakpoints: NodeBreakpoints,
        scriptContainer: NodeScriptContainer
    }));

/* tslint:disable:no-var-requires */
const debugAdapterVersion = require('../../package.json').version;
logger.log('node-debug2: ' + debugAdapterVersion);

/* __GDPR__FRAGMENT__
   "DebugCommonProperties" : {
      "Versions.DebugAdapter" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
   }
 */
telemetry.telemetry.addCustomGlobalProperty({'Versions.DebugAdapter': debugAdapterVersion});
