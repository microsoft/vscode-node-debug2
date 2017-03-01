var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var Foo = (function () {
    function Foo(name) {
        this._name = name;
    }
    Foo.prototype.getName = function () {
        return this._name;
    };
    return Foo;
}());
var Bar = (function (_super) {
    __extends(Bar, _super);
    function Bar() {
        _super.apply(this, arguments);
    }
    Bar.prototype.getName = function () {
        return _super.prototype.getName.call(this) + ' Doe';
    };
    return Bar;
}(Foo));
var bar = new Bar('John2');
console.log(bar.getName()); // John Doe
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2xhc3Nlcy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NyYy9jbGFzc2VzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7O0FBQUE7SUFJRSxhQUFZLElBQVk7UUFDdEIsSUFBSSxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUM7SUFDcEIsQ0FBQztJQUVELHFCQUFPLEdBQVA7UUFDRSxNQUFNLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQztJQUNwQixDQUFDO0lBQ0gsVUFBQztBQUFELENBQUMsQUFYRCxJQVdDO0FBRUQ7SUFBa0IsdUJBQUc7SUFBckI7UUFBa0IsOEJBQUc7SUFLckIsQ0FBQztJQUhDLHFCQUFPLEdBQVA7UUFDRSxNQUFNLENBQUMsZ0JBQUssQ0FBQyxPQUFPLFdBQUUsR0FBRyxNQUFNLENBQUM7SUFDbEMsQ0FBQztJQUNILFVBQUM7QUFBRCxDQUFDLEFBTEQsQ0FBa0IsR0FBRyxHQUtwQjtBQUVELElBQUksR0FBRyxHQUFHLElBQUksR0FBRyxDQUFDLE9BQU8sQ0FBQyxDQUFDO0FBRTNCLE9BQU8sQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUMsQ0FBQyxXQUFXIn0=