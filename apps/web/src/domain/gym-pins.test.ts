import { describe, expect, it } from "vitest";
import { getGymPinsByPrefecture } from "./gym-pins";

describe("getGymPinsByPrefecture", () => {
  it("returns the Osaka gym directory in JSON order", () => {
    expect(getGymPinsByPrefecture("JP-27").map((gym) => gym.name)).toEqual([
      "ボルダリングジム マッシュルーミング",
      "グラビティリサーチ梅田",
      "BOULDERING GYM CAL-COLO UMEDA",
      "アーバンクライミングクラブ カワセミ",
      "CRUX クラックス大阪",
      "ボルダリングジム roca",
      "Soleilナカガイクライミングジム",
      "Climbing Gym Higurashi",
      "Dボルダリング プラスリード なんば",
      "マホロバフォレスト",
      "クライミングジム ガレーラ",
    ]);
  });

  it("returns no gyms for prefectures without entries", () => {
    expect(getGymPinsByPrefecture("JP-13")).toEqual([]);
  });
});
