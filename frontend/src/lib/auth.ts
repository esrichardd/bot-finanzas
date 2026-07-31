import { createAuthClient } from "better-auth/react";

// Mismo origen: en dev el rewrite lleva /api/auth al backend; en prod, Caddy.
// Better Auth 1.6 requiere una URL absoluta; en el navegador usamos el origen
// actual para conservar el mismo origen en dev y producción.
const authBaseURL =
  typeof window === "undefined"
    ? "http://localhost:3001/api/auth"
    : `${window.location.origin}/api/auth`;

export const authClient = createAuthClient({ baseURL: authBaseURL });
