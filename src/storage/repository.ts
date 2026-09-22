import { createRepository } from './database';

const channel =
  typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('raytab-updates');

export const repository = createRepository('raytab-v11', () => {
  channel?.postMessage('updated');
});
