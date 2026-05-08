// Derive backend URL from where the page was loaded so the same dev build
// works on the laptop (localhost) and on a phone over LAN (192.168.x.y).
// Explicit VITE_API_URL / VITE_SOCKET_URL still override this.

const BACKEND_PORT = 3001;

function defaultBackend(): string {
  if (typeof window === 'undefined') return `http://localhost:${BACKEND_PORT}`;
  const host = window.location.hostname || 'localhost';
  return `http://${host}:${BACKEND_PORT}`;
}

export const API_URL = import.meta.env.VITE_API_URL ?? defaultBackend();
export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? defaultBackend();
