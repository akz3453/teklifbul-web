import express from "express";
import cors from "cors";
import demands from "./routes/demands";
import groups from "./routes/groups";
import paymentPref from "./routes/payment-preference";
import escrow from "./routes/escrow";
import importRouter from "../routes/import";
import categoriesRouter from "../../src/modules/categories/routes/categories";
import taxOfficesRouter from "../../src/modules/taxOffices/routes/taxOffices";
import offersRouter from "./api/offers";

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/demands", demands);
app.use("/api/groups", groups);
app.use("/api/payment-preference", paymentPref);
app.use("/api/escrow", escrow);
app.use("/api/import", importRouter);
app.use("/api/offers", offersRouter);
app.use("/api/categories", categoriesRouter);
app.use("/api/tax-offices", taxOfficesRouter);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

const PORT = process.env.API_PORT ? Number(process.env.API_PORT) : 5174;
app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});


