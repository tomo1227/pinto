import { type DBSchema, openDB } from "idb";

export type CruxVideo = {
  id: string;
  name: string;
  type: string;
  size: number;
  addedAt: number;
};

interface CruxDatabase extends DBSchema {
  videos: {
    key: string;
    value: CruxVideo;
    indexes: { "by-added-at": number };
  };
  files: {
    key: string;
    value: Blob;
  };
}

const database = openDB<CruxDatabase>("pinto-crux", 1, {
  upgrade(db) {
    const videos = db.createObjectStore("videos", { keyPath: "id" });
    videos.createIndex("by-added-at", "addedAt");
    db.createObjectStore("files");
  },
});

export async function listCruxVideos() {
  const db = await database;
  return db.getAllFromIndex("videos", "by-added-at");
}

export async function addCruxVideo(file: File) {
  const db = await database;
  const video: CruxVideo = {
    id: crypto.randomUUID(),
    name: file.name,
    type: file.type || "video/*",
    size: file.size,
    addedAt: Date.now(),
  };
  const transaction = db.transaction(["videos", "files"], "readwrite");
  await Promise.all([
    transaction.objectStore("videos").put(video),
    transaction.objectStore("files").put(file, video.id),
    transaction.done,
  ]);
  return video;
}

export async function getCruxVideoFile(id: string) {
  const db = await database;
  return db.get("files", id);
}

export async function removeCruxVideo(id: string) {
  const db = await database;
  const transaction = db.transaction(["videos", "files"], "readwrite");
  await Promise.all([
    transaction.objectStore("videos").delete(id),
    transaction.objectStore("files").delete(id),
    transaction.done,
  ]);
}
