"use strict";
function callbackCaller(cb) {
    try {
        throw new Error('test error');
    }
    catch (e) {
    }
    cb();
}
exports.callbackCaller = callbackCaller;
//# sourceMappingURL=sourceB.js.map