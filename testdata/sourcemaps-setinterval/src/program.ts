console.log('Program loaded');

import {Foo} from './file2';
const foo = new Foo('foo');

setInterval(() => foo.getName(), 100);
