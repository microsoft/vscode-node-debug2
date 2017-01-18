import {callbackCaller1} from './sourceB1';

function f() {
    console.log('mapped');
}

setInterval(() => {
    callbackCaller1(f);
}, 0);