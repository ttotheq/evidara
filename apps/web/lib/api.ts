const CSRF_STORAGE_KEY = "evidara.csrf";

let csrfToken: string | null = null;

export function setCsrfToken(token: string | null) {
  csrfToken = token;
  if (typeof window === "undefined") return;
  if (token) {
    window.sessionStorage.setItem(CSRF_STORAGE_KEY, token);
  } else {
    window.sessionStorage.removeItem(CSRF_STORAGE_KEY);
  }
}

function getCsrfToken(): string | null {
  if (!csrfToken && typeof window !== "undefined") {
    csrfToken = window.sessionStorage.getItem(CSRF_STORAGE_KEY);
  }
  return csrfToken;
}

export class ApiError extends Error {
  status: number;
  code: string;
  currentVersion?: number;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

interface ApiFetchOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
}

export async function apiFetch<T>(
  path: string,
  options: ApiFetchOptions = {},
): Promise<T> {
  const method = options.method ?? "GET";
  const isMutation = method !== "GET";
  // FormData bodies set their own multipart boundary; the browser must
  // provide the content type.
  const isFormData =
    typeof FormData !== "undefined" && options.body instanceof FormData;

  const performFetch = () => {
    const token = getCsrfToken();
    return fetch(path, {
      method,
      credentials: "same-origin",
      headers: {
        ...(options.body !== undefined && !isFormData
          ? { "content-type": "application/json" }
          : {}),
        ...(isMutation && token ? { "x-csrf-token": token } : {}),
        ...options.headers,
      },
      ...(options.body !== undefined
        ? {
            body: isFormData
              ? (options.body as FormData)
              : JSON.stringify(options.body),
          }
        : {}),
    });
  };

  let response = await performFetch();

  // Recover once from a stale CSRF token (e.g. another tab rotated it).
  if (isMutation && response.status === 403) {
    const payload = (await response
      .clone()
      .json()
      .catch(() => null)) as { error?: { code?: string } } | null;
    if (payload?.error?.code === "CSRF_REJECTED") {
      const refreshed = await fetch("/v1/auth/csrf", {
        credentials: "same-origin",
      });
      if (refreshed.ok) {
        const body = (await refreshed.json()) as {
          data: { csrfToken: string };
        };
        setCsrfToken(body.data.csrfToken);
        response = await performFetch();
      }
    }
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const payload = (await response.json().catch(() => null)) as
    | (T & { error?: undefined })
    | { error: { code: string; message: string; currentVersion?: number } }
    | null;

  if (!response.ok) {
    const error =
      payload && "error" in (payload as object)
        ? (
            payload as {
              error: { code: string; message: string; currentVersion?: number };
            }
          ).error
        : { code: "UNKNOWN", message: "The request failed." };
    const apiError = new ApiError(response.status, error.code, error.message);
    if (typeof error.currentVersion === "number") {
      apiError.currentVersion = error.currentVersion;
    }
    throw apiError;
  }

  return payload as T;
}
