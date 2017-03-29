const file2 = require('./file2.js');

setInterval(() => {
    const x = 1;
    file2.foo(x);
}, 1000);