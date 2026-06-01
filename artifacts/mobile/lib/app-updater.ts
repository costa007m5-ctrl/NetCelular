import { Alert, Platform } from "react-native";

type UpdateResult =
  | { status: "up-to-date" }
  | { status: "updated" }
  | { status: "error"; reason: string }
  | { status: "unavailable" };

export async function checkAndPromptUpdate(
  silent = true
): Promise<UpdateResult> {
  if (Platform.OS === "web") return { status: "unavailable" };

  try {
    const Updates = require("expo-updates");

    if (__DEV__) {
      console.log("[Update] Modo desenvolvimento — verificação ignorada.");
      return { status: "unavailable" };
    }

    console.log("[Update] Verificando atualizações...");
    const result = await Updates.checkForUpdateAsync();

    if (!result.isAvailable) {
      console.log("[Update] App está atualizado.");
      return { status: "up-to-date" };
    }

    console.log("[Update] Nova atualização encontrada! Baixando...");
    await Updates.fetchUpdateAsync();
    console.log("[Update] Download concluído.");

    return new Promise((resolve) => {
      Alert.alert(
        "🚀 Atualização disponível",
        "Uma nova versão do NETPLAY foi instalada. Reinicie o app para aplicar as novidades.",
        [
          {
            text: "Mais tarde",
            style: "cancel",
            onPress: () => resolve({ status: "updated" }),
          },
          {
            text: "Reiniciar agora",
            style: "default",
            onPress: async () => {
              try {
                await Updates.reloadAsync();
              } catch {
                resolve({ status: "updated" });
              }
            },
          },
        ],
        { cancelable: false }
      );
    });
  } catch (e: any) {
    const reason = e?.message ?? String(e);
    console.warn("[Update] Erro ao verificar atualização:", reason);
    return { status: "error", reason };
  }
}
