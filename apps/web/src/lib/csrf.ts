let csrfToken: string | null = null;
let csrfPromise: Promise<string> | null = null;

async function fetchCsrfToken(apiOrigin: string): Promise<string> {
  const response = await fetch(`${apiOrigin}/api/csrf`, {
    method: "GET",
    credentials: "include"
  });

  if (!response.ok) {
    throw new Error("Unable to fetch CSRF token");
  }

  const payload = (await response.json()) as { csrfToken: string };
  return payload.csrfToken;
}

export async function ensureCsrfToken(apiOrigin: string): Promise<string> {
  if (csrfToken) {
    return csrfToken;
  }

  if (!csrfPromise) {
    csrfPromise = fetchCsrfToken(apiOrigin).then((token) => {
      csrfToken = token;
      csrfPromise = null;
      return token;
    });
  }

  return csrfPromise;
}

export function clearCsrfToken(): void {
  csrfToken = null;
}
