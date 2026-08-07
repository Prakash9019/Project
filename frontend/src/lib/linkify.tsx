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
