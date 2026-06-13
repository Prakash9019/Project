import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { DarkTheme } from '../theme/colors';

interface Props {
  children: React.ReactNode;
}
interface State {
  hasError: boolean;
  message?: string;
}

/**
 * App-wide error boundary. Uses the dark palette directly (it must render even
 * if the theme context is what failed).
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error) {
    // Hook for crash reporting (e.g. Sentry) — kept console-only for now.
    console.error('Uncaught error:', error);
  }

  reset = () => this.setState({ hasError: false, message: undefined });

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <View style={styles.root}>
        <Text style={styles.emoji}>😵</Text>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.body}>{this.state.message ?? 'An unexpected error occurred.'}</Text>
        <Pressable style={styles.btn} onPress={this.reset}>
          <Text style={styles.btnText}>Try again</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: DarkTheme.background, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  emoji: { fontSize: 48 },
  title: { color: DarkTheme.textPrimary, fontSize: 20, fontWeight: '800' },
  body: { color: DarkTheme.textSecondary, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  btn: { marginTop: 8, backgroundColor: DarkTheme.brand, height: 48, borderRadius: 999, paddingHorizontal: 28, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: DarkTheme.textInverse, fontSize: 15, fontWeight: '700' },
});
