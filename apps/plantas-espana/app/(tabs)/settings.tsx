import { useEffect, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { colors, radius, spacing } from "@/constants/theme";
import { getPlantNetApiKey, setPlantNetApiKey } from "@/lib/settings";

export default function SettingsScreen() {
  const [apiKey, setApiKey] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getPlantNetApiKey().then((key) => setApiKey(key ?? ""));
  }, []);

  async function save() {
    await setPlantNetApiKey(apiKey);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.sectionTitle}>API key de PlantNet</Text>
      <Text style={styles.helpText}>
        FloraDex usa la API gratuita de PlantNet para identificar tus fotos. Consigue tu propia
        clave gratuita en my.plantnet.org y pégala aquí.
      </Text>

      <TextInput
        style={styles.input}
        value={apiKey}
        onChangeText={setApiKey}
        placeholder="Pega aquí tu API key"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
      />

      <Pressable style={styles.primaryButton} onPress={save}>
        <Text style={styles.primaryButtonText}>{saved ? "Guardado ✓" : "Guardar"}</Text>
      </Pressable>

      <Pressable onPress={() => Linking.openURL("https://my.plantnet.org/")}>
        <Text style={styles.link}>Obtener API key gratuita en my.plantnet.org →</Text>
      </Pressable>

      <View style={styles.divider} />

      <Text style={styles.sectionTitle}>Acerca de FloraDex</Text>
      <Text style={styles.helpText}>
        Fotografía plantas, guárdalas en tu biblioteca con fecha, hora y ubicación, y ve
        desbloqueando la flora de las comunidades autónomas de España en tu Pokédex personal.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.md, gap: spacing.sm, backgroundColor: colors.background },
  sectionTitle: { fontWeight: "700", fontSize: 17, color: colors.text, marginTop: spacing.sm },
  helpText: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    fontSize: 15,
    color: colors.text,
    marginTop: spacing.sm,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  primaryButtonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  link: { color: colors.primary, fontWeight: "600", marginTop: spacing.sm },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.lg },
});
