// Server-only. BACKEND_URL solo existe/importa en el servidor:
// - dev: el server de Next corre en el host → backend dockerizado en localhost:3000
// - prod: contenedor → http://backend:3000 (inyectado por el compose)
export const serverEnv = {
  BACKEND_URL: process.env.BACKEND_URL ?? "http://localhost:3000",
};
