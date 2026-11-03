import gymPinJson from "../data/gyms.json?raw";

export type GymPin = {
  id: string;
  name: string;
  prefectureCode: string;
  address?: string;
  phone?: string;
  website?: string;
};

export const GYM_PINS = JSON.parse(gymPinJson) as GymPin[];

export function getGymPinsByPrefecture(prefectureCode: string) {
  return GYM_PINS.filter((gym) => gym.prefectureCode === prefectureCode);
}
