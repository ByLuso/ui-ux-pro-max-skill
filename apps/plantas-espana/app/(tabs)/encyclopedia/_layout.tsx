import { Stack } from "expo-router";
import { colors } from "@/constants/theme";

export default function EncyclopediaLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: "700" },
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ title: "Enciclopedia" }} />
    </Stack>
  );
}
