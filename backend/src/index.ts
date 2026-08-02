import { Hono } from "hono";
import type { AppEnv } from "./models/env";
import { corsMiddleware } from "./middleware/cors";
import { requestLogger } from "./middleware/logger";
import { handleError, handleNotFound } from "./middleware/errorHandler";
import { statusRoute } from "./routes/status";
import { authRoute } from "./routes/auth";
import { booksRoute } from "./routes/books";
import { readingRoute } from "./routes/reading";
import { shelvesRoute } from "./routes/shelves";
import { dashboardRoute } from "./routes/dashboard";
import { usersRoute } from "./routes/users";
import { projectsRoute } from "./routes/projects";
import { statisticsRoute } from "./routes/statistics";
import { bibleRoute } from "./routes/bible";

const app = new Hono<AppEnv>();

app.use("*", requestLogger);
app.use("*", corsMiddleware);

app.route("/api/status", statusRoute);
app.route("/api/auth", authRoute);
app.route("/api/books", booksRoute);
app.route("/api/reading", readingRoute);
app.route("/api/shelves", shelvesRoute);
app.route("/api/dashboard", dashboardRoute);
app.route("/api/users", usersRoute);
app.route("/api/projects", projectsRoute);
app.route("/api/statistics", statisticsRoute);
app.route("/api/bible", bibleRoute);

app.onError(handleError);
app.notFound(handleNotFound);

export default app;
