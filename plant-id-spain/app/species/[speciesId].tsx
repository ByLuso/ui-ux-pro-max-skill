import { useCallback, useState } from "react";
import { FlatList, Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, Stack } from "expo-router";
import { colors, radius, spacing } from "@/constants/theme";
import { SPECIES } from "@/data/species";
import { REGIONS } from "@/data/regions";
import { getSightingsForSpecies, Sighting } from "@/lib/db";

const RARITY_LABEL: Record<string, string> = {
  común: "Común",
  "poco común": "Poco común",
  rara: "Rara",
  endémica: "Endémica",
};

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function SpeciesDetailScreen() {
  const { speciesId } = useLocalSearchParams<{ speciesId: string }>();
  const species = SPECIES.find((s) => s.id === speciesId);
  const [sightings, setSightings] = useState<Sighting[]>([]);

  useFocusEffect(
    useCallback(() => {
      if (speciesId) getSightingsForSpecies(speciesId).then(setSightings);
    }, [speciesId])
  );

  if (!species) {
    return (
      <View style={styles.notFound}>
        <Text style={styles.mutedText}>Especie no encontrada.</Text>
      </View>
    );
  }

  const regionNames = species.regions
    .map((id) => REGIONS.find((r) => r.id === id)?.name)
    .filter(Boolean)
    .join(", ");

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Stack.Screen options={{ title: species.commonName }} />

      {sightings[0] && <Image source={{ uri: sightings[0].photoUri }} style={styles.hero} />}

      <View style={styles.headerBlock}>
        <Text style={styles.commonName}>{species.commonName}</Text>
        <Text style={styles.scientificName}>{species.scientificName}</Text>
        <View style={styles.badgeRow}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{species.family}</Text>
          </View>
          <View style={[styles.badge, styles.badgeAccent]}>
            <Text style={[styles.badgeText, styles.badgeAccentText]}>
              {RARITY_LABEL[species.rarity]}
            </Text>
          </View>
        </View>
      </View>

      <Text style={styles.description}>{species.description}</Text>

      <Text style={styles.sectionTitle}>Dónde encontrarla</Text>
      <Text style={styles.mutedText}>{regionNames}</Text>

      <Text style={styles.sectionTitle}>Tus avistamientos ({sightings.length})</Text>
      {sightings.length === 0 ? (
        <Text style={styles.mutedText}>Aún no la has fotografiado.</Text>
      ) : (
        <FlatList
          data={sightings}
          keyExtractor={(s) => String(s.id)}
          scrollEnabled={false}
          renderItem={({ item }) => (
            <View style={styles.sightingRow}>
              <Image source={{ uri: item.photoUri }} style={styles.sightingThumb} />
              <View style={styles.flex}>
                <Text style={styles.sightingDate}>{formatDate(item.timestamp)}</Text>
                {(item.placeName || item.regionName) && (
                  <Text style={styles.mutedText}>📍 {item.placeName ?? item.regionName}</Text>
                )}
              </View>
            </View>
          )}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { padding: spacing.md, gap: spacing.sm, backgroundColor: colors.background },
  notFound: { flex: 1, alignItems: "center", justifyContent: "center" },
  hero: { width: "100%", aspectRatio: 4 / 3, borderRadius: radius.lg, backgroundColor: colors.border },
  headerBlock: { marginTop: spacing.sm },
  commonName: { fontSize: 24, fontWeight: "800", color: colors.text },
  scientificName: { fontStyle: "italic", color: colors.textMuted, fontSize: 15, marginTop: 2 },
  badgeRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
  },
  badgeAccent: { backgroundColor: "#EAF3DE" },
  badgeText: { fontSize: 12, fontWeight: "600", color: colors.text },
  badgeAccentText: { color: colors.primaryDark },
  description: { color: colors.text, fontSize: 15, lineHeight: 21, marginTop: spacing.sm },
  sectionTitle: { fontWeight: "700", fontSize: 16, color: colors.text, marginTop: spacing.md },
  mutedText: { color: colors.textMuted },
  sightingRow: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sightingThumb: { width: 48, height: 48, borderRadius: radius.sm, backgroundColor: colors.border },
  sightingDate: { fontWeight: "600", color: colors.text },
});
