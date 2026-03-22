import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Image, Linking, Text, View } from "react-native";
import { ScreenFrame } from "../components/ScreenFrame";
import { Button, Card, ErrorText, Field, Label, Meta } from "../components/Ui";
import { api } from "../lib/api";
import type { PickedImage } from "../lib/image";
import { captureImageAsDataUrl, pickImageAsDataUrl } from "../lib/image";
import { useSessionStore } from "../state/session";

type PickedImageState = PickedImage | null;

function toLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function RecipesScreen() {
  const queryClient = useQueryClient();
  const actorUserId = useSessionStore((state) => state.actorUserId);
  const accessToken = useSessionStore((state) => state.accessToken);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [ingredients, setIngredients] = useState("");
  const [instructions, setInstructions] = useState("");
  const [pickedImage, setPickedImage] = useState<PickedImageState>(null);
  const [pickError, setPickError] = useState<string | undefined>();
  const [imageActionPending, setImageActionPending] = useState(false);
  const [submitFeedback, setSubmitFeedback] = useState<string | undefined>();

  const recipesQuery = useQuery({
    queryKey: ["recipes", actorUserId],
    queryFn: () => api.listRecipes(accessToken ? undefined : actorUserId || undefined),
    enabled: Boolean(actorUserId || accessToken),
  });

  const collectionsQuery = useQuery({
    queryKey: ["collections", actorUserId],
    queryFn: () => api.listCollections(accessToken ? undefined : actorUserId || undefined),
    enabled: Boolean(actorUserId || accessToken),
  });

  const addRecipeMutation = useMutation({
    mutationFn: api.addRecipe,
    onSuccess: () => {
      setTitle("");
      setDescription("");
      setIngredients("");
      setInstructions("");
      setPickedImage(null);
      setSubmitFeedback("Recipe submitted.");
      queryClient.invalidateQueries();
    },
  });

  const favoriteMutation = useMutation({
    mutationFn: (recipeId: string) =>
      api.addFavoriteToCollection({
        actorUserId: accessToken ? undefined : actorUserId || undefined,
        recipeId,
        collectionName: "Favorites",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collections"] });
    },
  });

  const submitDisabled = useMemo(() => !title.trim(), [title]);
  const canOpenSettings = useMemo(() => {
    return Boolean(pickError && /blocked|settings/i.test(pickError));
  }, [pickError]);

  async function handlePickFromLibrary() {
    try {
      setImageActionPending(true);
      setPickError(undefined);
      const selected = await pickImageAsDataUrl();
      if (selected) {
        setPickedImage(selected);
      }
    } catch (error) {
      setPickError(error instanceof Error ? error.message : "Unable to pick image.");
    } finally {
      setImageActionPending(false);
    }
  }

  async function handleCapturePhoto() {
    try {
      setImageActionPending(true);
      setPickError(undefined);
      const captured = await captureImageAsDataUrl();
      if (captured) {
        setPickedImage(captured);
      }
    } catch (error) {
      setPickError(error instanceof Error ? error.message : "Unable to take photo.");
    } finally {
      setImageActionPending(false);
    }
  }

  function handleSubmitRecipe() {
    setSubmitFeedback(undefined);
    if (!actorUserId && !accessToken) {
      setSubmitFeedback("Set an Actor User ID or login on the Home tab before submitting.");
      return;
    }

    addRecipeMutation.mutate({
      actorUserId: accessToken ? undefined : actorUserId || undefined,
      title: title.trim(),
      description: description.trim() || undefined,
      recipeIngredient: toLines(ingredients),
      recipeInstructions: toLines(instructions).map((text) => ({ text })),
      imageDataUrl: pickedImage?.dataUrl,
      imageFileName: pickedImage?.fileName,
    });
  }

  return (
    <ScreenFrame title="Recipes" subtitle="Submit and browse meetup recipes">
      <Card>
        <Text style={{ fontSize: 18, fontWeight: "700", color: "#2a2118" }}>Add Recipe</Text>
        {!actorUserId && !accessToken ? (
          <Text>Set an Actor User ID or login on the Home tab first.</Text>
        ) : null}

        <Label>Title</Label>
        <Field
          value={title}
          onChangeText={setTitle}
          placeholder="Smoky Tomato Pasta"
          autoCapitalize="words"
        />

        <Label>Description</Label>
        <Field
          value={description}
          onChangeText={setDescription}
          placeholder="Short summary for the cookbook"
          autoCapitalize="sentences"
          multiline
        />

        <Label>Ingredients (one per line)</Label>
        <Field
          value={ingredients}
          onChangeText={setIngredients}
          placeholder="2 tbsp olive oil"
          autoCapitalize="sentences"
          multiline
        />

        <Label>Instructions (one step per line)</Label>
        <Field
          value={instructions}
          onChangeText={setInstructions}
          placeholder="Boil pasta"
          autoCapitalize="sentences"
          multiline
        />

        <Button
          label={pickedImage ? `Image: ${pickedImage.fileName}` : "Select Image"}
          kind="secondary"
          loading={imageActionPending}
          disabled={imageActionPending}
          onPress={handlePickFromLibrary}
        />
        <Button
          label="Take Photo"
          kind="secondary"
          loading={imageActionPending}
          disabled={imageActionPending}
          onPress={handleCapturePhoto}
        />

        {pickedImage ? (
          <View style={{ gap: 8 }}>
            <Image
              source={{ uri: pickedImage.uri }}
              style={{ width: "100%", height: 180, borderRadius: 10 }}
              resizeMode="cover"
            />
            <Text style={{ color: "#6a5a47", fontSize: 12 }}>
              Source: {pickedImage.source === "camera" ? "Camera" : "Photo Library"}
            </Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Button
                  label="Retake Photo"
                  kind="secondary"
                  loading={imageActionPending}
                  disabled={imageActionPending}
                  onPress={handleCapturePhoto}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  label="Remove Photo"
                  kind="secondary"
                  disabled={imageActionPending}
                  onPress={() => {
                    setPickedImage(null);
                    setPickError(undefined);
                  }}
                />
              </View>
            </View>
          </View>
        ) : null}

        <ErrorText message={pickError} />
        {submitFeedback ? <Text style={{ color: "#7a4b1f" }}>{submitFeedback}</Text> : null}
        {canOpenSettings ? (
          <Button
            label="Open Settings"
            kind="secondary"
            onPress={async () => {
              try {
                await Linking.openSettings();
              } catch {
                setPickError(
                  "Unable to open Settings automatically. Open device Settings and grant camera/photos access.",
                );
              }
            }}
          />
        ) : null}
        <ErrorText
          message={
            addRecipeMutation.error instanceof Error ? addRecipeMutation.error.message : undefined
          }
        />

        <Button
          label="Submit Recipe"
          loading={addRecipeMutation.isPending}
          disabled={submitDisabled || addRecipeMutation.isPending}
          onPress={handleSubmitRecipe}
        />
      </Card>

      <Card>
        <Text style={{ fontSize: 18, fontWeight: "700", color: "#2a2118" }}>Cookbook</Text>
        {!actorUserId && !accessToken ? (
          <Text>Set an Actor User ID or login on the Home tab first.</Text>
        ) : null}
        {recipesQuery.isLoading ? <Text>Loading recipes...</Text> : null}
        <ErrorText
          message={recipesQuery.error instanceof Error ? recipesQuery.error.message : undefined}
        />
        <ErrorText
          message={
            favoriteMutation.error instanceof Error ? favoriteMutation.error.message : undefined
          }
        />
        {recipesQuery.data?.length ? (
          <View style={{ gap: 10 }}>
            {recipesQuery.data.map((recipe) => (
              <Card key={recipe.id} style={{ padding: 10 }}>
                <Meta label="Title" value={recipe.name || recipe.title || "Untitled"} />
                <Meta label="Author" value={recipe.author?.name || recipe.authorUserId} />
                <Meta label="Ingredients" value={recipe.recipeIngredient?.length || 0} />
                <Meta label="Steps" value={recipe.recipeInstructions?.length || 0} />
                {recipe.imagePath ? (
                  <Image
                    source={{ uri: api.imageUrl(recipe.imagePath) }}
                    style={{ width: "100%", height: 160, borderRadius: 10 }}
                    resizeMode="cover"
                  />
                ) : null}
                <Button
                  label="Save to Favorites"
                  kind="secondary"
                  loading={favoriteMutation.isPending}
                  onPress={() => favoriteMutation.mutate(recipe.id)}
                />
              </Card>
            ))}
          </View>
        ) : actorUserId || accessToken ? (
          <Text>No recipes yet for the current meetup.</Text>
        ) : null}
      </Card>

      <Card>
        <Text style={{ fontSize: 18, fontWeight: "700", color: "#2a2118" }}>My Collections</Text>
        {collectionsQuery.isLoading ? <Text>Loading collections...</Text> : null}
        <ErrorText
          message={
            collectionsQuery.error instanceof Error ? collectionsQuery.error.message : undefined
          }
        />
        {collectionsQuery.data?.length ? (
          <View style={{ gap: 10 }}>
            {collectionsQuery.data.map((collection) => (
              <Card key={collection.id} style={{ padding: 10 }}>
                <Meta label="Name" value={collection.name} />
                <Meta label="Recipes" value={collection.recipes.length} />
              </Card>
            ))}
          </View>
        ) : (
          <Text>No personal collections yet.</Text>
        )}
      </Card>
    </ScreenFrame>
  );
}
