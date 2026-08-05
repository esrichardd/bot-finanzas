import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { serverEnv } from "../env";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(`API ${status}`);
  }
}

export interface ApiErrorBody {
  error?: string;
  message?: string;
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
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const res = await fetch(`${serverEnv.BACKEND_URL}${path}`, {
    ...init,
    headers: { ...Object.fromEntries(headers.entries()), cookie: cookieStore.toString() },
    cache: "no-store",
  });

  if (res.status === 401) {
    redirect("/login");
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
    throw new ApiError(res.status, body);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
