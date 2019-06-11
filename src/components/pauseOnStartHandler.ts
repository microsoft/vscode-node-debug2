/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/
import {
    injectable, IServiceComponent, inject, TYPES, IDebuggeePausedHandler, utils, logger, PausedEvent,
    IActionToTakeWhenPaused, BasePauseShouldBeAutoResumed, IDebuggeeExecutionController, printClassDescription, NoActionIsNeededForThisPause
} from 'vscode-chrome-debug-core';
import { getDA } from '../v1-backwards-compatiblity/getDA';
import { ActionToTakeWhenPausedClass } from 'vscode-chrome-debug-core/lib/src/chrome/internal/features/pauseActionsPriorities';

@printClassDescription
export class PausedOnNodeStartShouldAutoResume extends BasePauseShouldBeAutoResumed {
    constructor(protected readonly _debuggeeExecutionControl: IDebuggeeExecutionController) {
        super();
    }
}

@injectable()
export class PauseOnStartHandler implements IServiceComponent {
    private readonly waitUntilConfigurationDone = utils.promiseDefer();

    public constructor(
        @inject(TYPES.IDebuggeePausedHandler) private readonly _debuggeePausedHandler: IDebuggeePausedHandler,
        @inject(TYPES.IDebuggeeExecutionController) private readonly _debuggeeExecutionControl: IDebuggeeExecutionController) { }

    public install(): this {
        this._debuggeePausedHandler.registerActionProvider(paused => this.onPaused(paused));
        const actions = this._debuggeePausedHandler.actionsFromHighestToLowestPriority;
        actions.unshift(<ActionToTakeWhenPausedClass><unknown>PausedOnNodeStartShouldAutoResume);
        this._debuggeePausedHandler.updatePauseActionsPriorities(actions);
        getDA().onConfigurationDoneCallback(() => this.waitUntilConfigurationDone.resolve());
        return this;
    }

    public async onPaused(paused: PausedEvent): Promise<IActionToTakeWhenPaused> {
        const pausedOnEntry = await getDA().onPaused(paused);

        if (pausedOnEntry.didPause) {
            logger.log(`Blocking onPaused handler until configuration is done`);
            await this.waitUntilConfigurationDone.promise;
            // TODO: Verify whether we stopped on a breakpoint or debugger statement, and decide what to do based on that
            return new PausedOnNodeStartShouldAutoResume(this._debuggeeExecutionControl);
        }

        return new NoActionIsNeededForThisPause(this);
    }
}
