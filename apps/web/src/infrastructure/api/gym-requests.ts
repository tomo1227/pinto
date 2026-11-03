export type GymRegistrationRequestInput = {
  prefectureCode: string;
  gymName: string;
  address?: string;
  phone?: string;
  website?: string;
  message?: string;
};

export type GymRegistrationRequest = GymRegistrationRequestInput & {
  id: string;
  gymName: string;
  address: string;
  phone: string;
  website: string;
  message: string;
  createdAt: number;
};

async function parseResponse<T>(response: Response, fallback: string): Promise<T> {
  const result = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(result.error ?? fallback);
  return result;
}

export async function submitGymRegistrationRequest(input: GymRegistrationRequestInput) {
  const response = await fetch("/api/gyms/requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseResponse<{ requestId: string }>(response, "ジムの登録申請に失敗しました。");
}

export async function getGymRegistrationRequests() {
  const response = await fetch("/api/gyms/requests");
  const result = await parseResponse<{ requests: GymRegistrationRequest[] }>(
    response,
    "申請一覧を読み込めませんでした。",
  );
  return result.requests;
}

export async function deleteGymRegistrationRequest(requestId: string) {
  const response = await fetch(`/api/gyms/requests/${encodeURIComponent(requestId)}`, {
    method: "DELETE",
  });
  return parseResponse<{ deleted: true }>(response, "申請を削除できませんでした。");
}
