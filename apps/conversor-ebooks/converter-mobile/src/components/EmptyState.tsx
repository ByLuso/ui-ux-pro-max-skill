import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, fontWeight } from '../theme';

interface Props {
  message?: string;
}

export default function EmptyState({ message }: Props) {
  return (
    <View style={styles.container} accessibilityRole="text">
      <View style={styles.iconWrap}>
        <Ionicons name="documents-outline" size={48} color={colors.dim} />
      </View>
      <Text style={styles.title}>Sin archivos</Text>
      <Text style={styles.sub}>
        {message ?? 'Toca "+ Agregar" para seleccionar\narchivos PDF o EPUB'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
  },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: colors.subtext,
    marginBottom: spacing.xs,
  },
  sub: {
    fontSize: fontSize.sm,
    color: colors.dim,
    textAlign: 'center',
    lineHeight: 20,
  },
});
