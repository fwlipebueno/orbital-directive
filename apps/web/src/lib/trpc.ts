import { createTRPCUntypedClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import { ensureCsrfToken } from "./csrf";
import { webEnv } from "./env";

const client = createTRPCUntypedClient({
  transformer: superjson,
  links: [
    httpBatchLink({
      url: `${webEnv.apiOrigin}/trpc`,
      async fetch(url, options) {
        const csrfToken = await ensureCsrfToken(webEnv.apiOrigin);
        const headers = new Headers(options?.headers);
        headers.set("x-csrf-token", csrfToken);

        return fetch(url, {
          ...options,
          credentials: "include",
          headers
        });
      }
    })
  ]
});

export async function trpcQuery<TOutput>(path: string, input?: unknown): Promise<TOutput> {
  return client.query(path, input) as Promise<TOutput>;
}

export async function trpcMutation<TOutput>(path: string, input?: unknown): Promise<TOutput> {
  return client.mutation(path, input) as Promise<TOutput>;
}
