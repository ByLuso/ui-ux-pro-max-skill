import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { router } from "expo-router";
import { colors, radius, spacing } from "@/constants/theme";
import { identifyPlant, PlantNetError, PlantNetMatch, PlantOrgan } from "@/lib/plantnet";
import { getPlantNetApiKey } from "@/lib/settings";
import { getCurrentPlace, PlaceInfo } from "@/lib/location";
import { insertSighting, getUnlockedSpeciesIds } from "@/lib/db";
import { findSpeciesByScientificName } from "@/data/species";

type Stage = "camera" | "preview" | "identifying" | "results" | "saved";

const ORGANS: { key: PlantOrgan; label: string }[] = [
  { key: "auto", label: "Auto" },
  { key: "leaf", label: "Hoja" },
  { key: "flower", label: "Flor" },
  { key: "fruit", label: "Fruto" },
  { key: "bark", label: "Corteza" },
  { key: "habit", label: "Planta entera" },
];

export default function CameraScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const [stage, setStage] = useState<Stage>("camera");
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [organ, setOrgan] = useState<PlantOrgan>("auto");
  const [matches, setMatches] = useState<PlantNetMatch[]>([]);
  const [place, setPlace] = useState<PlaceInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unlockedNewSpecies, setUnlockedNewSpecies] = useState(false);

  async function takePhoto() {
    if (!cameraRef.current) return;
    const photo = await cameraRef.current.takePictureAsync({ quality: 0.85 });
    if (photo) {
      setPhotoUri(photo.uri);
      setStage("preview");
      getCurrentPlace().then(setPlace).catch(() => setPlace(null));
    }
  }

  function reset() {
    setStage("camera");
    setPhotoUri(null);
    setMatches([]);
    setError(null);
    setUnlockedNewSpecies(false);
  }

  async function runIdentification() {
    if (!photoUri) return;
    setError(null);
    setStage("identifying");
    try {
      const apiKey = await getPlantNetApiKey();
      if (!apiKey) {
        setError("Configura tu API key de PlantNet en Ajustes antes de identificar plantas.");
        setStage("preview");
        return;
      }
      const results = await identifyPlant(photoUri, apiKey, organ);
      setMatches(results.slice(0, 5));
      setStage("results");
    } catch (e) {
      const message = e instanceof PlantNetError ? e.message : "No se pudo identificar la planta. Revisa tu conexión.";
      setError(message);
      setStage("preview");
    }
  }

  async function saveSighting(match: PlantNetMatch | null) {
    if (!photoUri) return;
    const catalogSpecies = match ? findSpeciesByScientificName(match.scientificName) : null;

    const before = await getUnlockedSpeciesIds();
    await insertSighting({
      speciesId: catalogSpecies?.id ?? null,
      scientificName: match?.scientificName ?? "Sin identificar",
      commonName: catalogSpecies?.commonName ?? match?.commonNames?.[0] ?? null,
      confidence: match?.score ?? null,
      photoUri,
      latitude: place?.latitude ?? null,
      longitude: place?.longitude ?? null,
      regionId: place?.region?.id ?? null,
      regionName: place?.region?.name ?? null,
      placeName: place?.placeName ?? null,
      timestamp: Date.now(),
    });

    const isNewUnlock = !!catalogSpecies && !before.has(catalogSpecies.id);
    setUnlockedNewSpecies(isNewUnlock);
    setStage("saved");
  }

  if (!permission) {
    return <View style={styles.center} />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.permissionText}>
          FloraDex necesita acceso a la cámara para fotografiar plantas.
        </Text>
        <Pressable style={styles.primaryButton} onPress={requestPermission}>
          <Text style={styles.primaryButtonText}>Conceder permiso</Text>
        </Pressable>
      </View>
    );
  }

  if (stage === "camera") {
    return (
      <View style={styles.flex}>
        <CameraView ref={cameraRef} style={styles.flex} facing="back" />
        <View style={styles.captureBar}>
          <Pressable style={styles.captureButton} onPress={takePhoto}>
            <View style={styles.captureButtonInner} />
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {photoUri && <Image source={{ uri: photoUri }} style={styles.preview} />}

      {place && (
        <Text style={styles.placeText}>
          📍 {place.placeName ?? "Ubicación desconocida"}
          {place.region ? ` · ${place.region.name}` : ""}
        </Text>
      )}

      {error && <Text style={styles.errorText}>{error}</Text>}

      {stage === "preview" && (
        <>
          <Text style={styles.sectionLabel}>¿Qué parte de la planta se ve mejor?</Text>
          <View style={styles.organRow}>
            {ORGANS.map((o) => (
              <Pressable
                key={o.key}
                style={[styles.organChip, organ === o.key && styles.organChipActive]}
                onPress={() => setOrgan(o.key)}
              >
                <Text style={[styles.organChipText, organ === o.key && styles.organChipTextActive]}>
                  {o.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <Pressable style={styles.primaryButton} onPress={runIdentification}>
            <Text style={styles.primaryButtonText}>Identificar planta</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={reset}>
            <Text style={styles.secondaryButtonText}>Repetir foto</Text>
          </Pressable>
        </>
      )}

      {stage === "identifying" && (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.sectionLabel}>Identificando con PlantNet…</Text>
        </View>
      )}

      {stage === "results" && (
        <>
          <Text style={styles.sectionLabel}>Resultados más probables</Text>
          {matches.length === 0 && (
            <Text style={styles.mutedText}>No se encontraron coincidencias.</Text>
          )}
          {matches.map((m, i) => {
            const catalogSpecies = findSpeciesByScientificName(m.scientificName);
            return (
              <Pressable key={i} style={styles.matchCard} onPress={() => saveSighting(m)}>
                <View style={styles.flex}>
                  <Text style={styles.matchScientific}>{m.scientificName}</Text>
                  <Text style={styles.matchCommon}>
                    {catalogSpecies?.commonName ?? m.commonNames[0] ?? "Sin nombre común"}
                    {catalogSpecies ? " · en tu Pokédex" : " · fuera del Pokédex"}
                  </Text>
                </View>
                <Text style={styles.matchScore}>{Math.round(m.score * 100)}%</Text>
              </Pressable>
            );
          })}
          <Pressable style={styles.secondaryButton} onPress={() => saveSighting(null)}>
            <Text style={styles.secondaryButtonText}>Ninguna coincide, guardar sin identificar</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={reset}>
            <Text style={styles.secondaryButtonText}>Descartar</Text>
          </Pressable>
        </>
      )}

      {stage === "saved" && (
        <View style={styles.center}>
          {unlockedNewSpecies ? (
            <>
              <Text style={styles.celebrationEmoji}>🎉</Text>
              <Text style={styles.sectionLabel}>¡Nueva especie desbloqueada en tu Pokédex!</Text>
            </>
          ) : (
            <Text style={styles.sectionLabel}>Guardado en tu biblioteca.</Text>
          )}
          <Pressable style={styles.primaryButton} onPress={reset}>
            <Text style={styles.primaryButtonText}>Fotografiar otra planta</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={() => router.push("/library")}>
            <Text style={styles.secondaryButtonText}>Ver biblioteca</Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg, gap: spacing.md },
  container: { padding: spacing.md, gap: spacing.md, backgroundColor: colors.background, flexGrow: 1 },
  captureBar: {
    position: "absolute",
    bottom: spacing.xl,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  captureButton: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  captureButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#fff",
  },
  preview: { width: "100%", aspectRatio: 3 / 4, borderRadius: radius.md, backgroundColor: colors.border },
  placeText: { color: colors.textMuted, fontSize: 13 },
  sectionLabel: { fontSize: 16, fontWeight: "700", color: colors.text },
  mutedText: { color: colors.textMuted },
  errorText: { color: colors.danger, fontWeight: "600" },
  organRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  organChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  organChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  organChipText: { color: colors.text, fontWeight: "600" },
  organChipTextActive: { color: "#fff" },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  primaryButtonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  secondaryButton: { paddingVertical: spacing.sm, alignItems: "center" },
  secondaryButtonText: { color: colors.primary, fontWeight: "600" },
  permissionText: { textAlign: "center", color: colors.text, fontSize: 15 },
  matchCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  matchScientific: { fontStyle: "italic", fontWeight: "700", color: colors.text },
  matchCommon: { color: colors.textMuted, marginTop: 2 },
  matchScore: { fontWeight: "700", color: colors.primary },
  celebrationEmoji: { fontSize: 48 },
});
