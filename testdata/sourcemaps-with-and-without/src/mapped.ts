import {callbackCaller} from './unmapped';

function f() {
    console.log('mapped');
}

callbackCaller(f);