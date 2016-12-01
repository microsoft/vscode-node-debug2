import {callbackCaller} from './sourceB';

function f() {
    console.log('mapped');
}

callbackCaller(f);
console.log('stepped over caught exception');
