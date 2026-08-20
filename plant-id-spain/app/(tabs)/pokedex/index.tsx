import { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, router } from "expo-router";
import { colors, radius, spacing } from "@/constants/theme";
import { REGIONS } from "@/data/regions";
import { speciesForRegion } from "@/data/species";
import { getUnlockedSpeciesIds } from "@/lib/db";

export default function PokedexRegionsScreen() {
  const [unlocked, setUnlocked] = useState<Set<string>>(new Set());

  useFocusEffect(
    useCallback(() => {
      getUnlockedSpeciesIds().then(setUnlocked);
    }, [])
  );

  const totalSpecies = REGIONS.reduce((sum, r) => sum + speciesForRegion(r.id).length, 0);
  const totalUnlocked = unlocked.size;

  return (
    <FlatList
      data={REGIONS}
      keyExtractor={(r) => r.id}
      contentContainerStyle={styles.list}
      ListHeaderComponent={
        <View style={styles.summary}>
          <Text style={styles.summaryTitle}>Flora de España</Text>
          <Text style={styles.summarySubtitle}>
            {totalUnlocked} / {totalSpecies} especies descubiertas
          </Text>
        </View>
      }
      renderItem={({ item: region }) => {
        const species = speciesForRegion(region.id);
        const unlockedCount = species.filter((s) => unlocked.has(s.id)).length;
        const progress = species.length > 0 ? unlockedCount / species.length : 0;
        return (
          <Pressable
            style={styles.regionCard}
            onPress={() => router.push(`/pokedex/${region.id}`)}
          >
            <Text style={styles.regionEmoji}>{region.emoji}</Text>
            <View style={styles.flex}>
              <Text style={styles.regionName}>{region.name}</Text>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
              </View>
              <Text style={styles.regionCount}>
                {unlockedCount} / {species.length}
              </Text>
            </View>
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { padding: spacing.md, gap: spacing.sm },
  summary: { marginBottom: spacing.md },
  summaryTitle: { fontSize: 22, fontWeight: "800", color: colors.text },
  summarySubtitle: { color: colors.textMuted, marginTop: 2 },
  regionCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  regionEmoji: { fontSize: 28 },
  regionName: { fontWeight: "700", color: colors.text, fontSize: 15 },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
    marginTop: spacing.xs,
    overflow: "hidden",
  },
  progressFill: { height: "100%", backgroundColor: colors.accent },
  regionCount: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
});
