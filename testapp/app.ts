import * as app2 from './app2';

setInterval(() => {
    locals();
    app2.consoleAPIs();
    app2.throwCaught();
    app2.throwUncaught();
}, 2000);

function locals() {
    console.log('Hello, world!');

    const manyPropsObj: any = { prop2: 'abc', prop1: 'def' };
    for (let i=0; i<=100; i++) manyPropsObj[i] = Math.random();

    const r = /^asdf.*$/g;
    const longStr = `this is a
string with
newlines`;
    const buffer = new ArrayBuffer(8);
    const buffView = new Int32Array(buffer);
    buffView[0] = 234;
    const s = Symbol('hi');
    const e = new Error('hi');

    const m = new Map();
    m.set('a', 1);

    let nan = NaN;
    let inf = 1/0;
    let infStr = "Infinity";

    eval('var evalVar3 = [1,2,3]');
    eval('var evalVar1 = 16');
    eval('var evalVar2 = "sdlfk"');

    const bool = true;
    const fn = () => {
        // Some fn
        const xyz = 321;
        app2.anotherFn();
    };
    const fn2 = function() {
        const zzz = 333;
    };

    app2.anotherFn();
    fn();

    app2.throwCaught();
    app2.throwUncaught();
}