"use strict";
var sourceB_1 = require('./sourceB');
function f() {
    console.log('mapped');
}
sourceB_1.callbackCaller(f);
console.log('stepped over caught exception');
//# sourceMappingURL=sourceA.js.map