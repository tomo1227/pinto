import { useEffect, useState } from "react";
import { getWall, getWallPng } from "../../infrastructure/storage/database";

type LocalWallPng = {
  wallId: string;
  hasLocalWall: boolean;
  url?: string;
  error: string;
};

export function useWallPng(wallId: string | undefined) {
  const [result, setResult] = useState<LocalWallPng | null>(null);

  useEffect(() => {
    setResult(null);
    if (!wallId) return;
    let active = true;
    let objectUrl: string | undefined;
    void getWall(wallId)
      .then(async (wall) => {
        if (!active) return;
        if (!wall) {
          setResult({ wallId, hasLocalWall: false, error: "" });
          return;
        }
        const png = await getWallPng(wallId);
        if (!active) return;
        if (png) objectUrl = URL.createObjectURL(png);
        setResult({ wallId, hasLocalWall: true, url: objectUrl, error: "" });
      })
      .catch((reason: unknown) => {
        if (active) {
          setResult({
            wallId,
            hasLocalWall: false,
            error:
              reason instanceof Error ? reason.message : "ローカルの壁画像を読み込めませんでした。",
          });
        }
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [wallId]);

  return {
    hasLocalWall: Boolean(result && result.wallId === wallId && result.hasLocalWall),
    url: result?.wallId === wallId ? result?.url : undefined,
    error: result?.wallId === wallId ? (result?.error ?? "") : "",
  };
}
