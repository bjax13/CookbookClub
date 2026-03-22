import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { ScreenFrame } from "../components/ScreenFrame";
import { Button, Card, ErrorText, Field, Label, Meta } from "../components/Ui";
import { API_BASE_URL } from "../config";
import { api } from "../lib/api";
import { useSessionStore } from "../state/session";

export function StatusScreen() {
  const queryClient = useQueryClient();
  const actorUserId = useSessionStore((state) => state.actorUserId);
  const accessToken = useSessionStore((state) => state.accessToken);
  const tokenExpiresAt = useSessionStore((state) => state.tokenExpiresAt);
  const setActorUserId = useSessionStore((state) => state.setActorUserId);
  const setAccessToken = useSessionStore((state) => state.setAccessToken);
  const setTokenExpiresAt = useSessionStore((state) => state.setTokenExpiresAt);
  const clearSession = useSessionStore((state) => state.clearSession);

  const [clubName, setClubName] = useState("Cook Book Club");
  const [hostName, setHostName] = useState("Alice");

  const statusQuery = useQuery({ queryKey: ["status"], queryFn: api.getStatus });
  const membersForSessionQuery = useQuery({
    queryKey: ["members-for-session"],
    queryFn: api.listMembers,
    enabled: Boolean(statusQuery.data?.initialized),
  });
  const authCapabilityQuery = useQuery({
    queryKey: ["auth-capability"],
    retry: false,
    queryFn: async () => {
      const response = await fetch(`${API_BASE_URL}/api/auth/session`);
      if (response.status === 401) return "supported" as const;
      let payload: { error?: string } | null = null;
      try {
        payload = (await response.json()) as { error?: string };
      } catch {
        payload = null;
      }
      const message = payload?.error || "";
      if (response.status === 404 && /Unknown API endpoint:\s*\/api\/auth\//i.test(message)) {
        return "unsupported" as const;
      }
      return "unknown" as const;
    },
  });

  const initClubMutation = useMutation({
    mutationFn: api.initClub,
    onSuccess: (payload) => {
      setActorUserId(payload.host.id);
      queryClient.invalidateQueries();
    },
  });

  const loginMutation = useMutation({
    mutationFn: api.login,
    onSuccess: (payload) => {
      setActorUserId(payload.user.id);
      setAccessToken(payload.token);
      setTokenExpiresAt(payload.expiresAt);
      queryClient.invalidateQueries();
    },
  });

  const refreshMutation = useMutation({
    mutationFn: api.refreshSession,
    onSuccess: (payload) => {
      setActorUserId(payload.user.id);
      setAccessToken(payload.token);
      setTokenExpiresAt(payload.expiresAt);
      queryClient.invalidateQueries();
    },
  });

  const logoutMutation = useMutation({
    mutationFn: api.logout,
    onSettled: () => {
      clearSession();
      queryClient.invalidateQueries();
    },
  });

  const authErrorMessage = useMemo(() => {
    const loginError = loginMutation.error instanceof Error ? loginMutation.error.message : "";
    const refreshError =
      refreshMutation.error instanceof Error ? refreshMutation.error.message : "";
    const logoutError = logoutMutation.error instanceof Error ? logoutMutation.error.message : "";
    return [loginError, refreshError, logoutError].find(Boolean) || "";
  }, [loginMutation.error, refreshMutation.error, logoutMutation.error]);

  const authUnsupported = useMemo(() => {
    if (authCapabilityQuery.data === "unsupported") return true;
    return /Unknown API endpoint:\s*\/api\/auth\//i.test(authErrorMessage);
  }, [authCapabilityQuery.data, authErrorMessage]);

  const authModeLabel = authUnsupported
    ? "Actor ID mode (no token auth)"
    : accessToken
      ? "Token auth mode"
      : "Actor ID mode";
  const authEndpointStatusLabel = authCapabilityQuery.isLoading
    ? "Checking..."
    : authCapabilityQuery.data === "supported"
      ? "Supported"
      : authCapabilityQuery.data === "unsupported"
        ? "Unsupported"
        : "Unknown";
  const authHelpText = authUnsupported
    ? "Why can't I log in? This API server does not expose /api/auth/* endpoints. Use Actor User ID mode for all actions."
    : accessToken
      ? "You are logged in with a token session. Refresh or Logout controls are active."
      : "Login is available on this server. Enter an Actor User ID and tap Login as Actor.";
  const suggestedActorIds = useMemo(() => {
    const members = membersForSessionQuery.data || [];
    if (!members.length) return [];
    const hostId = statusQuery.data?.host?.id;
    const ids = members.map((entry) => entry.userId);
    const ordered = hostId ? [hostId, ...ids.filter((id) => id !== hostId)] : ids;
    return ordered.slice(0, 4);
  }, [membersForSessionQuery.data, statusQuery.data?.host?.id]);

  return (
    <ScreenFrame title="Cookbook Club" subtitle="Overview and quick setup">
      <Card>
        <Text style={{ fontSize: 18, fontWeight: "700", color: "#2a2118" }}>Session</Text>
        <Label>Actor User ID</Label>
        <Field
          value={actorUserId}
          onChangeText={setActorUserId}
          placeholder="user_1"
          autoCapitalize="none"
        />
        {suggestedActorIds.length ? (
          <View style={{ gap: 6 }}>
            <Text style={{ color: "#6c5b47", fontWeight: "600" }}>Quick actor select</Text>
            {suggestedActorIds.map((id) => (
              <Button
                key={id}
                label={`Use ${id}`}
                kind="secondary"
                onPress={() => setActorUserId(id)}
              />
            ))}
          </View>
        ) : null}
        <Meta label="Auth" value={accessToken ? "Token active" : "Anonymous"} />
        <Meta label="Mode" value={authModeLabel} />
        <Meta label="Auth Endpoints" value={authEndpointStatusLabel} />
        {authCapabilityQuery.isLoading ? (
          <Text style={{ color: "#6c5b47" }}>Checking auth capabilities...</Text>
        ) : null}
        <Text style={{ color: "#6c5b47" }}>{authHelpText}</Text>
        {tokenExpiresAt ? <Meta label="Token Expires" value={tokenExpiresAt} /> : null}
        {authUnsupported ? (
          <Text style={{ color: "#6c5b47" }}>
            This server does not expose `/api/auth/*`. Use Actor User ID directly for actions.
          </Text>
        ) : null}
        <ErrorText
          message={
            !authUnsupported && loginMutation.error instanceof Error
              ? loginMutation.error.message
              : undefined
          }
        />
        <ErrorText
          message={
            !authUnsupported && refreshMutation.error instanceof Error
              ? refreshMutation.error.message
              : undefined
          }
        />
        <ErrorText
          message={
            !authUnsupported && logoutMutation.error instanceof Error
              ? logoutMutation.error.message
              : undefined
          }
        />
        {!authUnsupported ? (
          <>
            <Button
              label="Login as Actor"
              kind="secondary"
              loading={loginMutation.isPending}
              disabled={!actorUserId}
              onPress={() => loginMutation.mutate(actorUserId)}
            />
            <Button
              label="Refresh Session"
              kind="secondary"
              loading={refreshMutation.isPending}
              disabled={!accessToken}
              onPress={() => refreshMutation.mutate()}
            />
            <Button
              label="Logout"
              kind="secondary"
              loading={logoutMutation.isPending}
              disabled={!accessToken}
              onPress={() => logoutMutation.mutate()}
            />
          </>
        ) : null}
        <Button
          label="Recheck Auth Support"
          kind="secondary"
          loading={authCapabilityQuery.isFetching}
          onPress={() => authCapabilityQuery.refetch()}
        />
      </Card>

      <Card>
        <Text style={{ fontSize: 18, fontWeight: "700", color: "#2a2118" }}>Club Status</Text>
        {statusQuery.isLoading ? <Text>Loading status...</Text> : null}
        <ErrorText
          message={statusQuery.error instanceof Error ? statusQuery.error.message : undefined}
        />
        {statusQuery.data ? (
          <View style={{ gap: 6 }}>
            <Meta label="Initialized" value={statusQuery.data.initialized ? "Yes" : "No"} />
            <Meta label="Storage" value={statusQuery.data.storage} />
            <Meta label="Club" value={statusQuery.data.club?.name || "Not created"} />
            <Meta label="Host" value={statusQuery.data.host?.name || "Unknown"} />
            <Meta label="Members" value={statusQuery.data.counts.members || 0} />
            <Meta label="Recipes" value={statusQuery.data.counts.recipes || 0} />
          </View>
        ) : null}
        <Button label="Refresh" kind="secondary" onPress={() => queryClient.invalidateQueries()} />
      </Card>

      <Card>
        <Text style={{ fontSize: 18, fontWeight: "700", color: "#2a2118" }}>Initialize Club</Text>
        <Label>Club Name</Label>
        <Field
          value={clubName}
          onChangeText={setClubName}
          placeholder="Cook Book Club"
          autoCapitalize="words"
        />
        <Label>Host Name</Label>
        <Field
          value={hostName}
          onChangeText={setHostName}
          placeholder="Alice"
          autoCapitalize="words"
        />
        <ErrorText
          message={
            initClubMutation.error instanceof Error ? initClubMutation.error.message : undefined
          }
        />
        <Button
          label="Create Club"
          loading={initClubMutation.isPending}
          onPress={() => initClubMutation.mutate({ clubName, hostName })}
        />
      </Card>
    </ScreenFrame>
  );
}
