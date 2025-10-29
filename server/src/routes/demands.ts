import express from "express";
import { DemandInput } from "../types/demand";
import { computeInvitedSupplierIds } from "../services/inviteService";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const body = req.body as DemandInput;
    if (!body?.demandVisibility || !body?.bidVisibility) {
      return res.status(400).json({ error: "Eksik alanlar" });
    }

    // Sunucu tarafı DOĞRULAMA
    const invited = await computeInvitedSupplierIds(body);

    const demandDoc = {
      ...body,
      invitedSupplierIds: invited,
      createdAt: new Date().toISOString(),
    };

    // TODO: Firestore/DB'ye kaydet
    // const saved = await db.collection("demands").add(demandDoc);

    return res.status(201).json({ ok: true, demand: demandDoc /* id: saved.id */ });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: "Sunucu hatası" });
  }
});

export default router;


