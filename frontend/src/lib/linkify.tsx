import { Text, Linking, type StyleProp, type TextStyle } from 'react-native';

// Split pattern (global) + full-match test (anchored, non-global — .test on a
// global regex is stateful and skips alternate matches).
const URL_SPLIT = /(https?:\/\/[^\s]+|www\.[^\s]+)/g;
const URL_TEST = /^(https?:\/\/[^\s]+|www\.[^\s]+)$/;

/** True if the text contains at least one http(s)/www URL. */
export function hasUrl(content: string | null | undefined): boolean {
  if (!content) return false;
  URL_SPLIT.lastIndex = 0;
  return URL_SPLIT.test(content);
}

/**
 * The first http(s)/www URL in the text, normalized to an absolute https URL —
 * or null. Used to decide which link (if any) gets a rich preview card.
 */
export function firstUrl(content: string | null | undefined): string | null {
  if (!content) return null;
  URL_SPLIT.lastIndex = 0;
  const match = URL_SPLIT.exec(content);
  if (!match) return null;
  const raw = match[0];
  return raw.startsWith('http') ? raw : `https://${raw}`;
}

/**
 * True when the message is nothing BUT a single URL. Those are deliberate link
 * shares — WhatsApp lets the bare URL speak for itself rather than stacking a
 * preview card under it.
 */
export function isBareUrl(content: string | null | undefined): boolean {
  if (!content) return false;
  return URL_TEST.test(content.trim());
}

/**
 * Render message text with URLs as tappable, underlined links.
 * Non-URL segments keep `textStyle`; URL segments get `linkStyle` layered on top.
 * Returns an array of <Text> segments — nest inside a parent <Text>.
 */
export function linkifyText(
  content: string,
  textStyle?: StyleProp<TextStyle>,
  linkStyle?: StyleProp<TextStyle>,
): React.ReactNode {
  const parts = content.split(URL_SPLIT);
  return parts.map((part, i) => {
    if (URL_TEST.test(part)) {
      return (
        <Text
          key={i}
          style={[textStyle, linkStyle]}
          suppressHighlighting
          onPress={() =>
            Linking.openURL(part.startsWith('http') ? part : `https://${part}`).catch(() => {})
          }
        >
          {part}
        </Text>
      );
    }
    return (
      <Text key={i} style={textStyle}>
        {part}
      </Text>
    );
  });
}
