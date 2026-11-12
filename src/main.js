import './session.js';
import './loop.js';
if (new URLSearchParams(location.search).has('bench')) import('./bench.js');
