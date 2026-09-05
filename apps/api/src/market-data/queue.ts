export class MarketDataError extends Error {
  constructor(message: string, readonly kind: 'unavailable'|'not-found'|'rate-limited'|'timeout'|'overloaded' = 'unavailable') { super(message); }
}

function retryable(error: unknown) {
  if (error instanceof MarketDataError) return error.kind !== 'not-found';
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  return !message.includes('not found') && !message.includes('invalid symbol');
}

/** One queue per application runtime; consumers share it through the provider. */
export function createYahooQueue(timeoutMs = 10_000) {
  const inFlight = new Map<string,Promise<unknown>>();
  const waiters: Array<()=>void> = [];
  let active = 0;
  async function run<T>(key:string, fetcher:(signal:AbortSignal)=>Promise<T>):Promise<T> {
    const existing = inFlight.get(key);
    if (existing) return existing as Promise<T>;
    if (waiters.length >= 256) throw new MarketDataError('Market request queue is full','overloaded');
    const task = (async()=>{
      if(active<2) active++; else await new Promise<void>(resolve=>waiters.push(resolve));
      try {
        for(let attempt=0;;attempt++) {
          const controller = new AbortController();
          let timeout: ReturnType<typeof setTimeout>;
          const deadline = new Promise<never>((_,reject)=>{
            timeout=setTimeout(()=>{
              const error=new MarketDataError('Yahoo request timed out','timeout');
              controller.abort(error); reject(error);
            },timeoutMs);
          });
          try { return await Promise.race([fetcher(controller.signal),deadline]); }
          catch(error) {
            if(attempt>=2||!retryable(error)) throw error;
          } finally { clearTimeout(timeout!); }
          await new Promise(resolve=>setTimeout(resolve,attempt===0?500:1500));
        }
      } finally { const next=waiters.shift();if(next)next();else active--; }
    })();
    inFlight.set(key,task);
    const cleanup=()=>{if(inFlight.get(key)===task)inFlight.delete(key);};
    task.then(cleanup,cleanup);
    return task;
  }
  return {run};
}
