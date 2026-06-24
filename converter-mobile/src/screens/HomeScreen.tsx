import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable,
  Alert, ActivityIndicator, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';

import { ConvertFile, ConvertFormat, AppSettings, DEFAULT_SETTINGS } from '../types';
import { loadSettings } from '../storage';
import { convertFile } from '../api';
import FileCard from '../components/FileCard';
import EmptyState from '../components/EmptyState';
import { colors, spacing, radius, fontSize, fontWeight, TOUCH_TARGET } from '../theme';
import { useFocusEffect } from '@react-navigation/native';

const FORMATS: ConvertFormat[] = ['mobi', 'azw3', 'epub'];

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

export default function HomeScreen() {
  const [files,      setFiles]     = useState<ConvertFile[]>([]);
  const [format,     setFormat]    = useState<ConvertFormat>('mobi');
  const [settings,   setSettings]  = useState<AppSettings>(DEFAULT_SETTINGS);
  const [converting, setConverting] = useState(false);
  const abortRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      loadSettings().then(s => {
        setSettings(s);
        setFormat(s.defaultFormat);
      });
    }, [])
  );

  // ── file management ──────────────────────────────────────────────────────

  async function pickFiles() {
    const result = await DocumentPicker.getDocumentAsync({
      type:     ['application/pdf', 'application/epub+zip'],
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;

    const existing = new Set(files.map(f => f.name));
    const newFiles: ConvertFile[] = result.assets
      .filter(a => !existing.has(a.name))
      .map(a => ({
        id:        makeId(),
        name:      a.name.replace(/\.[^.]+$/, ''),
        uri:       a.uri,
        size:      a.size ?? undefined,
        extension: (a.name.split('.').pop() ?? 'pdf').toLowerCase(),
        status:    'pending',
        progress:  0,
      }));

    if (newFiles.length === 0) {
      Alert.alert('Sin cambios', 'Todos los archivos ya están en la lista.');
      return;
    }
    setFiles(prev => [...prev, ...newFiles]);
  }

  function removeFile(id: string) {
    setFiles(prev => prev.filter(f => f.id !== id));
  }

  function clearAll() {
    Alert.alert('Limpiar lista', '¿Eliminar todos los archivos?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Limpiar',  style: 'destructive', onPress: () => setFiles([]) },
    ]);
  }

  function updateFile(id: string, patch: Partial<ConvertFile>) {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, ...patch } : f));
  }

  // ── conversion ───────────────────────────────────────────────────────────

  async function startConversion() {
    const pending = files.filter(f => f.status !== 'done');
    if (pending.length === 0) {
      Alert.alert('Sin archivos', 'Agrega al menos un archivo PDF o EPUB.');
      return;
    }
    if (!settings.serverUrl) {
      Alert.alert('Sin servidor', 'Configura la URL del servidor en Ajustes.');
      return;
    }

    setConverting(true);
    abortRef.current = false;

    // reset non-done files to pending
    setFiles(prev => prev.map(f =>
      f.status !== 'done' ? { ...f, status: 'pending', progress: 0, errorMessage: undefined } : f
    ));

    let doneCount  = 0;
    let errorCount = 0;

    for (const file of pending) {
      if (abortRef.current) break;

      updateFile(file.id, { status: 'uploading', progress: 0 });

      try {
        const outputUri = await convertFile(
          settings.serverUrl,
          file.uri,
          `${file.name}.${file.extension}`,
          format,
          (pct) => updateFile(file.id, { progress: pct }),
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
        ? `${doneCount} archivo(s) convertido(s) correctamente.`
        : `${doneCount} convertido(s), ${errorCount} con error.\nToca cada archivo rojo para ver el detalle.`;
      Alert.alert(errorCount === 0 ? 'Completado' : 'Terminado con errores', msg);
    }
  }

  // ── render ───────────────────────────────────────────────────────────────

  const pendingCount = files.filter(f => f.status !== 'done').length;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {/* header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="book" size={22} color={colors.accent} />
          <Text style={styles.headerTitle}>Kindle Converter</Text>
        </View>
        {files.length > 0 && !converting && (
          <Pressable
            onPress={clearAll}
            style={({ pressed }) => [styles.clearBtn, pressed && styles.pressed]}
            hitSlop={8}
            accessibilityLabel="Limpiar lista"
            accessibilityRole="button"
          >
            <Ionicons name="trash-outline" size={18} color={colors.dim} />
          </Pressable>
        )}
      </View>

      {/* format selector */}
      <View style={styles.formatRow}>
        <Text style={styles.formatLabel}>Formato:</Text>
        <View style={styles.segmented}>
          {FORMATS.map(f => (
            <Pressable
              key={f}
              onPress={() => !converting && setFormat(f)}
              style={[
                styles.segment,
                format === f && styles.segmentActive,
              ]}
              accessibilityRole="radio"
              accessibilityState={{ selected: format === f }}
              accessibilityLabel={`Formato ${f.toUpperCase()}`}
            >
              <Text style={[
                styles.segmentText,
                format === f && styles.segmentTextActive,
              ]}>
                {f.toUpperCase()}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* file list */}
      <FlatList
        data={files}
        keyExtractor={item => item.id}
        contentContainerStyle={files.length === 0 ? styles.listEmpty : styles.listContent}
        ListEmptyComponent={<EmptyState />}
        renderItem={({ item }) => (
          <FileCard
            file={item}
            onRemove={removeFile}
            disabled={converting}
          />
        )}
        showsVerticalScrollIndicator={false}
      />

      {/* bottom action bar */}
      <SafeAreaView edges={['bottom']} style={styles.bottomBar}>
        <Pressable
          onPress={pickFiles}
          disabled={converting}
          style={({ pressed }) => [
            styles.addBtn,
            pressed && styles.pressed,
            converting && styles.disabledBtn,
          ]}
          accessibilityLabel="Agregar archivos PDF o EPUB"
          accessibilityRole="button"
        >
          <Ionicons name="add" size={20} color={colors.text} />
          <Text style={styles.addBtnText}>Agregar</Text>
        </Pressable>

        <Pressable
          onPress={startConversion}
          disabled={converting || files.length === 0}
          style={({ pressed }) => [
            styles.convertBtn,
            pressed && styles.convertBtnPressed,
            (converting || files.length === 0) && styles.disabledConvertBtn,
          ]}
          accessibilityLabel={converting ? 'Convirtiendo archivos' : `Convertir ${pendingCount} archivo(s)`}
          accessibilityRole="button"
          accessibilityState={{ disabled: converting || files.length === 0 }}
        >
          {converting ? (
            <>
              <ActivityIndicator size="small" color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.convertBtnText}>Convirtiendo…</Text>
            </>
          ) : (
            <>
              <Ionicons name="flash" size={18} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.convertBtnText}>
                Convertir {pendingCount > 0 ? `(${pendingCount})` : ''}
              </Text>
            </>
          )}
        </Pressable>
      </SafeAreaView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical:   spacing.sm,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           8,
  },
  headerTitle: {
    fontSize:   fontSize.xl,
    fontWeight: fontWeight.bold,
    color:      colors.text,
  },
  clearBtn: {
    width:          TOUCH_TARGET,
    height:         TOUCH_TARGET,
    alignItems:     'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  formatRow: {
    flexDirection:  'row',
    alignItems:     'center',
    paddingHorizontal: spacing.md,
    paddingBottom:     spacing.sm,
    gap:            spacing.sm,
  },
  formatLabel: {
    fontSize:   fontSize.sm,
    color:      colors.subtext,
    fontWeight: fontWeight.medium,
  },
  segmented: {
    flexDirection:   'row',
    backgroundColor: colors.surface,
    borderRadius:    radius.md,
    padding:         3,
    borderWidth:     1,
    borderColor:     colors.border,
  },
  segment: {
    paddingHorizontal: spacing.md,
    paddingVertical:   6,
    borderRadius:      radius.sm,
    minWidth:          54,
    alignItems:        'center',
  },
  segmentActive: {
    backgroundColor: colors.accent,
  },
  segmentText: {
    fontSize:   fontSize.sm,
    fontWeight: fontWeight.semibold,
    color:      colors.dim,
  },
  segmentTextActive: {
    color: '#fff',
  },
  listContent: {
    paddingHorizontal: spacing.md,
    paddingBottom:     spacing.lg,
  },
  listEmpty: {
    flex: 1,
    paddingHorizontal: spacing.md,
  },
  bottomBar: {
    flexDirection:     'row',
    gap:               spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop:        spacing.sm,
    paddingBottom:     Platform.OS === 'android' ? spacing.sm : 0,
    borderTopWidth:    1,
    borderTopColor:    colors.border,
    backgroundColor:   colors.surface,
  },
  addBtn: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             6,
    paddingHorizontal: spacing.md,
    height:          TOUCH_TARGET + 4,
    borderRadius:    radius.md,
    backgroundColor: colors.card,
    borderWidth:     1,
    borderColor:     colors.border,
  },
  addBtnText: {
    fontSize:   fontSize.md,
    fontWeight: fontWeight.semibold,
    color:      colors.text,
  },
  disabledBtn: {
    opacity: 0.4,
  },
  convertBtn: {
    flex:            1,
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    height:          TOUCH_TARGET + 4,
    borderRadius:    radius.md,
    backgroundColor: colors.accent,
  },
  convertBtnPressed: {
    backgroundColor: colors.accent2,
  },
  disabledConvertBtn: {
    opacity: 0.5,
  },
  convertBtnText: {
    fontSize:   fontSize.md,
    fontWeight: fontWeight.bold,
    color:      '#fff',
  },
});
