/** Browser-only, short-lived confirmed account reads. Instances never cross SSR requests. */
export function createAccountResource(revision: () => number, clock = Date.now) {
  let generation = 0;
  let confirmed: { revision: number; expires: number; response: Response } | undefined;
  let pending: { revision: number; promise: Promise<Response>; controller: AbortController } | undefined;
  function invalidate() {
    generation++;
    confirmed = undefined;
    pending?.controller.abort();
    pending = undefined;
  }
  async function read(fetchAccount: (signal: AbortSignal) => Promise<Response>, signal?: AbortSignal) {
    if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');
    const current = revision();
    if (confirmed?.revision === current && confirmed.expires > clock()) return confirmed.response.clone();
    if (!pending || pending.revision !== current) {
      const token = generation;
      const controller = new AbortController();
      const work = { revision: current, controller, promise: Promise.resolve(new Response()) };
      work.promise = fetchAccount(controller.signal).then(response => {
        if (response.status === 401 || response.status === 403) { confirmed = undefined; return response; }
        if (token !== generation || controller.signal.aborted) throw new DOMException('Invalidated', 'AbortError');
        // The initial account response may confirm the session and advance its revision.
        if (response.ok) confirmed = { revision: revision(), expires: clock() + 30_000, response: response.clone() };
        else if (response.status === 401 || response.status === 403) confirmed = undefined;
        return response;
      }).finally(() => { if (pending === work) pending = undefined; });
      pending = work;
    }
    const shared = pending.promise;
    const response = await (signal ? new Promise<Response>((resolve, reject) => {
      const abort = () => {
        signal.removeEventListener('abort', abort);
        reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
      };
      signal.addEventListener('abort', abort, { once: true });
      shared.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
    }) : shared);
    // Cancellation belongs to this consumer, never to the shared request.
    if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');
    return response.clone();
  }
  return { read, invalidate };
}
