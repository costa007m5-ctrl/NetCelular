import { useEffect, useState } from "react";
import NetInfo from "@react-native-community/netinfo";

interface NetworkStatus {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
  type: string | null;
}

export function useNetworkStatus(): NetworkStatus {
  const [status, setStatus] = useState<NetworkStatus>({
    isConnected: null,
    isInternetReachable: null,
    type: null,
  });

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setStatus({
        isConnected: state.isConnected,
        isInternetReachable: state.isInternetReachable,
        type: state.type,
      });
    });

    NetInfo.fetch().then((state) => {
      setStatus({
        isConnected: state.isConnected,
        isInternetReachable: state.isInternetReachable,
        type: state.type,
      });
    });

    return () => unsubscribe();
  }, []);

  return status;
}
