import { scoreCandidate, stringSimilarity } from "../../server/services/scorers";
import { enrichCandidate } from "../../server/services/normalization";

describe("scoring utilities", () => {
  test("string similarity prefers close labels", () => {
    expect(stringSimilarity("Miktar", "qty")).toBeGreaterThan(stringSimilarity("Toplam", "qty"));
  });

  test("scoreCandidate boosts numeric fields", () => {
    const candidate = enrichCandidate("1.250,50");
    const score = scoreCandidate("unitPriceExcl", "Birim Fiyat", candidate);
    expect(score.score).toBeGreaterThan(0.5);
  });
});


