import "dotenv/config";
import cors from "cors";
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

const corsOptions: cors.CorsOptions = {
  origin(origin, callback) {
    if (!origin) {
      callback(null, true);
      return;
    }

    const normalizedOrigin = normalizeOrigin(origin);
    if (allowedOrigins.includes(normalizedOrigin)) {
      callback(null, true);
      return;
    }

    console.error("[cors] blocked origin", {
      origin: normalizedOrigin,
      allowedOrigins
    });
    callback(new Error(`Origin not allowed by CORS: ${normalizedOrigin}`));
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: false,
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
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
