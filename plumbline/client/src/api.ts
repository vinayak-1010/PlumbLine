let userId = localStorage.getItem("pl_user") || "";
export const getUserId = () => userId;
export function setUserId(id: string) { userId = id; if (id) localStorage.setItem("pl_user", id); else localStorage.removeItem("pl_user"); }

async function call<T>(method: string, url: string, body?: any): Promise<T> {
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  const res = await fetch(url, {
    method,
    headers: { ...(userId ? { "x-user-id": userId } : {}), ...(body && !isForm ? { "content-type": "application/json" } : {}) },
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new Error((data && data.error) || `Request failed (${res.status})`);
  return data as T;
}
export const api = {
  get: <T>(u: string) => call<T>("GET", u),
  post: <T>(u: string, b?: any) => call<T>("POST", u, b ?? {}),
  put: <T>(u: string, b?: any) => call<T>("PUT", u, b ?? {}),
  del: <T>(u: string) => call<T>("DELETE", u),
};
export async function downloadText(url: string, filename: string) {
  const res = await fetch(url, { headers: { "x-user-id": userId } });
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
