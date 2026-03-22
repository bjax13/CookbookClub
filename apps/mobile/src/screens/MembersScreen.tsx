import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Text, View } from "react-native";
import { ScreenFrame } from "../components/ScreenFrame";
import { Button, Card, ErrorText, Field, Label, Meta } from "../components/Ui";
import { api } from "../lib/api";
import { useSessionStore } from "../state/session";

export function MembersScreen() {
  const queryClient = useQueryClient();
  const actorUserId = useSessionStore((state) => state.actorUserId);
  const accessToken = useSessionStore((state) => state.accessToken);

  const [name, setName] = useState("");
  const [memberToRemove, setMemberToRemove] = useState("");

  const membersQuery = useQuery({ queryKey: ["members"], queryFn: api.listMembers });

  const addMemberMutation = useMutation({
    mutationFn: async (memberName: string) => {
      const user = await api.createUser({ name: memberName });
      return api.inviteMember({
        actorUserId: accessToken ? undefined : actorUserId || undefined,
        userId: user.id,
        role: "member",
      });
    },
    onSuccess: () => {
      setName("");
      queryClient.invalidateQueries();
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: (userId: string) =>
      api.removeMember({ actorUserId: accessToken ? undefined : actorUserId || undefined, userId }),
    onSuccess: () => {
      setMemberToRemove("");
      queryClient.invalidateQueries();
    },
  });

  return (
    <ScreenFrame title="Members" subtitle="Invite and manage club members">
      <Card>
        <Text style={{ fontSize: 18, fontWeight: "700", color: "#2a2118" }}>Invite Member</Text>
        <Label>Display Name</Label>
        <Field
          value={name}
          onChangeText={setName}
          placeholder="New member name"
          autoCapitalize="words"
        />
        <ErrorText
          message={
            addMemberMutation.error instanceof Error ? addMemberMutation.error.message : undefined
          }
        />
        <Button
          label="Create User + Invite"
          loading={addMemberMutation.isPending}
          disabled={(!actorUserId && !accessToken) || !name.trim()}
          onPress={() => addMemberMutation.mutate(name.trim())}
        />
      </Card>

      <Card>
        <Text style={{ fontSize: 18, fontWeight: "700", color: "#2a2118" }}>Remove Member</Text>
        <Label>User ID</Label>
        <Field
          value={memberToRemove}
          onChangeText={setMemberToRemove}
          placeholder="user_2"
          autoCapitalize="none"
        />
        <ErrorText
          message={
            removeMemberMutation.error instanceof Error
              ? removeMemberMutation.error.message
              : undefined
          }
        />
        <Button
          label="Remove"
          kind="secondary"
          loading={removeMemberMutation.isPending}
          disabled={(!actorUserId && !accessToken) || !memberToRemove.trim()}
          onPress={() => removeMemberMutation.mutate(memberToRemove.trim())}
        />
      </Card>

      <Card>
        <Text style={{ fontSize: 18, fontWeight: "700", color: "#2a2118" }}>Current Members</Text>
        {membersQuery.isLoading ? <Text>Loading members...</Text> : null}
        <ErrorText
          message={membersQuery.error instanceof Error ? membersQuery.error.message : undefined}
        />
        {membersQuery.data?.length ? (
          <View style={{ gap: 10 }}>
            {membersQuery.data.map((member) => (
              <Card key={member.id} style={{ padding: 10 }}>
                <Meta label="Name" value={member.user.name} />
                <Meta label="User ID" value={member.user.id} />
                <Meta label="Role" value={member.role} />
              </Card>
            ))}
          </View>
        ) : (
          <Text>No members found.</Text>
        )}
      </Card>
    </ScreenFrame>
  );
}
