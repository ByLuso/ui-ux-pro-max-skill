import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TextInput, Pressable,
  ScrollView, ActivityIndicator, Alert,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';

import { AppSettings, ConvertFormat, DEFAULT_SETTINGS } from '../types';
import { loadSettings, saveSettings } from '../storage';
import { checkHealth, HealthResponse } from '../api';
import { colors, spacing, radius, fontSize, fontWeight, TOUCH_TARGET } from '../theme';

const FORMAT_OPTIONS: { value: ConvertFormat; label: string; desc: string; needsExtra?: string }[] = [
  { value: 'kfx',  label: 'KFX',  desc: 'Kindle Format X — más moderno y eficiente', needsExtra: 'Requiere Plugin KFX Output o Kindle Previewer 3' },
  { value: 'azw3', label: 'AZW3', desc: 'Kindle Fire, Paperwhite y modelos nuevos' },
  { value: 'mobi', label: 'MOBI', desc: 'Compatible con todos los Kindle' },
  { value: 'epub', label: 'EPUB', desc: 'Estándar universal (no nativo en Kindle)' },
];

type PingState = 'idle' | 'loading' | 'ok' | 'warn' | 'error';

export default function SettingsScreen() {
  const [settings,  setSettings]  = useState<AppSettings>(DEFAULT_SETTINGS);
  const [serverUrl, setServerUrl] = useState(DEFAULT_SETTINGS.serverUrl);
  const [pingState, setPingState] = useState<PingState>('idle');
  const [pingMsg,   setPingMsg]   = useState('');
  const [health,    setHealth]    = useState<HealthResponse | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadSettings().then(s => {
        setSettings(s);
        setServerUrl(s.serverUrl);
      });
    }, [])
  );

  async function handleSaveUrl() {
    const cleaned = serverUrl.trim().replace(/\/$/, '');
    await saveSettings({ serverUrl: cleaned });
    setSettings(prev => ({ ...prev, serverUrl: cleaned }));
    Alert.alert('Guardado', 'URL del servidor actualizada.');
  }

  async function handlePing() {
    const url = serverUrl.trim().replace(/\/$/, '');
    if (!url) return;
    setPingState('loading');
    setPingMsg('');
    setHealth(null);
    try {
      const h = await checkHealth(url);
      setHealth(h);
      if (h.can_make_kfx) {
        setPingState('ok');
        setPingMsg('Conectado · KFX disponible');
      } else if (h.calibre) {
        setPingState('warn');
        setPingMsg('Conectado · Solo AZW3/MOBI (falta Plugin KFX o Kindle Previewer 3)');
      } else {
        setPingState('error');
        setPingMsg('Calibre no encontrado en el servidor');
      }
    } catch {
      setPingState('error');
      setPingMsg('No se pudo conectar. Verifica la IP y que el servidor esté corriendo.');
    }
  }

  async function handleFormatChange(f: ConvertFormat) {
    await saveSettings({ defaultFormat: f });
    setSettings(prev => ({ ...prev, defaultFormat: f }));
  }

  const pingColor = {
    idle: colors.dim, loading: colors.dim,
    ok: colors.success, warn: colors.warning, error: colors.error,
  }[pingState];

  const pingIcon = {
    idle: 'wifi-outline', loading: 'wifi-outline',
    ok: 'checkmark-circle', warn: 'warning', error: 'close-circle',
  }[pingState] as 'wifi-outline';

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.pageTitle}>Ajustes</Text>

          {/* ── Servidor ─────────────────────────────────────────── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Servidor en tu PC</Text>
            <Text style={styles.sectionDesc}>
              Tu PC convierte los libros usando Calibre. El móvil le envía los archivos via Wi-Fi.
              Ambos deben estar en la misma red.
            </Text>

            <Text style={styles.fieldLabel}>URL del servidor</Text>
            <View style={styles.inputWrap}>
              <TextInput
                value={serverUrl}
                onChangeText={setServerUrl}
                style={styles.input}
                placeholder="http://192.168.1.100:8000"
                placeholderTextColor={colors.dim}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                returnKeyType="done"
                onSubmitEditing={handleSaveUrl}
                accessibilityLabel="URL del servidor"
              />
            </View>

            <View style={styles.btnRow}>
              <Pressable
                onPress={handlePing}
                disabled={pingState === 'loading'}
                style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
                accessibilityLabel="Probar conexión" accessibilityRole="button"
              >
                {pingState === 'loading'
                  ? <ActivityIndicator size="small" color={colors.accent} />
                  : <Ionicons name="wifi-outline" size={16} color={colors.accent} />
                }
                <Text style={styles.secondaryBtnText}>Probar conexión</Text>
              </Pressable>

              <Pressable
                onPress={handleSaveUrl}
                style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
                accessibilityLabel="Guardar URL" accessibilityRole="button"
              >
                <Text style={styles.primaryBtnText}>Guardar</Text>
              </Pressable>
            </View>

            {pingMsg !== '' && (
              <View style={[styles.pingResult, { backgroundColor: `${pingColor}18` }]}>
                <Ionicons name={pingIcon} size={14} color={pingColor} />
                <Text style={[styles.pingResultText, { color: pingColor }]}>{pingMsg}</Text>
              </View>
            )}

            {/* Status de herramientas */}
            {health && (
              <View style={styles.toolsGrid}>
                {[
                  { label: 'Calibre',           ok: health.calibre },
                  { label: 'Plugin KFX Output', ok: health.kfx_plugin },
                  { label: 'Kindle Previewer 3',ok: health.kindle_previewer },
                ].map(t => (
                  <View key={t.label} style={styles.toolRow}>
                    <Ionicons
                      name={t.ok ? 'checkmark-circle' : 'close-circle'}
                      size={14}
                      color={t.ok ? colors.success : colors.error}
                    />
                    <Text style={[styles.toolLabel, !t.ok && { color: colors.dim }]}>
                      {t.label}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* ── Formato predeterminado ──────────────────────────── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Formato predeterminado</Text>
            {FORMAT_OPTIONS.map(opt => (
              <Pressable
                key={opt.value}
                onPress={() => handleFormatChange(opt.value)}
                style={({ pressed }) => [
                  styles.formatRow,
                  settings.defaultFormat === opt.value && styles.formatRowActive,
                  pressed && styles.pressed,
                ]}
                accessibilityRole="radio"
                accessibilityState={{ selected: settings.defaultFormat === opt.value }}
              >
                <View style={styles.formatInfo}>
                  <View style={styles.formatLabelRow}>
                    <Text style={styles.formatLabel}>{opt.label}</Text>
                    {opt.value === 'kfx' && (
                      <View style={styles.recBadge}>
                        <Text style={styles.recBadgeText}>Recomendado</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.formatDesc}>{opt.desc}</Text>
                  {opt.needsExtra && (
                    <Text style={styles.formatExtra}>{opt.needsExtra}</Text>
                  )}
                </View>
                {settings.defaultFormat === opt.value && (
                  <Ionicons name="checkmark-circle" size={20} color={colors.accent} />
                )}
              </Pressable>
            ))}
          </View>

          {/* ── Guía de inicio ──────────────────────────────────── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Cómo iniciar el servidor</Text>
            {[
              { n: '1', t: 'Instala Calibre en tu PC → calibre-ebook.com' },
              { n: '2', t: 'Para KFX: en Calibre ve a Preferencias → Complementos → busca "KFX Output" e instala' },
              { n: '3', t: 'En la carpeta converter-api/ del proyecto, ejecuta run.bat (Windows) o ./run.sh (Mac/Linux)' },
              { n: '4', t: 'El script te muestra tu IP local, ej: http://192.168.1.105:8000' },
              { n: '5', t: 'Ingresa esa URL arriba y toca "Probar conexión"' },
            ].map(s => (
              <View key={s.n} style={styles.stepRow}>
                <View style={styles.stepBadge}>
                  <Text style={styles.stepNum}>{s.n}</Text>
                </View>
                <Text style={styles.stepText}>{s.t}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.version}>Kindle KFX Converter v2.0.0</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.md, paddingBottom: spacing.xxl },
  pageTitle: {
    fontSize: fontSize.xxl, fontWeight: fontWeight.bold,
    color: colors.text, marginBottom: spacing.lg,
  },
  section: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, marginBottom: spacing.md,
    borderWidth: 1, borderColor: colors.border,
  },
  sectionTitle: {
    fontSize: fontSize.md, fontWeight: fontWeight.semibold,
    color: colors.text, marginBottom: spacing.xs,
  },
  sectionDesc: {
    fontSize: fontSize.sm, color: colors.subtext,
    lineHeight: 20, marginBottom: spacing.md,
  },
  fieldLabel: {
    fontSize: fontSize.sm, fontWeight: fontWeight.medium,
    color: colors.subtext, marginBottom: spacing.xs,
  },
  inputWrap: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    backgroundColor: colors.card, marginBottom: spacing.sm,
  },
  input: {
    height: TOUCH_TARGET + 4, paddingHorizontal: spacing.md,
    fontSize: fontSize.md, color: colors.text,
  },
  btnRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xs },
  secondaryBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, height: TOUCH_TARGET,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.accent,
  },
  secondaryBtnText: {
    fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.accent,
  },
  primaryBtn: {
    paddingHorizontal: spacing.lg, height: TOUCH_TARGET,
    borderRadius: radius.md, backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  primaryBtnText: {
    fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: '#fff',
  },
  pressed: { opacity: 0.75 },
  pingResult: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    padding: spacing.sm, borderRadius: radius.sm, marginTop: spacing.xs,
  },
  pingResultText: { fontSize: fontSize.sm, flex: 1 },
  toolsGrid: {
    marginTop: spacing.sm, gap: 6,
    padding: spacing.sm,
    backgroundColor: colors.card, borderRadius: radius.sm,
  },
  toolRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  toolLabel: { fontSize: fontSize.sm, color: colors.text },
  formatRow: {
    flexDirection: 'row', alignItems: 'center',
    padding: spacing.md, borderRadius: radius.md,
    marginBottom: spacing.xs,
    backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.border,
  },
  formatRowActive: {
    borderColor: colors.accent,
    backgroundColor: `${colors.accent}12`,
  },
  formatInfo: { flex: 1 },
  formatLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  formatLabel: {
    fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.text,
  },
  recBadge: {
    backgroundColor: `${colors.accent}30`, paddingHorizontal: 6,
    paddingVertical: 2, borderRadius: radius.full,
  },
  recBadgeText: { fontSize: 10, color: colors.accent, fontWeight: fontWeight.bold },
  formatDesc: { fontSize: fontSize.sm, color: colors.subtext, marginTop: 2 },
  formatExtra: { fontSize: fontSize.xs, color: colors.dim, marginTop: 2 },
  stepRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    gap: spacing.sm, marginBottom: spacing.sm,
  },
  stepBadge: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  stepNum: { fontSize: 11, fontWeight: fontWeight.bold, color: '#fff' },
  stepText: { flex: 1, fontSize: fontSize.sm, color: colors.subtext, lineHeight: 20 },
  version: {
    textAlign: 'center', fontSize: fontSize.xs,
    color: colors.dim, marginTop: spacing.sm,
  },
});
