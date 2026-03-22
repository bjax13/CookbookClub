import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Text } from "react-native";
import { ScreenFrame } from "../components/ScreenFrame";
import { Button, Card, ErrorText, Field, Label, Meta } from "../components/Ui";
import { api } from "../lib/api";
import { useSessionStore } from "../state/session";

function defaultIso() {
  const next = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return next.toISOString();
}

export function MeetupScreen() {
  const queryClient = useQueryClient();
  const actorUserId = useSessionStore((state) => state.actorUserId);
  const accessToken = useSessionStore((state) => state.accessToken);
  const [isoDateTime, setIsoDateTime] = useState(defaultIso());

  const meetupQuery = useQuery({ queryKey: ["meetup"], queryFn: api.getMeetup });

  const scheduleMutation = useMutation({
    mutationFn: api.scheduleMeetup,
    onSuccess: () => {
      queryClient.invalidateQueries();
    },
  });

  return (
    <ScreenFrame title="Meetup" subtitle="Schedule and monitor upcoming meetup">
      <Card>
        <Text style={{ fontSize: 18, fontWeight: "700", color: "#2a2118" }}>Upcoming Meetup</Text>
        {meetupQuery.isLoading ? <Text>Loading meetup...</Text> : null}
        <ErrorText
          message={meetupQuery.error instanceof Error ? meetupQuery.error.message : undefined}
        />
        {meetupQuery.data ? (
          <>
            <Meta label="Meetup ID" value={meetupQuery.data.id} />
            <Meta label="Scheduled" value={meetupQuery.data.scheduledFor} />
            <Meta label="Theme" value={meetupQuery.data.theme} />
            <Meta label="Status" value={meetupQuery.data.status} />
          </>
        ) : (
          <Text>No meetup returned yet.</Text>
        )}
      </Card>

      <Card>
        <Text style={{ fontSize: 18, fontWeight: "700", color: "#2a2118" }}>Schedule Meetup</Text>
        <Label>ISO Date Time</Label>
        <Field
          value={isoDateTime}
          onChangeText={setIsoDateTime}
          placeholder="2026-06-01T18:30:00.000Z"
        />
        <Text style={{ color: "#6c5b47", fontSize: 12 }}>
          Use UTC ISO format. Example: 2026-06-01T18:30:00.000Z
        </Text>
        <ErrorText
          message={
            scheduleMutation.error instanceof Error ? scheduleMutation.error.message : undefined
          }
        />
        <Button
          label="Schedule"
          loading={scheduleMutation.isPending}
          disabled={(!actorUserId && !accessToken) || !isoDateTime.trim()}
          onPress={() =>
            scheduleMutation.mutate({
              actorUserId: accessToken ? undefined : actorUserId || undefined,
              isoDateTime: isoDateTime.trim(),
            })
          }
        />
      </Card>
    </ScreenFrame>
  );
}
