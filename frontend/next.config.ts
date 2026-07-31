import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Build autocontenido para Docker: .next/standalone con server.js propio.
  output: "standalone",
  // En dev, el frontend corre en el host (:3001) y proxea la API al backend
  // dockerizado (:3000), manteniendo un mismo origen para cookies y cero CORS.
  // En prod este rewrite no aplica: Caddy hace el routing.
  async rewrites() {
    if (process.env.NODE_ENV !== "development") return [];
    const backend = process.env.BACKEND_URL ?? "http://localhost:3000";
    return [{ source: "/api/:path*", destination: `${backend}/api/:path*` }];
  },
};

export default nextConfig;
