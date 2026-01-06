export interface ValidationResult {
  valid: boolean;
  error?: string;
  bodyType?: "full" | "half";
}

export async function validateBodyImage(file: File): Promise<ValidationResult> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      const width = img.naturalWidth;
      const height = img.naturalHeight;
      const aspectRatio = height / width;

      if (width < 400 || height < 400) {
        resolve({
          valid: false,
          error: "Image resolution too low. Please upload a higher quality photo.",
        });
        return;
      }

      if (aspectRatio < 0.8) {
        resolve({
          valid: false,
          error: "Please upload a half-body or full-body photo for accurate try-on.",
        });
        return;
      }

      if (aspectRatio >= 0.8 && aspectRatio < 1.2) {
        resolve({
          valid: false,
          error: "Please upload a half-body or full-body photo for accurate try-on.",
        });
        return;
      }

      if (aspectRatio >= 1.2 && aspectRatio < 1.6) {
        resolve({
          valid: true,
          bodyType: "half",
        });
        return;
      }

      resolve({
        valid: true,
        bodyType: "full",
      });
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({
        valid: false,
        error: "Failed to load image. Please try a different file.",
      });
    };

    img.src = url;
  });
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export async function urlToBase64(url: string): Promise<string> {
  const response = await fetch(url);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Failed to convert URL to base64"));
    reader.readAsDataURL(blob);
  });
}
