import { useRef, useState } from "react";
import { Image, ImageStyle } from "expo-image";
import { StyleProp } from "react-native";
import { WIKIMEDIA_IMAGE_HEADERS } from "@/lib/wikimedia";

const MAX_RETRIES = 3;

/**
 * <Image> for a Wikimedia-hosted reference photo. Wikimedia rate-limits
 * image requests fairly aggressively for non-browser clients, so scrolling
 * through a long list (or just bad luck) can trigger 429s. Retries a few
 * times with backoff before giving up and calling onGiveUp so the caller
 * can fall back to a placeholder.
 */
export function WikimediaImage({
  id,
  imageUrl,
  style,
  onGiveUp,
}: {
  id: string;
  imageUrl: string;
  style?: StyleProp<ImageStyle>;
  onGiveUp: () => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  return (
    <Image
      // Changing the uri (via a harmless query param) forces expo-image to retry the request.
      source={{
        uri: attempt === 0 ? imageUrl : `${imageUrl}&retry=${attempt}`,
        headers: WIKIMEDIA_IMAGE_HEADERS,
      }}
      style={style}
      cachePolicy="disk"
      onError={(e) => {
        console.log("[WikimediaImage] failed:", id, e.error, "attempt", attempt);
        if (attempt >= MAX_RETRIES) {
          onGiveUp();
          return;
        }
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => setAttempt((a) => a + 1), 1500 * (attempt + 1));
      }}
    />
  );
}
