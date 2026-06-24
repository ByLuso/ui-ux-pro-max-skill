import React, { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Pressable, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import { ConvertFile } from '../types';
import { colors, spacing, radius, fontSize, fontWeight, shadow, TOUCH_TARGET } from '../theme';

interface Props {
  file:     ConvertFile;
  onRemove: (id: string) => void;
  disabled: boolean;
}

const STATUS_CONFIG = {
  pending:   { icon: 'time-outline'        as const, color: colors.subtext, label: 'Pendiente'    },
  uploading: { icon: 'cloud-upload-outline' as const, color: colors.accent,  label: 'Convirtiendo…'},
  done:      { icon: 'checkmark-circle'    as const, color: colors.success, label: 'Completado'   },
  error:     { icon: 'close-circle'        as const, color: colors.error,   label: 'Error'        },
};

export default function FileCard({ file, onRemove, disabled }: Props) {
  const progressAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim    = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: file.progress,
      duration: 200,
      useNativeDriver: false,
    }).start();
  }, [file.progress]);

  useEffect(() => {
    if (file.status === 'uploading') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.6, duration: 700, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1,   duration: 700, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
  }, [file.status]);

  const cfg = STATUS_CONFIG[file.status];

  async function handleTapDone() {
    if (file.status !== 'done' || !file.outputUri) return;
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(file.outputUri, {
        mimeType:    'application/octet-stream',
        dialogTitle: `Guardar ${file.outputName ?? ''}`,
      });
    }
  }

  const isInteractiveDone = file.status === 'done' && !!file.outputUri;

  return (
    <Pressable
      onPress={isInteractiveDone ? handleTapDone : undefined}
      style={({ pressed }) => [
        styles.card,
        isInteractiveDone && pressed && styles.cardPressed,
      ]}
      accessibilityLabel={`${file.name}, estado: ${cfg.label}`}
      accessibilityRole={isInteractiveDone ? 'button' : 'text'}
      accessibilityHint={isInteractiveDone ? 'Toca para compartir el archivo convertido' : undefined}
    >
      {/* left: ext badge */}
      <View style={[
        styles.badge,
        file.extension === 'pdf' ? styles.badgePdf : styles.badgeEpub,
      ]}>
        <Text style={styles.badgeText}>{file.extension.toUpperCase()}</Text>
      </View>

      {/* center: name + progress */}
      <View style={styles.center}>
        <Text style={styles.name} numberOfLines={1}>{file.name}</Text>

        <View style={styles.progressTrack}>
          <Animated.View
            style={[
              styles.progressFill,
              {
                width: progressAnim.interpolate({
                  inputRange:  [0, 1],
                  outputRange: ['0%', '100%'],
                }),
                backgroundColor:
                  file.status === 'error'  ? colors.error :
                  file.status === 'done'   ? colors.success :
                  colors.accent,
              },
            ]}
          />
        </View>

        {/* status row */}
        <Animated.View style={[styles.statusRow, { opacity: pulseAnim }]}>
          <Ionicons name={cfg.icon} size={13} color={cfg.color} />
          <Text style={[styles.statusText, { color: cfg.color }]}>
            {file.status === 'error' && file.errorMessage
              ? file.errorMessage
              : cfg.label}
          </Text>
          {isInteractiveDone && (
            <View style={styles.sharePill}>
              <Ionicons name="share-outline" size={11} color={colors.accent} />
              <Text style={styles.shareText}>Compartir</Text>
            </View>
          )}
        </Animated.View>
      </View>

      {/* right: remove button */}
      <Pressable
        onPress={() => onRemove(file.id)}
        disabled={disabled}
        style={({ pressed }) => [
          styles.removeBtn,
          pressed && styles.removeBtnPressed,
          disabled && styles.removeBtnDisabled,
        ]}
        hitSlop={10}
        accessibilityLabel={`Eliminar ${file.name}`}
        accessibilityRole="button"
      >
        <Ionicons
          name="close"
          size={16}
          color={disabled ? colors.dim : colors.subtext}
        />
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection:  'row',
    alignItems:     'center',
    backgroundColor: colors.card,
    borderRadius:   radius.md,
    padding:        spacing.md,
    marginBottom:   spacing.sm,
    ...shadow.card,
    borderWidth:    1,
    borderColor:    colors.border,
  },
  cardPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  badge: {
    width: 44,
    height: 24,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  badgePdf: {
    backgroundColor: '#3B1F1F',
  },
  badgeEpub: {
    backgroundColor: '#1F2C3B',
  },
  badgeText: {
    fontSize:   fontSize.xs,
    fontWeight: fontWeight.bold,
    color:      colors.subtext,
    letterSpacing: 0.5,
  },
  center: {
    flex: 1,
  },
  name: {
    fontSize:   fontSize.md,
    fontWeight: fontWeight.medium,
    color:      colors.text,
    marginBottom: 6,
  },
  progressTrack: {
    height:          4,
    backgroundColor: colors.border,
    borderRadius:    2,
    overflow:        'hidden',
    marginBottom:    6,
  },
  progressFill: {
    height:       4,
    borderRadius: 2,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           4,
  },
  statusText: {
    fontSize:  fontSize.xs,
    flex: 1,
  },
  sharePill: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             3,
    backgroundColor: `${colors.accent}22`,
    paddingHorizontal: 6,
    paddingVertical:   2,
    borderRadius:    radius.full,
  },
  shareText: {
    fontSize:   fontSize.xs,
    color:      colors.accent,
    fontWeight: fontWeight.medium,
  },
  removeBtn: {
    width:          TOUCH_TARGET,
    height:         TOUCH_TARGET,
    alignItems:     'center',
    justifyContent: 'center',
    marginLeft:     spacing.xs,
  },
  removeBtnPressed: {
    backgroundColor: `${colors.error}22`,
    borderRadius:    radius.full,
  },
  removeBtnDisabled: {
    opacity: 0.4,
  },
});
