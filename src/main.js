import { ensureAccess } from './token.js';

if (await ensureAccess()) {
  await import('./session.js');
  await import('./loop.js');
  await import('./debug.js');
  if (new URLSearchParams(location.search).has('bench')) import('./bench.js');
}
