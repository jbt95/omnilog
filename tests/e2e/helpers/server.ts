export type RunningServer = {
  baseUrl: string;
  Close: () => Promise<void>;
};

type ListenableServer = {
  listen: (port: number, hostname: string) => void;
  once: (event: 'error' | 'listening', listener: (...args: unknown[]) => void) => void;
  off: (event: 'error' | 'listening', listener: (...args: unknown[]) => void) => void;
  address: () => { port: number } | string | null;
  close: (callback: (error?: Error) => void) => void;
};

export async function StartServer(server: ListenableServer): Promise<RunningServer> {
  await new Promise<void>((resolve, reject) => {
    const HandleError = (...args: unknown[]) => {
      const [error] = args;
      server.off('listening', HandleListening);
      reject(error instanceof Error ? error : new Error(String(error)));
    };
    const HandleListening = () => {
      server.off('error', HandleError);
      resolve();
    };
    server.once('error', HandleError);
    server.once('listening', HandleListening);
    server.listen(0, '127.0.0.1');
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Unable to resolve server address');
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    Close: async () =>
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      }),
  };
}
