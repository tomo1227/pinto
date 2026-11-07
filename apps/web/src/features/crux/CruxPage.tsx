import type { Landmark, NormalizedLandmark, PoseLandmarker } from "@mediapipe/tasks-vision";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Film,
  Play,
  Plus,
  ScanLine,
  Trash2,
} from "lucide-react";
import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import {
  addCruxVideo,
  type CruxVideo,
  getCruxVideoFile,
  listCruxVideos,
  removeCruxVideo,
} from "./crux-store";
import {
  type CruxDisplayOptions,
  defaultCruxDisplayOptions,
  parseCruxDisplayOptions,
} from "./display-options";
import { Pose3DPreview } from "./Pose3DPreview";
import {
  calculatePoseMetrics,
  createPoseTimestampGenerator,
  defaultPoseConfidenceThresholds,
  getSynchronizedTime,
  isJointPartVisible,
  minimumLandmarkVisibility,
  type PoseConfidenceThresholds,
  poseConnections,
  poseJointGroups,
  poseJointLandmarks,
  poseLandmarkerModelUrl,
  poseLandmarkerOptions,
} from "./pose-analysis";

const visionWasmUrl = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.2/wasm";
const displayOptionsStorageKey = "pinto-crux-display-options";
const poseConfidenceControls: { key: keyof PoseConfidenceThresholds; label: string }[] = [
  { key: "minPoseDetectionConfidence", label: "人物検出" },
  { key: "minPosePresenceConfidence", label: "人物の存在" },
  { key: "minTrackingConfidence", label: "追跡" },
];

function errorText(reason: unknown, fallback: string) {
  return reason instanceof Error ? reason.message : fallback;
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds)) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

type PoseVideoPlayerProps = {
  name: string;
  src: string;
  label: string;
  poseLandmarker: PoseLandmarker | null;
  videoRef: RefObject<HTMLVideoElement | null>;
  startPosition: number;
  duration: number;
  showStartPosition: boolean;
  onStartPositionChange: (time: number) => void;
  displayOptions: CruxDisplayOptions;
  onTimeUpdate?: (time: number) => void;
  onDurationChange?: (duration: number) => void;
  onEnded?: () => void;
};

