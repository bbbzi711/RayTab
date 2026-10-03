import { createRepository } from './database';
import { RAY_DATABASE_NAME } from './connection';

const channel =
  typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('raytab-updates');

export const repository = createRepository(RAY_DATABASE_NAME, () => {
  channel?.postMessage('updated');
});
