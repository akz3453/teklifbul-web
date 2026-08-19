// Teklifbul Rule v1.0 — Talep bitiş tarihi (termin veya teklif süresi)

function toJsDate(value) {
  if (!value) return null;
  if (typeof value?.toDate === 'function') return value.toDate();
  if (typeof value?.seconds === 'number') return new Date(value.seconds * 1000);
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function getDemandExpiryDate(demand) {
  if (!demand) return null;
  const candidates = [];
  const push = (v, endOfDay = false) => {
    const d = toJsDate(v);
    if (!d) return;
    if (endOfDay) {
      const eod = new Date(d);
      eod.setHours(23, 59, 59, 999);
      candidates.push(eod);
    } else {
      candidates.push(d);
    }
  };

  push(demand.expiresAt);
  push(demand.phaseEndAt);
  push(demand.round2End);
  if (!demand.round2End) push(demand.round1End);

  if (demand.biddingMode === 'hybrid' && demand.hybridSettings) {
    const start = toJsDate(demand.publishedAt) || toJsDate(demand.createdAt);
    const days =
      (Number(demand.hybridSettings.firstRoundDays) || 0) +
      (Number(demand.hybridSettings.secondRoundDays) || 0);
    if (start && days > 0) {
      const end = new Date(start.getTime());
      end.setDate(end.getDate() + days);
      candidates.push(end);
    }
  }

  push(demand.dueDate || demand.deadline || demand.termin_tarihi, true);

  if (!candidates.length) return null;
  return new Date(Math.min(...candidates.map((c) => c.getTime())));
}

export function isDemandExpired(demand) {
  const exp = getDemandExpiryDate(demand);
  if (!exp) return false;
  return Date.now() > exp.getTime();
}
