import {callbackCaller2} from './sourceB2';

export function callbackCaller1(cb: Function): void {
    callbackCaller2(cb);
}
