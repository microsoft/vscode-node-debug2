declare const callbackCaller2: Function; // b1 and b2 are concatenated

export function callbackCaller1(cb: Function): void {
    callbackCaller2(cb);
}
