function asyncFn() {
    return Promise.resolve('foo');
}

function async1() {
    return asyncFn().then(() => {
        return async2();
    });
}

function async2() {
    return asyncFn().then(() => {
        return async3();
    });
}

function async3() {
    return asyncFn().then(() => {
        return async4();
    });
}

function async4() {
    return asyncFn().then(() => {
        return async5();
    });
}

function async5() {
    return asyncFn().then(() => {
        return async6();
    });
}

function async6() {
    return asyncFn().then(() => {
        return async7();
    });
}

function async7() {
    return asyncFn();
}

async1().then(() => {
    console.log(`done`);
});
