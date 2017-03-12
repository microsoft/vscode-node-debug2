let i = 1;

export function asyncFn() {
    console.log(`asyncFn`);
    return Promise.resolve('foo ' + i++);
}

function *generator() {
    console.log(`generator`);
    const x = yield asyncFn();
    console.log(`x: ${x}`);
    const y = yield asyncFn();
    console.log(`y: ${y}`);
}

function callGenerator() {
    const g = generator();
    console.log('calling next: ');
    g.next().value.then(result => {
        return g.next(result).value;
    }).then(result => {
        return g.next(result).value;
    });
}

callGenerator();