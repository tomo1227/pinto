import { JAPAN_PREFECTURES } from "@pinto/shared";
import { useMemo, useState } from "react";
import { GYM_PINS } from "../../domain/gym-pins";

export function useGymPinFilter() {
  const [prefectureCode, setPrefectureCode] = useState("");
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filtersApplied = Boolean(prefectureCode || normalizedQuery);
  const filteredGyms = useMemo(
    () =>
      filtersApplied
        ? GYM_PINS.filter(
            (gym) =>
              (!prefectureCode || gym.prefectureCode === prefectureCode) &&
              (!normalizedQuery || gym.name.toLocaleLowerCase().includes(normalizedQuery)),
          )
        : [],
    [filtersApplied, normalizedQuery, prefectureCode],
  );

  return { prefectureCode, setPrefectureCode, query, setQuery, filtersApplied, filteredGyms };
}

export function GymPinFilterFields({
  prefectureCode,
  onPrefectureChange,
  query,
  onQueryChange,
  filtersApplied,
  resultCount,
}: {
  prefectureCode: string;
  onPrefectureChange: (prefectureCode: string) => void;
  query: string;
  onQueryChange: (query: string) => void;
  filtersApplied: boolean;
  resultCount: number;
}) {
  return (
    <div className="gym-filter-fields">
      <label className="field-label">
        都道府県で絞り込む
        <select
          className="text-input"
          value={prefectureCode}
          onChange={(event) => onPrefectureChange(event.currentTarget.value)}
        >
          <option value="">都道府県を選択</option>
          {JAPAN_PREFECTURES.map((prefecture) => (
            <option key={prefecture.code} value={prefecture.code}>
              {prefecture.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field-label">
        ジム名で検索
        <input
          className="text-input"
          value={query}
          onChange={(event) => onQueryChange(event.currentTarget.value)}
          placeholder="ジム名を入力"
        />
      </label>
      <p className="field-hint gym-filter-fields__status" aria-live="polite">
        {!filtersApplied
          ? "都道府県を選ぶか、ジム名で検索してください。"
          : resultCount > 0
            ? `${resultCount}件のジム`
            : "条件に一致するジムがありません。"}
      </p>
    </div>
  );
}
