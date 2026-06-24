import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TextInput, Pressable,
  ScrollView, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';

import { AppSettings, ConvertFormat, DEFAULT_SETTINGS } from '../types';
import { loadSettings, saveSettings } from '../storage';
import { checkHealth } from '../api';
import { colors, spacing, radius, fontSize, fontWeight, TOUCH_TARGET } from '../theme';

const FORMAT_OPTIONS: { value: ConvertFormat; label: string; desc: string }[] = [
  { value: 'mobi', label: 'MOBI',  desc: 'Kindle clásico (KF7)' },
  { value: 'azw3', label: 'AZW3',  desc: 'Kindle moderno (KF8)' },
  { value: 'epub', label: 'EPUB',  desc: 'Estándar universal' },
];

type PingState = 'idle' | 'loading' | 'ok' | 'error';

export default function SettingsScreen() {
  const [settings,   setSettings]   = useState<AppSettings>(DEFAULT_SETTINGS);
  const [serverUrl,  setServerUrl]  = useState(DEFAULT_SETTINGS.serverUrl);
  const [pingState,  setPingState]  = useState<PingState>('idle');
  const [pingMsg,    setPingMsg]    = useState('');

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
    const updated = { ...settings, serverUrl: cleaned };
    await saveSettings({ serverUrl: cleaned });
    setSettings(updated);
    setServerUrl(cleaned);
    Alert.alert('Guardado', 'URL del servidor actualizada.');
  }

  async function handlePing() {
    const url = serverUrl.trim().replace(/\/$/, '');
    if (!url) return;
    setPingState('loading');
    setPingMsg('');
    try {
      const health = await checkHealth(url);
      if (health.calibre) {
        setPingState('ok');
        setPingMsg('Servidor conectado · Calibre disponible');
      } else {
        setPingState('error');
        setPingMsg('Servidor encontrado pero Calibre no está instalado en el PC');
      }
    } catch {
      setPingState('error');
      setPingMsg('No se pudo conectar. Verifica la IP y el puerto.');
    }
  }

  async function handleFormatChange(f: ConvertFormat) {
    const updated = { ...settings, defaultFormat: f };
    await saveSettings({ defaultFormat: f });
    setSettings(updated);
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.pageTitle}>Ajustes</Text>

          {/* ── Server section ─────────────────────────────────────── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Servidor de conversión</Text>
            <Text style={styles.sectionDesc}>
              La app envía tus archivos al servidor en tu PC, donde Calibre hace la conversión.
              Ambos dispositivos deben estar en la misma red Wi-Fi.
            </Text>

            <Text style={styles.fieldLabel}>URL del servidor</Text>
            <View style={styles.inputRow}>
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
                style={({ pressed }) => [styles.pingBtn, pressed && styles.btnPressed]}
                accessibilityLabel="Probar conexión"
                accessibilityRole="button"
              >
                {pingState === 'loading'
                  ? <ActivityIndicator size="small" color={colors.accent} />
                  : <Ionicons name="wifi-outline" size={16} color={colors.accent} />
                }
                <Text style={styles.pingBtnText}>Probar conexión</Text>
              </Pressable>

              <Pressable
                onPress={handleSaveUrl}
                style={({ pressed }) => [styles.saveBtn, pressed && styles.btnPressed]}
                accessibilityLabel="Guardar URL"
                accessibilityRole="button"
              >
                <Text style={styles.saveBtnText}>Guardar</Text>
              </Pressable>
            </View>

            {pingMsg !== '' && (
              <View style={[
                styles.pingResult,
                pingState === 'ok' ? styles.pingOk : styles.pingError,
              ]}>
                <Ionicons
                  name={pingState === 'ok' ? 'checkmark-circle' : 'close-circle'}
                  size={14}
                  color={pingState === 'ok' ? colors.success : colors.error}
                />
                <Text style={[
                  styles.pingResultText,
                  { color: pingState === 'ok' ? colors.success : colors.error },
                ]}>
                  {pingMsg}
                </Text>
              </View>
            )}
          </View>

          {/* ── Format section ──────────────────────────────────────── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Formato predeterminado</Text>
            {FORMAT_OPTIONS.map(opt => (
              <Pressable
                key={opt.value}
                onPress={() => handleFormatChange(opt.value)}
                style={({ pressed }) => [
                  styles.formatRow,
                  settings.defaultFormat === opt.value && styles.formatRowActive,
                  pressed && styles.btnPressed,
                ]}
                accessibilityRole="radio"
                accessibilityState={{ selected: settings.defaultFormat === opt.value }}
                accessibilityLabel={`${opt.label} — ${opt.desc}`}
              >
                <View style={styles.formatInfo}>
                  <Text style={styles.formatLabel}>{opt.label}</Text>
                  <Text style={styles.formatDesc}>{opt.desc}</Text>
                </View>
                {settings.defaultFormat === opt.value && (
                  <Ionicons name="checkmark-circle" size={20} color={colors.accent} />
                )}
              </Pressable>
            ))}
          </View>

          {/* ── How-to section ──────────────────────────────────────── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Cómo iniciar el servidor</Text>
            {[
              { step: '1', text: 'Instala Calibre en tu PC (calibre-ebook.com)' },
              { step: '2', text: 'Abre CMD en la carpeta converter-api/' },
              { step: '3', text: 'Ejecuta  run.bat  (Windows) o  ./run.sh  (Mac/Linux)' },
              { step: '4', text: 'Ingresa la IP de tu PC arriba, p.ej. http://192.168.1.x:8000' },
              { step: '5', text: 'Toca "Probar conexión" para verificar' },
            ].map(item => (
              <View key={item.step} style={styles.stepRow}>
                <View style={styles.stepBadge}>
                  <Text style={styles.stepNum}>{item.step}</Text>
                </View>
                <Text style={styles.stepText}>{item.text}</Text>
              </View>
            ))}
          </View>

          {/* ── Version ─────────────────────────────────────────────── */}
          <Text style={styles.version}>Kindle Converter v1.0.0</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scroll: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  pageTitle: {
    fontSize:   fontSize.xxl,
    fontWeight: fontWeight.bold,
    color:      colors.text,
    marginBottom: spacing.lg,
  },
  section: {
    backgroundColor: colors.surface,
    borderRadius:    radius.lg,
    padding:         spacing.md,
    marginBottom:    spacing.md,
    borderWidth:     1,
    borderColor:     colors.border,
  },
  sectionTitle: {
    fontSize:     fontSize.md,
    fontWeight:   fontWeight.semibold,
    color:        colors.text,
    marginBottom: spacing.xs,
  },
  sectionDesc: {
    fontSize:     fontSize.sm,
    color:        colors.subtext,
    lineHeight:   20,
    marginBottom: spacing.md,
  },
  fieldLabel: {
    fontSize:     fontSize.sm,
    fontWeight:   fontWeight.medium,
    color:        colors.subtext,
    marginBottom: spacing.xs,
  },
  inputRow: {
    borderWidth:   1,
    borderColor:   colors.border,
    borderRadius:  radius.md,
    backgroundColor: colors.card,
    marginBottom:  spacing.sm,
  },
  input: {
    height:          TOUCH_TARGET + 4,
    paddingHorizontal: spacing.md,
    fontSize:        fontSize.md,
    color:           colors.text,
  },
  btnRow: {
    flexDirection: 'row',
    gap:           spacing.sm,
    marginBottom:  spacing.xs,
  },
  pingBtn: {
    flex:          1,
    flexDirection: 'row',
    alignItems:    'center',
    justifyContent: 'center',
    gap:           6,
    height:        TOUCH_TARGET,
    borderRadius:  radius.md,
    borderWidth:   1,
    borderColor:   colors.accent,
  },
  pingBtnText: {
    fontSize:   fontSize.sm,
    fontWeight: fontWeight.semibold,
    color:      colors.accent,
  },
  saveBtn: {
    paddingHorizontal: spacing.lg,
    height:          TOUCH_TARGET,
    borderRadius:    radius.md,
    backgroundColor: colors.accent,
    alignItems:      'center',
    justifyContent:  'center',
  },
  saveBtnText: {
    fontSize:   fontSize.sm,
    fontWeight: fontWeight.bold,
    color:      '#fff',
  },
  btnPressed: {
    opacity: 0.75,
  },
  pingResult: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           6,
    padding:       spacing.sm,
    borderRadius:  radius.sm,
    marginTop:     spacing.xs,
  },
  pingOk: {
    backgroundColor: `${colors.success}18`,
  },
  pingError: {
    backgroundColor: `${colors.error}18`,
  },
  pingResultText: {
    fontSize: fontSize.sm,
    flex:     1,
  },
  formatRow: {
    flexDirection:  'row',
    alignItems:     'center',
    padding:        spacing.md,
    borderRadius:   radius.md,
    marginBottom:   spacing.xs,
    backgroundColor: colors.card,
    borderWidth:    1,
    borderColor:    colors.border,
  },
  formatRowActive: {
    borderColor: colors.accent,
    backgroundColor: `${colors.accent}12`,
  },
  formatInfo: {
    flex: 1,
  },
  formatLabel: {
    fontSize:   fontSize.md,
    fontWeight: fontWeight.semibold,
    color:      colors.text,
  },
  formatDesc: {
    fontSize: fontSize.sm,
    color:    colors.subtext,
    marginTop: 2,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems:    'flex-start',
    gap:           spacing.sm,
    marginBottom:  spacing.sm,
  },
  stepBadge: {
    width:          22,
    height:         22,
    borderRadius:   11,
    backgroundColor: colors.accent,
    alignItems:     'center',
    justifyContent: 'center',
    marginTop:      1,
    flexShrink:     0,
  },
  stepNum: {
    fontSize:   11,
    fontWeight: fontWeight.bold,
    color:      '#fff',
  },
  stepText: {
    flex:      1,
    fontSize:  fontSize.sm,
    color:     colors.subtext,
    lineHeight: 20,
  },
  version: {
    textAlign: 'center',
    fontSize:  fontSize.xs,
    color:     colors.dim,
    marginTop: spacing.sm,
  },
});
