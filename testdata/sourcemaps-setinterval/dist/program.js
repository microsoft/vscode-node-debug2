"use strict";
console.log('Program loaded');
var file2_1 = require('./file2');
var foo = new file2_1.Foo('foo');
setInterval(function () { return foo.getName(); }, 100);
//# sourceMappingURL=program.js.map