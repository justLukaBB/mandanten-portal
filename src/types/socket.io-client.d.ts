declare module 'socket.io-client' {
  export type Socket = any;
  export function io(uri?: string, opts?: any): Socket;
}

