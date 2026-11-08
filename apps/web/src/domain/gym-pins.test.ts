import { describe, expect, it } from "vitest";
import { getGymPinsByPrefecture } from "./gym-pins";

describe("getGymPinsByPrefecture", () => {
  it("includes the source directory gyms and existing Osaka-only entries", () => {
    const osakaGyms = getGymPinsByPrefecture("JP-27").map((gym) => gym.name);

    expect(osakaGyms.length).toBeGreaterThan(30);
    expect(osakaGyms).toContain("BOULDERING GYM CAL-COLO UMEDA");
    expect(osakaGyms).toContain("Climbing Gym Higurashi");
  });

  it("includes gyms from all prefectures in the nationwide directory", () => {
    expect(getGymPinsByPrefecture("JP-13").map((gym) => gym.name)).toContain("B-PUMP TOKYO 秋葉原");
    expect(getGymPinsByPrefecture("JP-40").map((gym) => gym.name)).toContain(
      "クライミングジム＆ショップ OD（オーディー） 小倉店",
    );
    expect(getGymPinsByPrefecture("JP-47").length).toBeGreaterThan(0);
    expect(getGymPinsByPrefecture("JP-99")).toEqual([]);
  });
});
