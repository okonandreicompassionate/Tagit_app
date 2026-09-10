import Constants, { ExecutionEnvironment } from 'expo-constants';
import type { RefObject } from 'react';
import type { View } from 'react-native';

/**
 * Expo Go ships only the Expo SDK's own native modules, and
 * react-native-view-shot isn't one of them — so PNG export is unavailable
 * while demoing through Expo Go. Whatever's being captured still renders
 * identically either way; only this step changes, and every caller falls
 * back to sharing a link or letting the user screenshot it themselves.
 */
export const canExportImage = Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

/** Captures a view to a temp PNG file. Null on Expo Go, web, or any failure. */
export async function captureViewAsPng(ref: RefObject<View | null>): Promise<string | null> {
  if (!canExportImage) return null;
  try {
    // Required lazily: a static import would pull the native module into the
    // Expo Go bundle and throw on load.
    const { captureRef } = require('react-native-view-shot') as typeof import('react-native-view-shot');
    return await captureRef(ref, { format: 'png', quality: 1, result: 'tmpfile' });
  } catch {
    return null;
  }
}
