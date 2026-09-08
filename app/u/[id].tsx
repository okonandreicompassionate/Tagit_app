import { Redirect, useLocalSearchParams } from 'expo-router';

/**
 * Handles `tagit://u/:id` and the universal-link form of `tagit.app/u/:id`, so a
 * code shared in a chat opens the same sheet as one scanned with the camera.
 * Counts as a link — tapping someone's Tagit link is the same intent as scanning
 * it in person.
 */
export default function DeepLinkedCard() {
  const { id, e } = useLocalSearchParams<{ id: string; e?: string }>();

  if (!id) return <Redirect href="/" />;

  return <Redirect href={{ pathname: '/card/[id]', params: { id, event: e ?? '', scan: '1' } }} />;
}