function PoseVideoPlayer({
  name,
  src,
  label,
  poseLandmarker,
  videoRef,
  startPosition,
  duration,
  showStartPosition,
  onStartPositionChange,
  displayOptions,
  onTimeUpdate,
  onDurationChange,
  onEnded,
}: PoseVideoPlayerProps) {
  const [landmarks, setLandmarks] = useState<NormalizedLandmark[] | null>(null);
  const [worldLandmarks, setWorldLandmarks] = useState<Landmark[] | null>(null);
  const [show3DModel, setShow3DModel] = useState(false);
  const [aspectRatio, setAspectRatio] = useState("16 / 9");
  const [error, setError] = useState("");
  const [videoDimensions, setVideoDimensions] = useState({ width: 1, height: 1 });
  const timestampGenerator = useRef(createPoseTimestampGenerator());
  const lastDetectedTime = useRef(-1);

  const detectPose = useCallback(() => {
    const video = videoRef.current;
    if (!poseLandmarker || !video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
    if (video.currentTime === lastDetectedTime.current) return;
    lastDetectedTime.current = video.currentTime;
    try {
      const timestamp = timestampGenerator.current(video.currentTime);
      const result = poseLandmarker.detectForVideo(video, timestamp);
      setLandmarks(result.landmarks[0] ?? null);
      setWorldLandmarks(result.worldLandmarks[0] ?? null);
      setError("");
    } catch (reason) {
      setLandmarks(null);
      setWorldLandmarks(null);
      setError(errorText(reason, "姿勢を解析できませんでした。"));
    }
  }, [poseLandmarker, videoRef]);

  useEffect(() => {
    setLandmarks(null);
    setWorldLandmarks(null);
    lastDetectedTime.current = -1;
    timestampGenerator.current = createPoseTimestampGenerator();
    detectPose();
  }, [detectPose]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !poseLandmarker) return;

    let active = true;
    let animationFrame = 0;
    let lastVideoTime = -1;
    const renderFrame = () => {
      if (!active) return;
      if (
        video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        !video.paused &&
        video.currentTime !== lastVideoTime
      ) {
        lastVideoTime = video.currentTime;
        detectPose();
      }
      if (!video.paused) animationFrame = requestAnimationFrame(renderFrame);
    };
    const start = () => {
      cancelAnimationFrame(animationFrame);
      lastVideoTime = -1;
      animationFrame = requestAnimationFrame(renderFrame);
    };
    const stop = () => cancelAnimationFrame(animationFrame);
    video.addEventListener("play", start);
    video.addEventListener("pause", stop);
    video.addEventListener("ended", stop);
    if (!video.paused) start();

    return () => {
      active = false;
      stop();
      video.removeEventListener("play", start);
      video.removeEventListener("pause", stop);
      video.removeEventListener("ended", stop);
    };
  }, [detectPose, poseLandmarker, videoRef]);

  const metrics =
    landmarks && worldLandmarks ? calculatePoseMetrics(landmarks, worldLandmarks) : null;
  const pointVisible = (point: NormalizedLandmark | undefined) =>
    Boolean(point && (point.visibility ?? 1) >= minimumLandmarkVisibility);

  return (
    <section className="crux-player" aria-label={label}>
      <div className="crux-player__heading">
        <Film size={15} aria-hidden="true" />
        <span title={name}>{name}</span>
      </div>
      <div
        className="crux-player__screen"
        style={{
          aspectRatio,
          maxWidth: `min(100%, calc(62vh * ${videoDimensions.width / videoDimensions.height}))`,
        }}
      >
        {/* biome-ignore lint/a11y/useMediaCaption: Crux does not provide subtitle tracks. */}
        <video
          ref={videoRef}
          src={src}
          preload="metadata"
          playsInline
          aria-label={`${name}の映像`}
          onLoadedMetadata={(event) => {
            const video = event.currentTarget;
            if (video.videoWidth > 0 && video.videoHeight > 0) {
              setVideoDimensions({ width: video.videoWidth, height: video.videoHeight });
              setAspectRatio(`${video.videoWidth} / ${video.videoHeight}`);
            }
            onDurationChange?.(video.duration);
          }}
          onLoadedData={detectPose}
          onTimeUpdate={(event) => {
            onTimeUpdate?.(event.currentTarget.currentTime);
          }}
          onSeeked={detectPose}
          onEnded={onEnded}
          onError={() => setError("この動画形式またはコーデックはブラウザーで再生できません。")}
          style={{ opacity: displayOptions.showVideo ? 1 : 0 }}
        />
        {landmarks && (
          <svg
            className="crux-player__overlay"
            viewBox="0 0 1 1"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {displayOptions.showSkeleton &&
              poseConnections.map(([start, end]) => {
                const first = landmarks[start];
                const last = landmarks[end];
                if (!pointVisible(first) || !pointVisible(last)) return null;
                return (
                  <line
                    key={`${start}-${end}`}
                    x1={first.x}
                    y1={first.y}
                    x2={last.x}
                    y2={last.y}
                    className="crux-player__bone"
                    style={{
                      stroke: displayOptions.skeletonColor,
                      opacity: displayOptions.skeletonOpacity,
                    }}
                  />
                );
              })}
            {displayOptions.showJoints &&
              landmarks.map((point, index) =>
                pointVisible(point) && isJointPartVisible(index, displayOptions) ? (
                  <circle
                    // biome-ignore lint/suspicious/noArrayIndexKey: Pose landmarks have stable joint indices.
                    key={index}
                    cx={point.x}
                    cy={point.y}
                    r="0.008"
                    className="crux-player__joint"
                    style={{ fill: displayOptions.jointColor }}
                  />
                ) : null,
              )}
            {displayOptions.showTorsoCenter && metrics?.torsoCenter && (
              <circle
                cx={metrics.torsoCenter.x}
                cy={metrics.torsoCenter.y}
                r="0.018"
                className="crux-player__center"
                style={{ fill: displayOptions.torsoCenterColor }}
              />
            )}
          </svg>
        )}
        {!landmarks && poseLandmarker && !error && (
          <span className="crux-player__status">人物を検出できません</span>
        )}
      </div>
      {poseLandmarker && (
        <>
          <button
            className="button button--outline crux-player__3d-toggle"
            type="button"
            aria-expanded={show3DModel}
            onClick={() => setShow3DModel((shown) => !shown)}
          >
            {show3DModel ? "3Dモデルを隠す" : "3Dモデルを表示"}
          </button>
          {show3DModel && (
            <Pose3DPreview landmarks={worldLandmarks} displayOptions={displayOptions} />
          )}
        </>
      )}
      {showStartPosition && (
        <label className="crux-start-position">
          <span>
            <span>{name} の開始位置</span>
            <output>{formatTime(startPosition)}</output>
          </span>
          <input
            type="range"
            min="0"
            max={duration || 0}
            step="0.01"
            value={Math.min(startPosition, duration || 0)}
            aria-label={`${name}の開始位置`}
            disabled={!duration}
            onChange={(event) => onStartPositionChange(Number(event.currentTarget.value))}
          />
        </label>
      )}
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {metrics && (
        <dl className="crux-metrics" aria-label="MediaPipeの3D姿勢推定に基づく関節角度">
          <div>
            <dt>左肘</dt>
            <dd>{metrics.leftElbow === null ? "—" : `${metrics.leftElbow}°`}</dd>
          </div>
          <div>
            <dt>右肘</dt>
            <dd>{metrics.rightElbow === null ? "—" : `${metrics.rightElbow}°`}</dd>
          </div>
          <div>
            <dt>左膝</dt>
            <dd>{metrics.leftKnee === null ? "—" : `${metrics.leftKnee}°`}</dd>
          </div>
          <div>
            <dt>右膝</dt>
            <dd>{metrics.rightKnee === null ? "—" : `${metrics.rightKnee}°`}</dd>
          </div>
          <div className="crux-metrics__center">
            <dt>胴体中心（2D目安）</dt>
            <dd>
              {metrics.torsoCenter
                ? `${Math.round(metrics.torsoCenter.x * 100)}%, ${Math.round(metrics.torsoCenter.y * 100)}%`
                : "—"}
            </dd>
          </div>
        </dl>
      )}
    </section>
  );
}

