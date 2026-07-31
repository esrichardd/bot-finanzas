import { apiFetch } from "./client";

export interface Me {
  id: string;
  email: string;
  name: string;
}

export function getMe(): Promise<Me> {
  return apiFetch<Me>("/api/me");
}
