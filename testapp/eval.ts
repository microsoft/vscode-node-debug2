eval(`
    function foo() {
        console.log("can't bp this");
    }
`);

declare function foo();
setInterval(() => {
    foo();
}, 1000);