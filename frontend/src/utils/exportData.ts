import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';

/**
 * Writes the already-fetched export payload to a local JSON file and opens
 * the native share sheet so the user can save/send it. `exportMyData()`
 * returns the full export synchronously — there is no async job to poll for.
 */
export async function saveAndShareExport(data: unknown): Promise<void> {
  const target = `${FileSystem.cacheDirectory}nearme-export-${Date.now()}.json`;
  await FileSystem.writeAsStringAsync(target, JSON.stringify(data, null, 2), {
    encoding: FileSystem.EncodingType.UTF8,
  });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(target, {
      mimeType: 'application/json',
      dialogTitle: 'Export my data',
      UTI: 'public.json',
    });
  }
}
