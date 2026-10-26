import { useCallback, useState } from "react";
import { FlatList, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, router, Stack } from "expo-router";
import { colors, radius, spacing } from "@/constants/theme";
import { REGIONS } from "@/data/regions";
import { Species, speciesForRegion } from "@/data/species";
import { getAllSightings, Sighting } from "@/lib/db";

export default function RegionPokedexScreen() {
  const { regionId } = useLocalSearchParams<{ regionId: string }>();
  const region = REGIONS.find((r) => r.id === regionId);
  const species = region ? speciesForRegion(region.id) : [];

  const [sightings, setSightings] = useState<Sighting[]>([]);

  useFocusEffect(
    useCallback(() => {
      getAllSightings().then(setSightings);
    }, [])
  );

  const photoBySpecies = new Map<string, string>();
  for (const s of sightings) {
    if (s.speciesId && !photoBySpecies.has(s.speciesId)) {
      photoBySpecies.set(s.speciesId, s.photoUri);
    }
  }

  if (!region) return null;

  return (
    <>
      <Stack.Screen options={{ title: region.name }} />
      <FlatList
        data={species}
        keyExtractor={(s) => s.id}
        numColumns={2}
        contentContainerStyle={styles.list}
        columnWrapperStyle={styles.row}
        renderItem={({ item }) => (
          <SpeciesCard
            species={item}
            unlocked={photoBySpecies.has(item.id)}
            photoUri={photoBySpecies.get(item.id)}
          />
        )}
      />
    </>
  );
}

function SpeciesCard({
  species,
  unlocked,
  photoUri,
}: {
  species: Species;
  unlocked: boolean;
  photoUri?: string;
}) {
  return (
    <Pressable
      style={[styles.card, !unlocked && styles.cardLocked]}
      disabled={!unlocked}
      onPress={() => router.push(`/species/${species.id}`)}
    >
      {unlocked && photoUri ? (
        <Image source={{ uri: photoUri }} style={styles.cardImage} />
      ) : (
        <View style={styles.cardSilhouette}>
          <Text style={styles.cardSilhouetteEmoji}>🔒</Text>
        </View>
      )}
      <Text style={[styles.cardName, !unlocked && styles.cardNameLocked]} numberOfLines={1}>
        {unlocked ? species.commonName : "???"}
      </Text>
      {unlocked && (
        <Text style={styles.cardScientific} numberOfLines={1}>
          {species.scientificName}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.md, gap: spacing.sm },
  row: { gap: spacing.sm },
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  cardLocked: { backgroundColor: "#EEF0E8" },
  cardImage: { width: "100%", aspectRatio: 1, borderRadius: radius.sm, backgroundColor: colors.border },
  cardSilhouette: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: radius.sm,
    backgroundColor: colors.locked,
    alignItems: "center",
    justifyContent: "center",
  },
  cardSilhouetteEmoji: { fontSize: 24, opacity: 0.6 },
  cardName: { fontWeight: "700", color: colors.text, marginTop: spacing.xs, fontSize: 13 },
  cardNameLocked: { color: colors.textMuted },
  cardScientific: { fontStyle: "italic", color: colors.textMuted, fontSize: 11 },
});
