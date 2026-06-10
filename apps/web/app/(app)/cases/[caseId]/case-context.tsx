"use client";

import type { CaseDetail } from "@evidara/contracts";
import { createContext, useContext } from "react";

export interface CaseContextValue {
  detail: CaseDetail;
  refresh: () => Promise<void>;
  can: (action: CaseDetail["permissions"][number]) => boolean;
}

export const CaseContext = createContext<CaseContextValue | null>(null);

export function useCase(): CaseContextValue {
  const value = useContext(CaseContext);
  if (!value) {
    throw new Error("useCase must be used inside the case workspace layout");
  }
  return value;
}
