// A made-up file for the demo.
import { afterSignIn } from '../src/login.js';

console.assert(afterSignIn({ valid: true }) === '/home');
