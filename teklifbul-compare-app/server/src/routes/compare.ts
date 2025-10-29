import { Router } from "express";
import dayjs from "dayjs";
import { exportCompareTemplate, exportWithTemplate } from "../services/exportExcel";
import { getComparePayload } from "../services/matchService";

const r = Router();

r.get("/export/compare", async (req, res) => {
  try {
    const requestId = req.query.requestId as string;
    const membership = (req.query.membership as "standard"|"premium") || "standard";

    // kendi sisteminden kıyas verilerini al → items[], footer{}, membership
    const payload = await getComparePayload(requestId, membership);

    const buf = await exportCompareTemplate(payload);
    const stamp = dayjs().format("YYYY-MM-DD_HHmm");
    res.setHeader("Content-Disposition", `attachment; filename="mukayese_${stamp}.xlsx"`);
    res.type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buf);
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Export error" });
  }
});

export default r;
