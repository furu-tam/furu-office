import './session.js';
import './loop.js';
import './debug.js';
if (new URLSearchParams(location.search).has('bench')) import('./bench.js');
