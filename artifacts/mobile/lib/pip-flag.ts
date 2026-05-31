import { NativeModules, Platform } from "react-native";

const PipNative = NativeModules.PipModule as { setActive: (active: boolean) => void } | undefined;

export function setPipActive(active: boolean): void {
  if (Platform.OS !== "android") return;
  try {
    PipNative?.setActive(active);
  } catch {}
}
