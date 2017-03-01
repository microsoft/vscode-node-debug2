import * as app2 from './app2';


async function log() {
    console.log('Hello, world!');
    test();
}
log();

setInterval(log, 3000);

function test() {
    // Test large callstack
    // var count = 0;
    // function rec1234567890rec1234567890rec1234567890rec1234567890rec1234567890rec1234567890rec1234567890rec1234567890() {
    //     if (++count === 60) debugger
    //     else rec1234567890rec1234567890rec1234567890rec1234567890rec1234567890rec1234567890rec1234567890rec1234567890();
    // }

    // rec1234567890rec1234567890rec1234567890rec1234567890rec1234567890rec1234567890rec1234567890rec1234567890();

    locals();

    // set to true in the console to step into here
    let doEverything = false;
    if (doEverything) {
        app2.consoleAPIs();
        app2.throwCaught();
    }
        return 5;
    };

    function fn2() { };
    fn2.prototype.aPrototypeFn = () => { return 3; };
    (<any>fn2).fnProp = 123;

    app2.anotherFn(fn);
    fn();

    app2.throwCaught();
}
