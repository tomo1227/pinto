import { WALL_POST_TAG_CATEGORIES, type WallPostTags } from "@pinto/shared";

export type CommunityProfileInput = {
  handle: string;
  username: string;
  bio: string;
  climbingLevel: string;
  japaneseClimbingLevel: string;
  vClimbingLevel: string;
  homeGym: string;
  homeGyms: string[];
  residence: string;
  age: number | null;
  avatar: string | null;
  isPrivate: boolean;
};

export type CommunityProfile = {
  handle: string | null;
  username: string;
  bio: string;
  climbingLevel: string;
  japaneseClimbingLevel: string;
  vClimbingLevel: string;
  homeGym: string;
  homeGyms: string[];
  residence: string;
  age: number | null;
  avatar: string | null;
  isPrivate: boolean;
};

export type CommunityMember = Omit<CommunityProfile, "isPrivate"> & {
  isPrivate?: boolean;
  id: string;
  followerCount: number;
  followingCount: number;
};

export type PublicCommunityProfile = CommunityMember & {
  isFollowing: number;
  isFollowedBy: number;
  isSelf: number;
};

export type WallPostRoute = {
  id: string;
  name: string;
  grade: string;
  japaneseGrade?: string;
  vGrade?: string;
  description: string;
};

export type WallPost = {
  id: string;
  userId: string;
  username: string;
  handle: string;
  avatar: string | null;
  wallId: string;
  wallName: string;
  gymName: string;
  routes: WallPostRoute[];
  tags: WallPostTags;
  image: string;
  createdAt: number;
  likeCount: number;
  likedByMe: boolean;
  savedByMe: boolean;
};

export type WallPostInput = Pick<
  WallPost,
  "wallId" | "wallName" | "gymName" | "routes" | "tags" | "image"
>;

export type WallPostFeed = {
  posts: WallPost[];
  gyms: string[];
  grades: string[];
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const result = (await response.json().catch(() => ({}))) as { error?: string } & T;
  if (!response.ok) throw new Error(result.error ?? "リクエストに失敗しました。");
  return result;
}

export async function getMyCommunityProfile() {
  const result = await requestJson<{ profile: CommunityMember }>("/api/community/profile");
  return result.profile;
}

export async function saveMyCommunityProfile(profile: CommunityProfileInput) {
  const result = await requestJson<{ profile: CommunityProfile }>("/api/community/profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(profile),
  });
  return result.profile;
}

export async function getPublicCommunityProfile(handle: string) {
  const result = await requestJson<{ profile: PublicCommunityProfile }>(
    `/api/community/users/${encodeURIComponent(handle)}`,
  );
  return result.profile;
}

export async function setCommunityFollow(handle: string, following: boolean) {
  return requestJson<{ following: boolean }>(
    `/api/community/users/${encodeURIComponent(handle)}/follow`,
    { method: following ? "POST" : "DELETE" },
  );
}

export async function getCommunityMembers(query = "") {
  const params = new URLSearchParams();
  if (query.trim()) params.set("q", query.trim());
  const suffix = params.size ? `?${params}` : "";
  const result = await requestJson<{ members: CommunityMember[] }>(`/api/community/users${suffix}`);
  return result.members;
}

export async function getCommunityConnections(kind: "followers" | "following") {
  const result = await requestJson<{ members: CommunityMember[] }>(
    `/api/community/connections/${kind}`,
  );
  return result.members;
}

export async function getWallPostFeed(
  filters: {
    scope: "all" | "following" | "own" | "saved";
    authorHandle?: string;
    gym?: string;
    grade?: string;
    tags?: Partial<WallPostTags>;
  },
  authenticated = false,
) {
  const params = new URLSearchParams({ scope: filters.scope });
  if (filters.authorHandle) params.set("handle", filters.authorHandle);
  if (filters.gym) params.set("gym", filters.gym);
  if (filters.grade) params.set("grade", filters.grade);
  if (filters.tags) {
    for (const category of WALL_POST_TAG_CATEGORIES) {
      for (const tag of filters.tags[category] ?? []) params.append(category, tag);
    }
  }
  return requestJson<WallPostFeed>(`/api/community/posts?${params}`, {
    cache: authenticated ? "no-store" : "default",
  });
}

export async function publishWallPost(input: WallPostInput) {
  return requestJson<{
    post: Pick<WallPost, "id" | "wallId" | "wallName" | "gymName" | "routes" | "tags">;
  }>("/api/community/posts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function deleteWallPost(id: string) {
  return requestJson<{ deleted: boolean }>(`/api/community/posts/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function setWallPostLike(id: string, active: boolean) {
  return requestJson<{ active: boolean; likeCount: number }>(
    `/api/community/posts/${encodeURIComponent(id)}/like`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active }),
    },
  );
}

export async function setWallPostSaved(id: string, active: boolean) {
  return requestJson<{ active: boolean }>(`/api/community/posts/${encodeURIComponent(id)}/save`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ active }),
  });
}
