console.log('Program loaded');

function f() {
    console.log('interval');
    debugger;
}

setInterval(f, 200);
