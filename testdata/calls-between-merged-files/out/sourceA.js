"use strict";
var sourceB1_1 = require("./sourceB1");
function f() {
    console.log('mapped');
}
setInterval(function () {
    sourceB1_1.callbackCaller1(f);
}, 0);

//# sourceMappingURL=sourceA.js.map
