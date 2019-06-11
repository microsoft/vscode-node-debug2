/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { ChromeDebugSession, logger, telemetry, OnlyProvideCustomLauncherExtensibilityPoints, interfaces, GetComponentByID, DependencyInjection, TYPES, UninitializedCDA } from 'vscode-chrome-debug-core';
import * as path from 'path';
import * as os from 'os';

import { NodeLauncher } from './launcherAndRuner/nodeLauncher';
import { NodeRunner } from './launcherAndRuner/nodeRunner';
import { NewNodeDebugAdapter } from './components/nodeDebugAdapter';
import { NodeDebugAdapterConfigurerService } from './components/nodeDebugAdapterConfigurerService';
import { CustomizedUninitializedCDA } from './components/customizedUninitializedCDA';
import { FakeNodeVersionProvider } from './components/fakeNodeVersionProvider';
import { FakeLogEventsProvider } from './components/fakeLogEventsProvider';
import { FakeDOMInstrumentationBreakpointsSetter } from './components/fakeDOMInstrumentationBreakpointsSetter';
import { PauseOnStartHandler } from './components/pauseOnStartHandler';
import { NodeInitializer } from './launcherAndRuner/nodeInitializer';

function customizeComponents<T>(identifier: interfaces.ServiceIdentifier<T>, component: T, getComponentById: GetComponentByID): T {
    switch (identifier) {
        case TYPES.UninitializedCDA:
            // We use our own version of the UninitializedCDA component to declare some extra capabilities that this client supports
            return <T><unknown>new CustomizedUninitializedCDA(
                getComponentById(TYPES.ISession),
                <UninitializedCDA><unknown>component);
        default:
            return component;
    }
}

const logFilePath = path.join(os.tmpdir(), 'vscode-node-debug2.txt'); // non-.txt file types can't be uploaded to github
const extensibilityPoints = new OnlyProvideCustomLauncherExtensibilityPoints(logFilePath, NodeLauncher, NodeRunner, customizeComponents, NodeInitializer);
extensibilityPoints.bindAdditionalComponents = (diContainer: DependencyInjection) => {
    diContainer.configureClass(TYPES.IServiceComponent, NodeDebugAdapterConfigurerService);
    diContainer.configureClass(TYPES.IServiceComponent, PauseOnStartHandler);

    // Services not supported on node
    diContainer.unconfigure(TYPES.IDebuggeeRuntimeVersionProvider);
    diContainer.configureClass(TYPES.IDebuggeeRuntimeVersionProvider, FakeNodeVersionProvider);
    diContainer.unconfigure(TYPES.ILogEventsProvider);
    diContainer.configureClass(TYPES.ILogEventsProvider, FakeLogEventsProvider);
    diContainer.unconfigure(TYPES.IDOMInstrumentationBreakpointsSetter);
    diContainer.configureClass(TYPES.IDOMInstrumentationBreakpointsSetter, FakeDOMInstrumentationBreakpointsSetter);
};

ChromeDebugSession.run(ChromeDebugSession.getSession(
    {
        logFilePath: logFilePath,
        adapter: NewNodeDebugAdapter,
        extensionName: 'node-debug2',
        extensibilityPoints: extensibilityPoints
    }));

/* tslint:disable:no-var-requires */
const debugAdapterVersion = require('../../package.json').version;
logger.log('node-debug2: ' + debugAdapterVersion);

/* __GDPR__FRAGMENT__
   "DebugCommonProperties" : {
      "Versions.DebugAdapter" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
   }
 */
telemetry.telemetry.addCustomGlobalProperty({ 'Versions.DebugAdapter': debugAdapterVersion });
