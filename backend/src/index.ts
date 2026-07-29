import { Hono } from "hono";
import type { Bindings } from "./models/env";
import { corsMiddleware } from "./middleware/cors";
import { requestLogger } from "./middleware/logger";
import { handleError, handleNotFound } from "./middleware/errorHandler";
import { statusRoute } from "./routes/status";
import { authRoute } from "./routes/auth";
import { booksRoute } from "./routes/books";
import { usersRoute } from "./routes/users";
import { projectsRoute } from "./routes/projects";
import { statisticsRoute } from "./routes/statistics";

const app = new Hono<{ Bindings: Bindings }>();

app.use("*", requestLogger);
app.use("*", corsMiddleware);

app.route("/api/status", statusRoute);
app.route("/api/auth", authRoute);
app.route("/api/books", booksRoute);
app.route("/api/users", usersRoute);
app.route("/api/projects", projectsRoute);
app.route("/api/statistics", statisticsRoute);

app.onError(handleError);
app.notFound(handleNotFound);

export default app;
