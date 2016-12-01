export function callbackCaller(cb: Function): void {
    try {
        throw new Error('test error');
    } catch (e) {

    }

    cb();
}
