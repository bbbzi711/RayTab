import './startup.css';
import { restoreStartupWallpaper } from './startup';

// Cache decoding and app download overlap; React adopts the already painted backdrop.
const wallpaper = restoreStartupWallpaper();
void import('./render').then(async ({ renderApp }) => {
  await wallpaper;
  renderApp();
});
