import { useEffect, useState } from "react";
import {
  type UpdateState,
  applyUpdate,
  getUpdateState,
  subscribeToUpdateState,
} from "@/lib/app-updater";

export type UseOTAUpdateResult = {
  status: UpdateState["status"];
  error?: string;
  isUpdateReady: boolean;
  applyUpdate: () => Promise<void>;
};

export function useOTAUpdate(): UseOTAUpdateResult {
  const [state, setState] = useState<UpdateState>(getUpdateState);

  useEffect(() => {
    const unsub = subscribeToUpdateState(setState);
    return unsub;
  }, []);

  return {
    status: state.status,
    error: state.error,
    isUpdateReady: state.status === "ready",
    applyUpdate,
  };
}
