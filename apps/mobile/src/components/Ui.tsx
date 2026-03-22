import type { PropsWithChildren, ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  type StyleProp,
  StyleSheet,
  Text,
  TextInput,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";

export function Card({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Label({ children }: PropsWithChildren) {
  return <Text style={styles.label}>{children}</Text>;
}

export function Field(props: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
}) {
  return (
    <TextInput
      value={props.value}
      onChangeText={props.onChangeText}
      placeholder={props.placeholder}
      multiline={props.multiline}
      autoCapitalize={props.autoCapitalize || "none"}
      style={[styles.input, props.multiline ? styles.multiline : null]}
      placeholderTextColor="#857662"
    />
  );
}

export function Button(props: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  kind?: "primary" | "secondary";
  loading?: boolean;
}) {
  const isPrimary = (props.kind || "primary") === "primary";
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled || props.loading}
      style={({ pressed }) => [
        styles.button,
        isPrimary ? styles.primaryButton : styles.secondaryButton,
        props.disabled || props.loading ? styles.buttonDisabled : null,
        pressed ? styles.buttonPressed : null,
      ]}
    >
      {props.loading ? (
        <ActivityIndicator color={isPrimary ? "#fff9f0" : "#2a2118"} />
      ) : (
        <Text
          style={[
            styles.buttonText,
            isPrimary ? styles.primaryButtonText : styles.secondaryButtonText,
          ]}
        >
          {props.label}
        </Text>
      )}
    </Pressable>
  );
}

export function ErrorText({ message }: { message?: string }) {
  if (!message) return null;
  return <Text style={styles.error}>{message}</Text>;
}

export function Meta({ label, value }: { label: string; value: ReactNode }) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{String(value)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fffaf3",
    borderWidth: 1,
    borderColor: "#dcccb6",
    borderRadius: 14,
    padding: 14,
    gap: 8,
  },
  label: {
    color: "#4d3b2a",
    fontWeight: "700",
  },
  input: {
    borderWidth: 1,
    borderColor: "#d0bfa8",
    borderRadius: 10,
    backgroundColor: "#fff",
    color: "#2a2118",
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  multiline: {
    minHeight: 90,
    textAlignVertical: "top",
  },
  button: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButton: {
    backgroundColor: "#2f5d44",
  },
  secondaryButton: {
    backgroundColor: "#ede2d2",
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  buttonPressed: {
    transform: [{ scale: 0.99 }],
  },
  buttonText: {
    fontWeight: "700",
    fontSize: 15,
  } as TextStyle,
  primaryButtonText: {
    color: "#fffaf0",
  },
  secondaryButtonText: {
    color: "#2a2118",
  },
  error: {
    color: "#8a1a1a",
    fontWeight: "600",
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  metaLabel: {
    color: "#6c5b47",
    fontWeight: "600",
  },
  metaValue: {
    color: "#2a2118",
    flexShrink: 1,
    textAlign: "right",
  },
});
