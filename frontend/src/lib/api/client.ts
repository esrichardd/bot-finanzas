import "server-only";

import { cookies } from "next/headers";

import { serverEnv } from "../env";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(`API ${status}`);
  }
}

/**
 * Fetch server-side al backend: URL absoluta interna + cookie de sesión reenviada.
 * ÚNICO punto de contacto con la API para server components y server actions.
 */
export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const cookieStore = await cookies();
  const res = await fetch(`${serverEnv.BACKEND_URL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      cookie: cookieStore.toString(),
      ...init.headers,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(res.status, body);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
