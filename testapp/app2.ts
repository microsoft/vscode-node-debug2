console.log('app2.ts loaded');

export function throwCaught(): void {
    try {
        throw new Error('error!');
    } catch (e) {

    }
}

export function evalDebugger() {
    eval('var x = 1; debugger;');
    eval('throwCaught()');
}

export function consoleAPIs() {
    console.log({ a: 1, b: 'asdf', c: { d: 4 } });
    console.log({ a: 1}, {b: 2});
    console.count('count label');
    console.count('count label');
    console.dir({ z: 5 });
    console.time('timing');
    console.group('my group');
    console.log('hello', 'world!');
    console.error('with formatter:  %s world!', 'hello');
    console.log('%d %i %f', -19, -32.5, -9.4);
    console.groupEnd();
    console.timeEnd('timing');
    console.trace();

    eval('console.trace()');
    (() => console.trace())();

    try {
        console.assert(1 == <any>2, '1 is not 2');
    } catch (e) { }
}

export function anotherFn(): void {
    let qqq;
    const str = 'hello';
    let xyz = 1;
    const obj = { a: 2, get thing() { throw new Error('xyz'); }, set thing(x) { } };
    const obj2 = { b: 3, get getter() { return 5; }};
    const obj3 = { b: 3, get getter() { return { a: 4, b: [1, 2, 3] } } };
    xyz++;                     xyz++;
}