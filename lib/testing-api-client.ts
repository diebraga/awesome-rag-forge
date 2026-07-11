"use client";

export const TESTING_API_KEY_STORAGE_KEY = "awesome-rag-forge.appApiKey";
export const TESTING_API_AUTH_EVENT = "awesome-rag-forge:api-auth-required";

export function getStoredTestingApiKey() {
  if (typeof window === "undefined") return null;
  const key = window.localStorage.getItem(TESTING_API_KEY_STORAGE_KEY)?.trim();
  return key && key.length > 0 ? key : null;
}

export function storeTestingApiKey(key: string) {
  window.localStorage.setItem(TESTING_API_KEY_STORAGE_KEY, key.trim());
}

export function clearStoredTestingApiKey() {
  window.localStorage.removeItem(TESTING_API_KEY_STORAGE_KEY);
}

export function notifyTestingApiAuthRequired(message?: string) {
  window.dispatchEvent(new CustomEvent(TESTING_API_AUTH_EVENT, { detail: { message } }));
}

function mergeHeaders(headers: HeadersInit | undefined) {
  const merged = new Headers(headers);
  const key = getStoredTestingApiKey();

  if (key && !merged.has("Authorization")) {
    merged.set("Authorization", `Bearer ${key}`);
  }

  return merged;
}

export async function testingFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const response = await fetch(input, {
    ...init,
    headers: mergeHeaders(init.headers),
  });

  if (response.status === 401) {
    notifyTestingApiAuthRequired("Enter APP_API_KEY to unlock this testing UI in this browser.");
  }

  return response;
}
