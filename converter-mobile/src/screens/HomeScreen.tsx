import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable,
  Alert, ActivityIndicator, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useFocusEffect } from '@react-navigation/native';

import {
  ConvertFile, ConvertFormat, AppSettings, DEFAULT_SETTINGS, FORMAT_LABELS,
} from '../types';
import { loadSettings } from '../storage';
import { convertFile } from '../api';
import FileCard from '../components/FileCard';
import EmptyState from '../components/EmptyState';
import { colors, spacing, radius, fontSize, fontWeight, TOUCH_TARGET } from '../theme';

const FORMATS: { value: ConvertFormat; label: string; tag?: string }[] = [
  { value: 'kfx',  label: 'KFX',  tag: 'Recomendado' },
  { value: 'azw3', label: 'AZW3' },
  { value: 'mobi', label: 'MOBI' },
  { value: 'epub', label: 'EPUB' },
];

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

export default function HomeScreen() {
  const [files,       setFiles]      = useState<ConvertFile[]>([]);
  const [format,      setFormat]     = useState<ConvertFormat>('kfx');
  const [settings,    setSettings]   = useState<AppSettings>(DEFAULT_SETTINGS);
  const [converting,  setConverting] = useState(false);
  const abortRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      loadSettings().then(s => {
        setSettings(s);
        setFormat(s.defaultFormat);
      });
    }, [])
  );

  // ── Gestión de archivos ──────────────────────────────────────────────────

  async function pickFiles() {
    // Acepta cualquier archivo (el servidor valida el tipo)
    const result = await DocumentPicker.getDocumentAsync({
      type:     ['*/*'],
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;

    const existing = new Set(files.map(f => f.name + f.extension));
    const added: ConvertFile[] = [];

    for (const asset of result.assets) {
      const ext  = ('.' + (asset.name.split('.').pop() ?? '')).toLowerCase();
      const name = asset.name.replace(/\.[^.]+$/, '');
      const key  = name + ext;
      if (existing.has(key)) continue;
      added.push({
        id: makeId(), name, uri: asset.uri,
        size: asset.size ?? undefined,
        extension: ext.replace('.', ''),
        status: 'pending', progress: 0,
      });
      existing.add(key);
    }

    if (added.length === 0) {
      Alert.alert('Sin cambios', 'Todos los archivos ya están en la lista.');
      return;
    }
    setFiles(prev => [...prev, ...added]);
  }

  function removeFile(id: string) {
    setFiles(prev => prev.filter(f => f.id !== id));
  }

  function clearAll() {
    Alert.alert('Limpiar lista', '¿Eliminar todos los archivos?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Limpiar', style: 'destructive', onPress: () => setFiles([]) },
    ]);
  }

  function updateFile(id: string, patch: Partial<ConvertFile>) {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, ...patch } : f));
  }

  // ── Conversión ───────────────────────────────────────────────────────────

  async function startConversion() {
    const pending = files.filter(f => f.status !== 'done');
    if (pending.length === 0) {
      Alert.alert('Sin archivos', 'Agrega al menos un libro para convertir.');
      return;
    }
    if (!settings.serverUrl) {
      Alert.alert('Sin servidor', 'Configura la URL del servidor en Ajustes.');
      return;
    }

    setConverting(true);
    abortRef.current = false;

    setFiles(prev => prev.map(f =>
      f.status !== 'done'
        ? { ...f, status: 'pending', progress: 0, errorMessage: undefined }
        : f
    ));

    let doneCount = 0, errorCount = 0;

    for (const file of pending) {
      if (abortRef.current) break;
      updateFile(file.id, { status: 'uploading', progress: 0 });

      try {
        const outputUri  = await convertFile(
          settings.serverUrl,
          file.uri,
          `${file.name}.${file.extension}`,
          format,
          pct => updateFile(file.id, { progress: pct }),
        );
        const outputName = `${file.name}.${format}`;
        updateFile(file.id, { status: 'done', progress: 1, outputUri, outputName });
        doneCount++;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Error desconocido';
        updateFile(file.id, { status: 'error', progress: 0, errorMessage: msg });
        errorCount++;
      }
    }

    setConverting(false);

    if (!abortRef.current) {
      const msg = errorCount === 0
        ? `${doneCount} libro(s) convertido(s) a ${format.toUpperCase()}.`
        : `${doneCount} OK · ${errorCount} con error.\nToca el libro rojo para ver el detalle.`;
      Alert.alert(errorCount === 0 ? 'Completado' : 'Terminado con errores', msg);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  const pendingCount = files.filter(f => f.status !== 'done').length;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {/* header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="flash" size={22} color={colors.accent} />
          <View>
            <Text style={styles.headerTitle}>KFX Converter</Text>
            <Text style={styles.headerSub}>Convierte cualquier libro a Kindle</Text>
          </View>
        </View>
        {files.length > 0 && !converting && (
          <Pressable
            onPress={clearAll}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
            hitSlop={8}
            accessibilityLabel="Limpiar lista" accessibilityRole="button"
          >
            <Ionicons name="trash-outline" size={18} color={colors.dim} />
          </Pressable>
        )}
      </View>

      {/* formato de salida */}
      <View style={styles.formatSection}>
        <Text style={styles.formatSectionLabel}>Formato de salida</Text>
        <View style={styles.segmented}>
          {FORMATS.map(f => (
            <Pressable
              key={f.value}
              onPress={() => !converting && setFormat(f.value)}
              style={[styles.segment, format === f.value && styles.segmentActive]}
              accessibilityRole="radio"
              accessibilityState={{ selected: format === f.value }}
              accessibilityLabel={`${f.label}${f.tag ? ` — ${f.tag}` : ''}`}
            >
              <Text style={[styles.segmentText, format === f.value && styles.segmentTextActive]}>
                {f.label}
              </Text>
              {f.tag && format !== f.value && (
                <View style={styles.tagPill}>
                  <Text style={styles.tagText}>{f.tag}</Text>
                </View>
              )}
            </Pressable>
          ))}
        </View>
        {format === 'kfx' && (
          <Text style={styles.formatHint}>
            KFX es el formato más moderno de Kindle (requiere Plugin KFX o Kindle Previewer 3 en tu PC)
          </Text>
        )}
      </View>

      {/* lista de archivos */}
      <FlatList
        data={files}
        keyExtractor={item => item.id}
        contentContainerStyle={files.length === 0 ? styles.listEmpty : styles.listContent}
        ListEmptyComponent={
          <EmptyState message={'Agrega libros en cualquier formato:\nEPUB · MOBI · PDF · AZW3 · DOC · FB2…'} />
        }
        renderItem={({ item }) => (
          <FileCard file={item} onRemove={removeFile} disabled={converting} />
        )}
        showsVerticalScrollIndicator={false}
      />

      {/* barra inferior */}
      <SafeAreaView edges={['bottom']} style={styles.bottomBar}>
        <Pressable
          onPress={pickFiles}
          disabled={converting}
          style={({ pressed }) => [
            styles.addBtn,
            pressed && styles.pressed,
            converting && styles.btnDisabled,
          ]}
          accessibilityLabel="Agregar libros" accessibilityRole="button"
        >
          <Ionicons name="add" size={20} color={colors.text} />
          <Text style={styles.addBtnText}>Agregar</Text>
        </Pressable>

        <Pressable
          onPress={startConversion}
          disabled={converting || files.length === 0}
          style={({ pressed }) => [
            styles.convertBtn,
            pressed && { backgroundColor: colors.accent2 },
            (converting || files.length === 0) && styles.convertBtnDisabled,
          ]}
          accessibilityRole="button"
          accessibilityState={{ disabled: converting || files.length === 0 }}
          accessibilityLabel={
            converting
              ? 'Convirtiendo archivos'
              : `Convertir a ${format.toUpperCase()}`
          }
        >
          {converting ? (
            <>
              <ActivityIndicator size="small" color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.convertBtnText}>Convirtiendo…</Text>
            </>
          ) : (
            <>
              <Ionicons name="flash" size={17} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.convertBtnText}>
                Convertir a {format.toUpperCase()}
                {pendingCount > 0 ? `  (${pendingCount})` : ''}
              </Text>
            </>
          )}
        </Pressable>
      </SafeAreaView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerTitle: {
    fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.text,
  },
  headerSub: {
    fontSize: fontSize.xs, color: colors.dim, marginTop: 1,
  },
  iconBtn: {
    width: TOUCH_TARGET, height: TOUCH_TARGET,
    alignItems: 'center', justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },
  formatSection: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  formatSectionLabel: {
    fontSize: fontSize.xs, fontWeight: fontWeight.medium,
    color: colors.dim, marginBottom: spacing.xs,
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 3,
    borderWidth: 1, borderColor: colors.border,
    gap: 2,
  },
  segment: {
    flex: 1, paddingVertical: 8,
    borderRadius: radius.sm,
    alignItems: 'center', justifyContent: 'center',
    flexDirection: 'column', gap: 2,
    minHeight: TOUCH_TARGET - 8,
  },
  segmentActive: { backgroundColor: colors.accent },
  segmentText: {
    fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.dim,
  },
  segmentTextActive: { color: '#fff' },
  tagPill: {
    backgroundColor: `${colors.accent}30`,
    paddingHorizontal: 4, paddingVertical: 1,
    borderRadius: radius.full,
  },
  tagText: { fontSize: 9, color: colors.accent, fontWeight: fontWeight.bold },
  formatHint: {
    fontSize: fontSize.xs, color: colors.dim,
    marginTop: spacing.xs, lineHeight: 16,
  },
  listContent: {
    paddingHorizontal: spacing.md, paddingBottom: spacing.lg,
  },
  listEmpty: {
    flex: 1, paddingHorizontal: spacing.md,
  },
  bottomBar: {
    flexDirection: 'row', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingTop: spacing.sm,
    paddingBottom: Platform.OS === 'android' ? spacing.sm : 0,
    borderTopWidth: 1, borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: spacing.md,
    height: TOUCH_TARGET + 4,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.border,
  },
  addBtnText: {
    fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.text,
  },
  btnDisabled: { opacity: 0.4 },
  convertBtn: {
    flex: 1, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center',
    height: TOUCH_TARGET + 4,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
  },
  convertBtnDisabled: { opacity: 0.5 },
  convertBtnText: {
    fontSize: fontSize.md, fontWeight: fontWeight.bold, color: '#fff',
  },
});
