import { useMemo, useState } from "react";
import { FlatList, Image, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { colors, radius, spacing } from "@/constants/theme";
import { SPECIES, Species, PlantProperty } from "@/data/species";
import { REGIONS } from "@/data/regions";

const PROPERTY_META: Record<PlantProperty, { emoji: string; label: string }> = {
  "aromática": { emoji: "🌿", label: "Aromática" },
  "medicinal": { emoji: "💊", label: "Medicinal" },
  "comestible": { emoji: "🍽️", label: "Comestible" },
  "tóxica": { emoji: "☠️", label: "Tóxica" },
  "melífera": { emoji: "🐝", label: "Melífera" },
  "tintórea": { emoji: "🎨", label: "Tintórea" },
  "ornamental": { emoji: "🌸", label: "Ornamental" },
  "antioxidante": { emoji: "✨", label: "Antioxidante" },
  "invasora": { emoji: "⚠️", label: "Invasora" },
};

const ALL_PROPERTIES = Object.keys(PROPERTY_META) as PlantProperty[];

function normalize(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export default function EncyclopediaScreen() {
  const [query, setQuery] = useState("");
  const [activeProperty, setActiveProperty] = useState<PlantProperty | null>(null);

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    return SPECIES.filter((s) => {
      if (activeProperty && !s.properties?.includes(activeProperty)) return false;
      if (!q) return true;
      return (
        normalize(s.commonName).includes(q) ||
        normalize(s.scientificName).includes(q) ||
        normalize(s.family).includes(q)
      );
    }).sort((a, b) => a.commonName.localeCompare(b.commonName, "es"));
  }, [query, activeProperty]);

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <TextInput
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          placeholder="Buscar por nombre, especie o familia..."
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={ALL_PROPERTIES}
          keyExtractor={(p) => p}
          contentContainerStyle={styles.filterRow}
          renderItem={({ item }) => {
            const meta = PROPERTY_META[item];
            const active = activeProperty === item;
            return (
              <Pressable
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => setActiveProperty(active ? null : item)}
              >
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                  {meta.emoji} {meta.label}
                </Text>
              </Pressable>
            );
          }}
        />
        <Text style={styles.countText}>
          {filtered.length} {filtered.length === 1 ? "especie" : "especies"}
        </Text>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(s) => s.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => <SpeciesRow species={item} />}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No se encontró ninguna especie con ese filtro.</Text>
        }
      />
    </View>
  );
}

function SpeciesRow({ species }: { species: Species }) {
  const regionNames = species.regions
    .slice(0, 2)
    .map((id) => REGIONS.find((r) => r.id === id)?.name)
    .filter(Boolean)
    .join(", ");
  const extraRegions = species.regions.length - 2;

  return (
    <Pressable style={styles.row} onPress={() => router.push(`/species/${species.id}`)}>
      {species.imageUrl ? (
        <Image source={{ uri: species.imageUrl }} style={styles.thumb} />
      ) : (
        <View style={[styles.thumb, styles.thumbPlaceholder]}>
          <Text style={styles.thumbPlaceholderEmoji}>🌱</Text>
        </View>
      )}
      <View style={styles.flex}>
        <Text style={styles.commonName}>{species.commonName}</Text>
        <Text style={styles.scientificName}>{species.scientificName}</Text>
        <Text style={styles.meta}>
          {species.family} · {regionNames}
          {extraRegions > 0 ? ` +${extraRegions}` : ""}
        </Text>
        {species.properties && species.properties.length > 0 && (
          <Text style={styles.propertyBadges}>
            {species.properties.map((p) => PROPERTY_META[p].emoji).join(" ")}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  search: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 15,
    color: colors.text,
  },
  filterRow: { gap: spacing.xs },
  filterChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterChipText: { fontSize: 12, fontWeight: "600", color: colors.text },
  filterChipTextActive: { color: "#fff" },
  countText: { color: colors.textMuted, fontSize: 12 },
  list: { padding: spacing.md, gap: spacing.sm },
  row: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  thumb: { width: 56, height: 56, borderRadius: radius.sm, backgroundColor: colors.border },
  thumbPlaceholder: { alignItems: "center", justifyContent: "center" },
  thumbPlaceholderEmoji: { fontSize: 22 },
  commonName: { fontWeight: "700", color: colors.text, fontSize: 15 },
  scientificName: { fontStyle: "italic", color: colors.textMuted, fontSize: 12, marginTop: 1 },
  meta: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
  propertyBadges: { fontSize: 14, marginTop: 4 },
  emptyText: { textAlign: "center", color: colors.textMuted, marginTop: spacing.lg },
});
