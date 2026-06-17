import "dotenv/config";
import cors from "cors";
import express from "express";
import aiRoutes from "./routes/ai.routes.js";
import docxRoutes from "./routes/docx.routes.js";
import generateRoutes from "./routes/generate.routes.js";
import { ApiError } from "./services/openrouter.service.js";

const app = express();
const port = Number(process.env.PORT) || 3001;

app.use(cors());
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
});