export function CruxPage() {
  const [videos, setVideos] = useState<CruxVideo[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [comparisonId, setComparisonId] = useState("");
  const [primaryStartTime, setPrimaryStartTime] = useState(0);
  const [comparisonStartTime, setComparisonStartTime] = useState(0);
  const [selectedFile, setSelectedFile] = useState<Blob | null>(null);
  const [comparisonFile, setComparisonFile] = useState<Blob | null>(null);
  const [selectedUrl, setSelectedUrl] = useState("");
  const [comparisonUrl, setComparisonUrl] = useState("");
  const [loadingLibrary, setLoadingLibrary] = useState(true);
  const [savingVideos, setSavingVideos] = useState(false);
  const [error, setError] = useState("");
  const [analysisError, setAnalysisError] = useState("");
  const [analysisNotice, setAnalysisNotice] = useState("");
  const [displayOptions, setDisplayOptions] = useState(defaultCruxDisplayOptions);
  const [displayOptionsLoaded, setDisplayOptionsLoaded] = useState(false);
  const [displayOptionsError, setDisplayOptionsError] = useState("");
  const [poseConfidenceThresholds, setPoseConfidenceThresholds] = useState(
    defaultPoseConfidenceThresholds,
  );
  const [analysisStatus, setAnalysisStatus] = useState<"idle" | "loading" | "ready">("idle");
  const [poseLandmarker, setPoseLandmarker] = useState<PoseLandmarker | null>(null);
  const [comparisonLandmarker, setComparisonLandmarker] = useState<PoseLandmarker | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [comparisonDuration, setComparisonDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const videoRef = useRef<HTMLVideoElement>(null);
  const comparisonVideoRef = useRef<HTMLVideoElement>(null);
  const poseLandmarkerRef = useRef<PoseLandmarker | null>(null);
  const comparisonLandmarkerRef = useRef<PoseLandmarker | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    try {
      setDisplayOptions(
        parseCruxDisplayOptions(window.localStorage.getItem(displayOptionsStorageKey)),
      );
    } catch (reason) {
      setDisplayOptionsError(errorText(reason, "表示設定を読み込めませんでした。"));
    } finally {
      setDisplayOptionsLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!displayOptionsLoaded) return;
    try {
      window.localStorage.setItem(displayOptionsStorageKey, JSON.stringify(displayOptions));
    } catch (reason) {
      setDisplayOptionsError(errorText(reason, "表示設定を保存できませんでした。"));
    }
  }, [displayOptions, displayOptionsLoaded]);

  function updateDisplayOption<Key extends keyof CruxDisplayOptions>(
    key: Key,
    value: CruxDisplayOptions[Key],
  ) {
    setDisplayOptions((current) => ({ ...current, [key]: value }));
    setDisplayOptionsError("");
  }

  function updateJointVisibility(key: (typeof poseJointLandmarks)[number]["key"], value: boolean) {
    setDisplayOptions((current) => ({
      ...current,
      jointVisibility: { ...current.jointVisibility, [key]: value },
    }));
    setDisplayOptionsError("");
  }

  useEffect(() => {
    mounted.current = true;
    void listCruxVideos()
      .then((items) => {
        if (mounted.current) {
          setVideos(items.reverse());
          setSelectedId(items[0]?.id ?? "");
        }
      })
      .catch((reason: unknown) => {
        if (mounted.current) setError(errorText(reason, "動画ライブラリを読み込めませんでした。"));
      })
      .finally(() => {
        if (mounted.current) setLoadingLibrary(false);
      });
    return () => {
      mounted.current = false;
      poseLandmarkerRef.current?.close();
      poseLandmarkerRef.current = null;
      comparisonLandmarkerRef.current?.close();
      comparisonLandmarkerRef.current = null;
    };
  }, []);

  useEffect(() => {
    let active = true;
    setSelectedFile(null);
    setSelectedUrl("");
    if (!selectedId) return;
    void getCruxVideoFile(selectedId)
      .then((file) => {
        if (!file)
          throw new Error(
            "保存した動画が見つかりません。ライブラリから削除して再度追加してください。",
          );
        if (active) setSelectedFile(file);
      })
      .catch((reason: unknown) => {
        if (active) setError(errorText(reason, "動画を開けませんでした。"));
      });
    return () => {
      active = false;
    };
  }, [selectedId]);

  useEffect(() => {
    if (!selectedFile) return;
    const url = URL.createObjectURL(selectedFile);
    setSelectedUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedFile]);

  useEffect(() => {
    let active = true;
    setComparisonFile(null);
    setComparisonUrl("");
    if (!comparisonId) return;
    void getCruxVideoFile(comparisonId)
      .then((file) => {
        if (!file) throw new Error("比較用の動画が見つかりません。");
        if (active) setComparisonFile(file);
      })
      .catch((reason: unknown) => {
        if (active) setError(errorText(reason, "比較用の動画を開けませんでした。"));
      });
    return () => {
      active = false;
    };
  }, [comparisonId]);

  useEffect(() => {
    if (!comparisonFile) return;
    const url = URL.createObjectURL(comparisonFile);
    setComparisonUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [comparisonFile]);

  function stopAnalysis() {
    poseLandmarkerRef.current?.close();
    comparisonLandmarkerRef.current?.close();
    poseLandmarkerRef.current = null;
    comparisonLandmarkerRef.current = null;
    setPoseLandmarker(null);
    setComparisonLandmarker(null);
    setAnalysisStatus("idle");
    setAnalysisNotice("");
  }

  function selectVideo(id: string) {
    videoRef.current?.pause();
    comparisonVideoRef.current?.pause();
    stopAnalysis();
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setPrimaryStartTime(0);
    setComparisonStartTime(0);
    setSelectedId(id);
  }

  async function importVideos(files: FileList | null) {
    if (!files?.length) return;
    setSavingVideos(true);
    setError("");
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("video/") && !/\.(mp4|m4v|mov|webm|ogv|avi)$/i.test(file.name)) {
          throw new Error(`${file.name}: 動画ファイルを選択してください。`);
        }
        const video = await addCruxVideo(file);
        setVideos((current) => [video, ...current]);
        setSelectedId((current) => current || video.id);
      }
    } catch (reason) {
      setError(
        errorText(reason, "動画を保存できませんでした。ブラウザーの空き容量をご確認ください。"),
      );
    } finally {
      setSavingVideos(false);
    }
  }

  async function deleteVideo(video: CruxVideo) {
    setError("");
    try {
      await removeCruxVideo(video.id);
      setVideos((current) => current.filter((item) => item.id !== video.id));
      if (selectedId === video.id) {
        selectVideo(videos.find((item) => item.id !== video.id)?.id ?? "");
      }
      if (comparisonId === video.id) {
        stopAnalysis();
        setComparisonId("");
        setComparisonStartTime(0);
        setComparisonDuration(0);
      }
    } catch (reason) {
      setError(errorText(reason, "動画を削除できませんでした。"));
    }
  }

  async function toggleAnalysis() {
    setAnalysisError("");
    setAnalysisNotice("");
    if (poseLandmarker) {
      stopAnalysis();
      return;
    }
    setAnalysisStatus("loading");
    let primary: PoseLandmarker | null = null;
    let comparison: PoseLandmarker | null = null;
    try {
      const { FilesetResolver, PoseLandmarker } = await import("@mediapipe/tasks-vision");
      const vision = await FilesetResolver.forVisionTasks(visionWasmUrl);
      const createWithDelegate = (delegate: "CPU" | "GPU") =>
        PoseLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: poseLandmarkerModelUrl, delegate },
          ...poseLandmarkerOptions,
          ...poseConfidenceThresholds,
        });
      const createLandmarker = async () => {
        try {
          return { landmarker: await createWithDelegate("GPU"), delegate: "GPU" as const };
        } catch (gpuError) {
          try {
            return { landmarker: await createWithDelegate("CPU"), delegate: "CPU" as const };
          } catch (cpuError) {
            throw new Error(
              `GPU: ${errorText(gpuError, "初期化に失敗しました")} / CPU: ${errorText(cpuError, "初期化に失敗しました")}`,
            );
          }
        }
      };
      const primaryResult = await createLandmarker();
      primary = primaryResult.landmarker;
      if (comparisonId) {
        const comparisonResult = await createLandmarker();
        comparison = comparisonResult.landmarker;
        if (comparisonResult.delegate === "CPU") {
          setAnalysisNotice("比較動画の解析にGPUを使えないため、CPUで解析しています。");
        }
      }
      if (!mounted.current) {
        primary.close();
        comparison?.close();
        return;
      }
      if (primaryResult.delegate === "CPU") {
        setAnalysisNotice("GPUを使えないため、CPUで解析しています。");
      }
      poseLandmarkerRef.current = primary;
      comparisonLandmarkerRef.current = comparison;
      setPoseLandmarker(primary);
      setComparisonLandmarker(comparison);
      setAnalysisStatus("ready");
    } catch (reason) {
      primary?.close();
      comparison?.close();
      setAnalysisStatus("idle");
      setAnalysisError(
        errorText(
          reason,
          "姿勢推定モデルを読み込めませんでした。ネットワーク接続を確認して再試行してください。",
        ),
      );
    }
  }

  async function togglePlayback() {
    const primary = videoRef.current;
    if (!primary) return;
    setError("");
    if (primary.paused) {
      try {
        await primary.play();
        if (comparisonVideoRef.current) await comparisonVideoRef.current.play();
      } catch (reason) {
        primary.pause();
        comparisonVideoRef.current?.pause();
        setIsPlaying(false);
        setError(errorText(reason, "動画を再生できませんでした。"));
        return;
      }
      setIsPlaying(true);
    } else {
      primary.pause();
      comparisonVideoRef.current?.pause();
      setIsPlaying(false);
    }
  }

  function seekTo(time: number) {
    const primary = videoRef.current;
    if (!primary) return;
    const nextTime = Math.max(0, Math.min(time, Number.isFinite(duration) ? duration : time));
    primary.currentTime = nextTime;
    if (comparisonVideoRef.current) {
      comparisonVideoRef.current.currentTime = getSynchronizedTime(
        nextTime,
        primaryStartTime,
        comparisonStartTime,
        comparisonVideoRef.current.duration,
      );
    }
    setCurrentTime(nextTime);
  }

  function changePlaybackRate(rate: number) {
    setPlaybackRate(rate);
    if (videoRef.current) videoRef.current.playbackRate = rate;
    if (comparisonVideoRef.current) comparisonVideoRef.current.playbackRate = rate;
  }

  function syncComparison(
    time: number,
    primaryStart = primaryStartTime,
    comparisonStart = comparisonStartTime,
  ) {
    setCurrentTime(time);
    const comparison = comparisonVideoRef.current;
    if (comparison) {
      const targetTime = getSynchronizedTime(
        time,
        primaryStart,
        comparisonStart,
        comparison.duration,
      );
      if (Math.abs(comparison.currentTime - targetTime) > 1 / 30) {
        comparison.currentTime = targetTime;
      }
    }
  }

  function changePrimaryStartTime(value: number) {
    if (!Number.isFinite(value)) return;
    const startTime = Math.max(0, Math.min(value, duration));
    setPrimaryStartTime(startTime);
    if (videoRef.current) videoRef.current.currentTime = startTime;
    syncComparison(startTime, startTime, comparisonStartTime);
  }

  function changeComparisonStartTime(value: number) {
    if (!Number.isFinite(value)) return;
    const startTime = Math.max(0, Math.min(value, comparisonDuration));
    setComparisonStartTime(startTime);
    if (videoRef.current) videoRef.current.currentTime = primaryStartTime;
    if (comparisonVideoRef.current) comparisonVideoRef.current.currentTime = startTime;
    setCurrentTime(primaryStartTime);
  }

  const comparisonVideo = videos.find((video) => video.id === comparisonId);

  return (
    <main className="page-shell crux-page">
      <header className="crux-heading">
        <Link className="back-link" to="/tools">
          <ArrowLeft size={15} aria-hidden="true" /> ツール一覧
        </Link>
        <p className="eyebrow">CRUX · POSE ANALYSIS</p>
        <h1 className="display-title">Crux</h1>
        <p className="intro-copy">
          クライミング動画を端末内で解析。2D骨格と回転できる3D姿勢を確認し、動画を比較できます。
        </p>
      </header>

      <div className="crux-layout">
        <aside className="crux-library" aria-label="動画ライブラリ">
          <div className="crux-library__heading">
            <div>
              <p className="eyebrow">LOCAL LIBRARY</p>
              <h2>動画</h2>
            </div>
            <Film size={20} aria-hidden="true" />
          </div>
          <label className="button button--primary crux-import">
            <Plus size={16} aria-hidden="true" />
            {savingVideos ? "保存中..." : "動画を追加"}
            <input
              type="file"
              accept="video/*,.mov"
              multiple
              disabled={savingVideos}
              onChange={(event) => {
                void importVideos(event.currentTarget.files);
                event.currentTarget.value = "";
              }}
            />
          </label>
          {loadingLibrary ? (
            <p className="crux-library__empty">ライブラリを読み込み中...</p>
          ) : videos.length ? (
            <ul className="crux-library__list">
              {videos.map((video) => (
                <li key={video.id} className={video.id === selectedId ? "is-selected" : ""}>
                  <button
                    className="crux-library__select"
                    type="button"
                    aria-current={video.id === selectedId ? "true" : undefined}
                    onClick={() => {
                      selectVideo(video.id);
                      setError("");
                    }}
                  >
                    <Film size={16} aria-hidden="true" />
                    <span>
                      <strong>{video.name}</strong>
                      <small>{new Date(video.addedAt).toLocaleDateString()}</small>
                    </span>
                  </button>
                  <button
                    className="icon-button crux-library__delete"
                    type="button"
                    aria-label={`${video.name}を削除`}
                    onClick={() => void deleteVideo(video)}
                  >
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="crux-library__empty">動画を追加すると、ここに保存されます。</p>
          )}
        </aside>

        <section className="crux-workspace" aria-label="動画解析">
          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
          {displayOptionsError && (
            <p className="inline-error" role="alert">
              {displayOptionsError}
            </p>
          )}
          {selectedUrl ? (
            <>
              <div className="crux-toolbar">
                <label className="field-label crux-compare-select">
                  比較する動画
                  <select
                    className="text-input"
                    value={comparisonId}
                    onChange={(event) => {
                      stopAnalysis();
                      setComparisonId(event.currentTarget.value);
                      setPrimaryStartTime(0);
                      setComparisonStartTime(0);
                      setComparisonDuration(0);
                    }}
                  >
                    <option value="">比較しない</option>
                    {videos
                      .filter((video) => video.id !== selectedId)
                      .map((video) => (
                        <option key={video.id} value={video.id}>
                          {video.name}
                        </option>
                      ))}
                  </select>
                </label>
                <button
                  className={`button ${poseLandmarker ? "button--outline" : "button--primary"}`}
                  type="button"
                  disabled={analysisStatus === "loading"}
                  onClick={() => void toggleAnalysis()}
                >
                  <ScanLine size={16} aria-hidden="true" />
                  {analysisStatus === "loading"
                    ? "モデルを読み込み中..."
                    : poseLandmarker
                      ? "2D解析を停止"
                      : "2D解析を開始"}
                </button>
              </div>

              {analysisStatus === "loading" && (
                <p className="crux-notice" role="status">
                  精度重視のHeavyモデル（約31MB）を読み込み中です。初回のみダウンロードされ、動画はアップロードされません。
                </p>
              )}
              {analysisError && (
                <p className="inline-error" role="alert">
                  {analysisError}
                </p>
              )}
              {analysisNotice && (
                <p className="crux-notice" role="status">
                  {analysisNotice}
                </p>
              )}

              <details className="crux-display-settings">
                <summary>表示設定</summary>
                <div className="crux-display-settings__content">
                  <fieldset className="crux-display-settings__confidence">
                    <legend>姿勢推定の信頼度</legend>
                    <p>
                      低信頼の検出を除外します。値を上げると誤検出は減りますが、人物を検出しにくくなります。解析停止中に変更してください。
                    </p>
                    {poseConfidenceControls.map(({ key, label }) => (
                      <label key={key}>
                        {label}
                        <span>
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.01"
                            value={poseConfidenceThresholds[key]}
                            disabled={analysisStatus !== "idle"}
                            onChange={(event) =>
                              setPoseConfidenceThresholds((current) => ({
                                ...current,
                                [key]: Number(event.currentTarget.value),
                              }))
                            }
                          />
                          <output>{poseConfidenceThresholds[key].toFixed(2)}</output>
                        </span>
                      </label>
                    ))}
                  </fieldset>
                  <fieldset className="crux-display-settings__visibility">
                    <legend>表示 / 非表示</legend>
                    <label>
                      <input
                        type="checkbox"
                        checked={displayOptions.showVideo}
                        onChange={(event) =>
                          updateDisplayOption("showVideo", event.currentTarget.checked)
                        }
                      />
                      背景動画
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={displayOptions.showSkeleton}
                        onChange={(event) =>
                          updateDisplayOption("showSkeleton", event.currentTarget.checked)
                        }
                      />
                      骨格の線
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={displayOptions.showJoints}
                        onChange={(event) =>
                          updateDisplayOption("showJoints", event.currentTarget.checked)
                        }
                      />
                      関節
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={displayOptions.showTorsoCenter}
                        onChange={(event) =>
                          updateDisplayOption("showTorsoCenter", event.currentTarget.checked)
                        }
                      />
                      胴体中心
                    </label>
                  </fieldset>
                  <fieldset className="crux-display-settings__joint-parts">
                    <legend>関節の部位・ポイント別表示</legend>
                    {poseJointGroups.map((group) => (
                      <div className="crux-display-settings__joint-group" key={group.key}>
                        <label>
                          <input
                            type="checkbox"
                            checked={displayOptions[group.option]}
                            onChange={(event) =>
                              updateDisplayOption(group.option, event.currentTarget.checked)
                            }
                          />
                          {group.label}
                        </label>
                        <details>
                          <summary>個別に選択</summary>
                          <div className="crux-display-settings__joint-list">
                            {poseJointLandmarks
                              .filter((joint) => joint.group === group.key)
                              .map((joint) => (
                                <label key={joint.key}>
                                  <input
                                    type="checkbox"
                                    checked={displayOptions.jointVisibility[joint.key] !== false}
                                    onChange={(event) =>
                                      updateJointVisibility(joint.key, event.currentTarget.checked)
                                    }
                                  />
                                  {joint.label}
                                </label>
                              ))}
                          </div>
                        </details>
                      </div>
                    ))}
                  </fieldset>
                  <fieldset className="crux-display-settings__appearance">
                    <legend>色・透過度</legend>
                    <label>
                      骨格線の色
                      <input
                        type="color"
                        value={displayOptions.skeletonColor}
                        onChange={(event) =>
                          updateDisplayOption("skeletonColor", event.currentTarget.value)
                        }
                      />
                    </label>
                    <label>
                      骨格線の透過度
                      <span>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          step="1"
                          value={Math.round(displayOptions.skeletonOpacity * 100)}
                          onChange={(event) =>
                            updateDisplayOption(
                              "skeletonOpacity",
                              Number(event.currentTarget.value) / 100,
                            )
                          }
                        />
                        <output>{Math.round(displayOptions.skeletonOpacity * 100)}%</output>
                      </span>
                    </label>
                    <label>
                      関節の色
                      <input
                        type="color"
                        value={displayOptions.jointColor}
                        onChange={(event) =>
                          updateDisplayOption("jointColor", event.currentTarget.value)
                        }
                      />
                    </label>
                    <label>
                      胴体中心の色
                      <input
                        type="color"
                        value={displayOptions.torsoCenterColor}
                        onChange={(event) =>
                          updateDisplayOption("torsoCenterColor", event.currentTarget.value)
                        }
                      />
                    </label>
                  </fieldset>
                </div>
              </details>

              <div className={`crux-players${comparisonUrl ? " crux-players--comparison" : ""}`}>
                <PoseVideoPlayer
                  key={selectedId}
                  name={videos.find((video) => video.id === selectedId)?.name ?? "動画"}
                  src={selectedUrl}
                  label="解析する動画"
                  poseLandmarker={poseLandmarker}
                  videoRef={videoRef}
                  startPosition={primaryStartTime}
                  duration={duration}
                  showStartPosition={Boolean(comparisonUrl)}
                  onStartPositionChange={changePrimaryStartTime}
                  displayOptions={displayOptions}
                  onTimeUpdate={syncComparison}
                  onDurationChange={(nextDuration) => {
                    setDuration(nextDuration);
                    setCurrentTime(0);
                    setIsPlaying(false);
                  }}
                  onEnded={() => {
                    comparisonVideoRef.current?.pause();
                    setIsPlaying(false);
                  }}
                />
                {comparisonUrl && comparisonVideo && (
                  <PoseVideoPlayer
                    key={comparisonId}
                    name={comparisonVideo.name}
                    src={comparisonUrl}
                    label="比較動画"
                    poseLandmarker={comparisonLandmarker}
                    videoRef={comparisonVideoRef}
                    startPosition={comparisonStartTime}
                    duration={comparisonDuration}
                    showStartPosition
                    onStartPositionChange={changeComparisonStartTime}
                    displayOptions={displayOptions}
                    onDurationChange={(nextDuration) => {
                      setComparisonDuration(nextDuration);
                      syncComparison(
                        videoRef.current?.currentTime ?? currentTime,
                        primaryStartTime,
                        comparisonStartTime,
                      );
                    }}
                  />
                )}
              </div>

              <fieldset className="crux-controls">
                <legend>動画再生コントロール</legend>
                <button
                  className="icon-button"
                  type="button"
                  aria-label="1フレーム戻る"
                  onClick={() => seekTo(currentTime - 1 / 30)}
                >
                  <ChevronLeft size={17} aria-hidden="true" />
                </button>
                <button
                  className="button button--primary crux-controls__play"
                  type="button"
                  aria-label={isPlaying ? "一時停止" : "再生"}
                  onClick={() => void togglePlayback()}
                >
                  <Play size={15} aria-hidden="true" />
                  {isPlaying ? "一時停止" : "再生"}
                </button>
                <button
                  className="icon-button"
                  type="button"
                  aria-label="1フレーム進む"
                  onClick={() => seekTo(currentTime + 1 / 30)}
                >
                  <ChevronRight size={17} aria-hidden="true" />
                </button>
                <span className="crux-controls__time">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
                <input
                  className="crux-controls__seek"
                  type="range"
                  aria-label="再生位置"
                  min="0"
                  max={duration || 0}
                  step="0.01"
                  value={Math.min(currentTime, duration || 0)}
                  onChange={(event) => seekTo(Number(event.currentTarget.value))}
                />
                <label className="crux-controls__speed">
                  速度
                  <select
                    className="text-input"
                    value={playbackRate}
                    onChange={(event) => changePlaybackRate(Number(event.currentTarget.value))}
                  >
                    {[0.25, 0.5, 0.75, 1].map((rate) => (
                      <option key={rate} value={rate}>
                        {rate}x
                      </option>
                    ))}
                  </select>
                </label>
              </fieldset>
            </>
          ) : (
            <section className="empty-state crux-empty" aria-labelledby="crux-empty-title">
              <div className="empty-state__mark">
                <Film size={24} aria-hidden="true" />
              </div>
              <div>
                <h2 id="crux-empty-title">動画を選んで解析</h2>
                <p>動画はこのブラウザー内に保存されます。外部へアップロードしません。</p>
              </div>
            </section>
          )}
          <p className="crux-footnote">
            3D姿勢と関節角度はMediaPipeの単眼推定です。実寸・壁までの距離・実際の重心を示すものではありません。LiDAR計測は使用しません。
          </p>
        </section>
      </div>
    </main>
  );
}
