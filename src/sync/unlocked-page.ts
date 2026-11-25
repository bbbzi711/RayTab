const findPage = 'raytab:find-unlocked-sync-page';
const syncPage = 'raytab:sync-page:';

async function askPage(message: string): Promise<unknown> {
  try {
    return await browser.runtime.sendMessage(message);
  } catch (error) {
    // With no unlocked view (or one that just closed), the alarm runs in the background.
    if (
      error instanceof Error &&
      /receiving end does not exist|message port closed|message channel closed/i.test(error.message)
    )
      return undefined;
    throw error;
  }
}

export async function requestUnlockedPage() {
  const id = await askPage(findPage);
  return typeof id === 'string' && (await askPage(syncPage + id)) === true;
}

export function listenForAutomaticSync(sync: () => void) {
  // Several tabs may hold distinct unlocked sessions. Only the chosen view starts the job.
  const id = crypto.randomUUID();
  const listener: Parameters<typeof browser.runtime.onMessage.addListener>[0] = (
    message,
    _sender,
    respond,
  ) => {
    if (message === findPage) respond(id);
    if (message === syncPage + id) {
      sync();
      respond(true);
    }
  };
  browser.runtime.onMessage.addListener(listener);
  return () => browser.runtime.onMessage.removeListener(listener);
}
