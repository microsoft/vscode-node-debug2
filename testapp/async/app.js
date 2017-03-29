async function asyncFn() {
    return new Promise(resolve => {
        setTimeout(resolve, 0);
    })
}

async function asyncFn1() {
    await asyncFn();
    return asyncFn2();
}

async function asyncFn2() {
    await asyncFn();
    return asyncFn3();
}

async function asyncFn3() {
    await asyncFn();
    return asyncFn4();
}

async function asyncFn4() {
    await asyncFn();
    return asyncFn5();
}

async function asyncFn5() {
    await asyncFn();
    return asyncFn6();
}

async function asyncFn6() {
    await asyncFn();
    return asyncFn7();
}

async function asyncFn7() {
    await asyncFn();
}
asyncFn1().then(() => {
    console.log(`done`);
});
