/** Keep API cookies same-origin for both HTTP and Socket.IO transports. */
export function apiProxy(target: string) {
  return {
    '/api': target,
    '/socket.io': { target, ws: true },
  }
}
