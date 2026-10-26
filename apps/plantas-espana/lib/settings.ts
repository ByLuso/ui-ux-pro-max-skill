import * as SecureStore from "expo-secure-store";

const PLANTNET_API_KEY = "plantnet_api_key";

export async function getPlantNetApiKey(): Promise<string | null> {
  return SecureStore.getItemAsync(PLANTNET_API_KEY);
}

export async function setPlantNetApiKey(key: string): Promise<void> {
  if (key.trim().length === 0) {
    await SecureStore.deleteItemAsync(PLANTNET_API_KEY);
    return;
  }
  await SecureStore.setItemAsync(PLANTNET_API_KEY, key.trim());
}
