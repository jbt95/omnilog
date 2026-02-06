export type JsonResponse<T> = {
  status: number;
  body: T | undefined;
};

export async function GetJson<T = unknown>(
  baseUrl: string,
  path: string,
  init: RequestInit = {},
): Promise<JsonResponse<T>> {
  const response = await fetch(new URL(path, baseUrl), init);
  const text = await response.text();
  if (!text) {
    return { status: response.status, body: undefined };
  }

  return {
    status: response.status,
    body: JSON.parse(text) as T,
  };
}
