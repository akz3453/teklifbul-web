import express from "express";
import { resolveGroupMembers } from "../services/inviteService";

const router = express.Router();

router.get("/members", async (req, res) => {
  const ids = String(req.query.ids || "").split(",").filter(Boolean);
  // TODO: DB'den id->name eşleştirmesi yap; şimdilik yalnızca id dönen demo
  const supplierIds = await resolveGroupMembers(ids);
  const suppliers = supplierIds.map(id => ({ id, name: id }));
  res.json(suppliers);
});

export default router;


