import {callbackCaller} from './sourceB';

function f() {
    console.log('mapped');
}

setInterval(() => {
    callbackCaller(f);
}, 500);