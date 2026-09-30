import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { requireAccess } from "./auth";
import { accounts } from "./routes/accounts";
import { categories } from "./routes/categories";
import { exportCsv } from "./routes/export";
import { ingest } from "./routes/ingest";
import { rules } from "./routes/rules";
import { stats } from "./routes/stats";
import { transactions } from "./routes/transactions";
import type { AppEnv } from "./types";

const app = new Hono<AppEnv>();

app.use("/api/*", requireAccess);

app.get("/api/health", async (c) => {
	const db = await c.env.DB.prepare(
		"SELECT (SELECT COUNT(*) FROM categories) AS categories, (SELECT COUNT(*) FROM accounts) AS accounts",
	).first<{ categories: number; accounts: number }>();
	return c.json({ ok: true, user: c.get("user"), db });
});

app.route("/api/transactions", transactions);
app.route("/api/categories", categories);
app.route("/api/accounts", accounts);
app.route("/api/rules", rules);
app.route("/api/stats", stats);
app.route("/api/export.csv", exportCsv);
app.route("/api/ingest", ingest);

app.notFound((c) => c.json({ ok: false, error: "not_found" }, 404));

app.onError((err, c) => {
	if (err instanceof HTTPException) {
		return c.json({ ok: false, error: "bad_request", message: err.message }, err.status);
	}
	console.error(err);
	return c.json({ ok: false, error: "internal_error" }, 500);
});

export default app;
