"use strict";
function callbackCaller1(cb) {
    callbackCaller2(cb);
}
exports.callbackCaller1 = callbackCaller1;

"use strict";
function callbackCaller2(cb) {
    cb();
}
exports.callbackCaller2 = callbackCaller2;

//# sourceMappingURL=sourceB1.js.map
