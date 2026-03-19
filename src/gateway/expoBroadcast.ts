/** Cho phép broadcast event tới Expo clients từ bất kỳ đâu */
let broadcastFn: ((event: unknown) => void) | null = null;

export function registerExpoBroadcast(fn: (event: unknown) => void) {
  broadcastFn = fn;
}

export function broadcastToExpo(event: unknown) {
  broadcastFn?.(event);
}
