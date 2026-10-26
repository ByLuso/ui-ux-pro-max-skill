import { useCallback, useState } from "react";
import { FlatList, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, router } from "expo-router";
import { colors, radius, spacing } from "@/constants/theme";
import { getAllSightings, Sighting } from "@/lib/db";

function formatDateTime(timestamp: number) {
  const date = new Date(timestamp);
  const day = date.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
  const time = date.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  return `${day} · ${time}`;
}

function SightingRow({ sighting }: { sighting: Sighting }) {
  const title = sighting.commonName ?? sighting.scientificName;
  return (
    <Pressable
      style={styles.row}
      onPress={() => {
        if (sighting.speciesId) router.push(`/species/${sighting.speciesId}`);
      }}
    >
      <Image source={{ uri: sighting.photoUri }} style={styles.thumb} />
      <View style={styles.flex}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.scientific}>{sighting.scientificName}</Text>
        <Text style={styles.meta}>{formatDateTime(sighting.timestamp)}</Text>
        {(sighting.placeName || sighting.regionName) && (
          <Text style={styles.meta}>
            📍 {sighting.placeName ?? sighting.regionName}
          </Text>
        )}
      </View>
      {!sighting.speciesId && (
        <View style={styles.unidentifiedBadge}>
          <Text style={styles.unidentifiedBadgeText}>?</Text>
        </View>
      )}
    </Pressable>
  );
}

export default function LibraryScreen() {
  const [sightings, setSightings] = useState<Sighting[]>([]);

  useFocusEffect(
    useCallback(() => {
      getAllSightings().then(setSightings);
    }, [])
  );

  if (sightings.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyEmoji}>🌱</Text>
        <Text style={styles.emptyText}>
          Aún no has guardado ninguna planta. Ve a la pestaña Cámara para empezar tu colección.
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={sightings}
      keyExtractor={(item) => String(item.id)}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => <SightingRow sighting={item} />}
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { padding: spacing.md, gap: spacing.sm, backgroundColor: colors.background },
  row: {
    flexDirection: "row",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  thumb: { width: 64, height: 64, borderRadius: radius.sm, backgroundColor: colors.border },
  title: { fontWeight: "700", color: colors.text, fontSize: 15 },
  scientific: { fontStyle: "italic", color: colors.textMuted, fontSize: 12 },
  meta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  unidentifiedBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.locked,
    alignItems: "center",
    justifyContent: "center",
  },
  unidentifiedBadgeText: { color: "#fff", fontWeight: "700" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg, gap: spacing.md, backgroundColor: colors.background },
  emptyEmoji: { fontSize: 48 },
  emptyText: { textAlign: "center", color: colors.textMuted, fontSize: 15 },
});
