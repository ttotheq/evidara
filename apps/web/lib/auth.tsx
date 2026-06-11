"use client";

import type { Membership, SafeUser } from "@evidara/contracts";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { apiFetch, setCsrfToken } from "./api";

interface MeResponse {
  data: { user: SafeUser; memberships: Membership[] };
}

interface AuthState {
  status: "loading" | "authenticated" | "unauthenticated";
  user: SafeUser | null;
  memberships: Membership[];
}

interface AuthContextValue extends AuthState {
  activeOrganization: Membership | null;
  setActiveOrganizationId: (organizationId: string) => void;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    status: "loading",
    user: null,
    memberships: [],
  });
  const [activeOrganizationId, setActiveOrganizationId] = useState<
    string | null
  >(null);

  const refresh = useCallback(async () => {
    try {
      const response = await apiFetch<MeResponse>("/v1/me");
      setState({
        status: "authenticated",
        user: response.data.user,
        memberships: response.data.memberships,
      });
    } catch {
      setState({ status: "unauthenticated", user: null, memberships: [] });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signOut = useCallback(async () => {
    try {
      await apiFetch("/v1/auth/logout", { method: "POST" });
    } finally {
      setCsrfToken(null);
      setState({ status: "unauthenticated", user: null, memberships: [] });
    }
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const activeOrganization =
      state.memberships.find(
        (membership) => membership.organizationId === activeOrganizationId,
      ) ??
      state.memberships[0] ??
      null;
    return {
      ...state,
      activeOrganization,
      setActiveOrganizationId,
      refresh,
      signOut,
    };
  }, [state, activeOrganizationId, refresh, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return value;
}
