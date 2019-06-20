/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/
import { injectable } from 'vscode-chrome-debug-core';
import { ILogEventsProvider, ILogEntry } from 'vscode-chrome-debug-core';

@injectable()
export class FakeLogEventsProvider implements ILogEventsProvider {
    onEntryAdded(listener: (entry: ILogEntry) => void): void {
    }
}
