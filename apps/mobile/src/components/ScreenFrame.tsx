import type { PropsWithChildren, ReactNode } from "react";
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";

type ScreenFrameProps = PropsWithChildren<{
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}>;

export function ScreenFrame({ title, subtitle, actions, children }: ScreenFrameProps) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={styles.headerTextWrap}>
            <Text style={styles.title}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
          {actions}
        </View>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f6f0e6",
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 16,
  },
  header: {
    paddingTop: 8,
    gap: 8,
  },
  headerTextWrap: {
    gap: 4,
  },
  title: {
    color: "#2a2118",
    fontSize: 28,
    fontWeight: "800",
  },
  subtitle: {
    color: "#5b4a35",
    fontSize: 14,
  },
});
