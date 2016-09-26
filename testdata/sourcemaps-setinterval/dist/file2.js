"use strict";
var Foo = (function () {
    function Foo(name) {
        this._name = name;
    }
    Foo.prototype.getName = function () {
        return this._name;
    };
    return Foo;
}());
exports.Foo = Foo;
//# sourceMappingURL=file2.js.map