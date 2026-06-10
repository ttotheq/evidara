"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ApiError, apiFetch, setCsrfToken } from "../../../lib/api";

interface LoginResponse {
  data: { user: { displayName: string }; csrfToken: string };
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await apiFetch<LoginResponse>("/v1/auth/login", {
        method: "POST",
        body: { email, password },
      });
      setCsrfToken(response.data.csrfToken);
      router.push("/cases");
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.status === 401
          ? "Invalid email or password."
          : "Sign-in failed. Check your connection and try again.",
      );
      setSubmitting(false);
    }
  }

  return (
    <main className="authPage">
      <form className="authCard" onSubmit={handleSubmit} aria-busy={submitting}>
        <a className="brand" href="/">
          <span className="brandMark">E</span>
          Evidara
        </a>
        <h1>Sign in</h1>
        <p className="authLede">
          Use your workspace account. Public registration is disabled.
        </p>

        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />

        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />

        {error ? (
          <p className="formError" role="alert">
            {error}
          </p>
        ) : null}

        <button type="submit" disabled={submitting}>
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
