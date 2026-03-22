import * as FileSystem from "expo-file-system";
import * as ImagePicker from "expo-image-picker";

export type PickedImage = {
  uri: string;
  fileName: string;
  dataUrl: string;
  source: "library" | "camera";
};

export class ImagePermissionError extends Error {
  code: "library_denied" | "library_blocked" | "camera_denied" | "camera_blocked";

  constructor(
    code: "library_denied" | "library_blocked" | "camera_denied" | "camera_blocked",
    message: string,
  ) {
    super(message);
    this.code = code;
    this.name = "ImagePermissionError";
  }
}

function permissionError(kind: "library" | "camera", canAskAgain: boolean) {
  if (kind === "library") {
    return canAskAgain
      ? "Photo library permission is required to select recipe images."
      : "Photo library access is blocked. Enable it in device Settings to select recipe images.";
  }
  return canAskAgain
    ? "Camera permission is required to take a recipe photo."
    : "Camera access is blocked. Enable it in device Settings to take recipe photos.";
}

async function toPickedImage(
  result: ImagePicker.ImagePickerResult,
  fallbackPrefix: "recipe" | "camera",
  source: "library" | "camera",
): Promise<PickedImage | null> {
  if (result.canceled || !result.assets.length) {
    return null;
  }

  const asset = result.assets[0];
  if (!asset) return null;
  const base64 = await FileSystem.readAsStringAsync(asset.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const mime = asset.mimeType || "image/jpeg";
  const fileName = asset.fileName || `${fallbackPrefix}-${Date.now()}.jpg`;

  return {
    uri: asset.uri,
    fileName,
    dataUrl: `data:${mime};base64,${base64}`,
    source,
  };
}

export async function pickImageAsDataUrl(): Promise<PickedImage | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new ImagePermissionError(
      permission.canAskAgain ? "library_denied" : "library_blocked",
      permissionError("library", permission.canAskAgain),
    );
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 0.8,
  });

  return toPickedImage(result, "recipe", "library");
}

export async function captureImageAsDataUrl(): Promise<PickedImage | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    throw new ImagePermissionError(
      permission.canAskAgain ? "camera_denied" : "camera_blocked",
      permissionError("camera", permission.canAskAgain),
    );
  }

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ["images"],
    quality: 0.7,
  });

  return toPickedImage(result, "camera", "camera");
}
