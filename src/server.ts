import "dotenv/config";
import express from "express";
import aiRoutes from "./routes/ai.routes.js";
import docxRoutes from "./routes/docx.routes.js";
import generateRoutes from "./routes/generate.routes.js";
import { ApiError } from "./services/openrouter.service.js";

const app = express();
const port = Number(process.env.PORT) || 3001;

const defaultAllowedOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://khbd-fe.vercel.app"
];

function normalizeOrigin(value: string) {
  return value.trim().replace(/\/+$/, "");
}

function getAllowedOrigins() {
  const raw = String(process.env.CORS_ALLOWED_ORIGINS || "").trim();
  if (!raw) {
    return defaultAllowedOrigins;
  }

  const envOrigins = raw
    .split(",")
    .map(normalizeOrigin)
    .filter(Boolean);

  return Array.from(new Set([...defaultAllowedOrigins, ...envOrigins]));
}

const allowedOrigins = getAllowedOrigins();

app.use((req, res, next) => {
  const origin = typeof req.headers.origin === "string" ? normalizeOrigin(req.headers.origin) : "";
  const isAllowed = !origin || allowedOrigins.includes(origin);

  if (origin) {
    console.log("[cors] request", {
      method: req.method,
      path: req.path,
      origin,
      isAllowed
    });
  }

  if (origin && isAllowed) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Vary", "Origin");
  }

  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    if (!isAllowed) {
      console.error("[cors] blocked preflight", {
        origin,
        path: req.path,
        allowedOrigins
      });
      res.status(403).json({ message: `Origin not allowed by CORS: ${origin}` });
      return;
    }

    res.status(204).end();
    return;
  }

  if (origin && !isAllowed) {
    console.error("[cors] blocked origin", {
      origin,
      path: req.path,
      allowedOrigins
    });
    res.status(403).json({ message: `Origin not allowed by CORS: ${origin}` });
    return;
  }

  next();
});

app.use(express.json({ limit: "5mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/ai", aiRoutes);
app.use("/api/docx", docxRoutes);
app.use("/api", generateRoutes);

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const statusCode =
    error instanceof ApiError
      ? error.statusCode
      : typeof error === "object" && error !== null && "statusCode" in error
        ? Number((error as { statusCode?: number }).statusCode) || 500
        : 500;
  const message = error instanceof Error ? error.message : "Có lỗi xảy ra. Vui lòng thử lại.";

  console.error("[server] request failed", {
    statusCode,
    message,
    error
  });

  res.status(statusCode).json({ message });
});

app.listen(port, () => {
  console.log(`KHBD backend is running on http://localhost:${port}`);
  console.log("[cors] allowed origins", allowedOrigins);
});
