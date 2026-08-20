import { Stack } from "expo-router";
import { colors } from "@/constants/theme";

export default function PokedexLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: "700" },
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ title: "Pokédex de Flora" }} />
      <Stack.Screen name="[regionId]" options={{ title: "Comunidad" }} />
    </Stack>
  );
}
