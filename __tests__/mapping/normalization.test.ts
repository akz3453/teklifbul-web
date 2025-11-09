import { lowercaseTR, normalizeKey, parseNumberTR, parseDateTR, detectCurrency } from "../../server/services/normalization";

describe("normalization helpers", () => {
  test("lowercaseTR handles dotted/dotless i", () => {
    expect(lowercaseTR("İSTANBUL")).toBe("istanbul");
    expect(lowercaseTR("ISPARTA")).toBe("ısparta");
  });

  test("normalizeKey strips punctuation", () => {
    expect(normalizeKey(" Talep Tarihi! ")).toBe("talep tarihi");
  });

  test("parseNumberTR parses TR formatted numbers", () => {
    expect(parseNumberTR("1.234,56")).toBeCloseTo(1234.56);
    expect(parseNumberTR("12,50 TL")).toBeCloseTo(12.5);
    expect(parseNumberTR("abc")).toBeNull();
  });

  test("parseDateTR supports multiple formats", () => {
    expect(parseDateTR("30.10.2025")).toBe("2025-10-30");
    expect(parseDateTR("2025-10-30")).toBe("2025-10-30");
    expect(parseDateTR("")).toBeNull();
  });

  test("detectCurrency recognizes symbols", () => {
    expect(detectCurrency("Ödeme: 1000 ₺")).toBe("TRY");
    expect(detectCurrency("USD")).toBe("USD");
  });
});


