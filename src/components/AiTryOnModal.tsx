import { useEffect, useState, type ChangeEvent, type MouseEvent } from "react";
import { X, Upload, Loader2, Download, Sparkles } from "lucide-react";
import { useTryOn, useTryOnQuota } from "@/hooks/useTryOn";
import { supabase } from "@/supabase";
import { useToast } from "@/hooks/use-toast";

interface AiTryOnModalProps {
  isOpen: boolean;
  onClose: () => void;
  productId: string;
  productImage: string;
  productName: string;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Failed to generate preview. Please try again.";
}

export function AiTryOnModal({
  isOpen,
  onClose,
  productId,
  productImage,
  productName,
}: AiTryOnModalProps) {
  const [personImage, setPersonImage] = useState<File | null>(null);
  const [personImagePreview, setPersonImagePreview] = useState<string | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const tryOnMutation = useTryOn();
  const { data: quota } = useTryOnQuota();
  const { toast } = useToast();

  useEffect(() => {
    if (!isOpen) return;
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !tryOnMutation.isPending) {
        handleClose();
      }
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [isOpen, tryOnMutation.isPending]);

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.match(/^image\/(jpeg|jpg|png)$/)) {
      setUploadError("Only JPG and PNG images are supported");
      return;
    }

    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      setUploadError("Image must be smaller than 5MB");
      return;
    }

    setUploadError(null);
    setPersonImage(file);

    const reader = new FileReader();
    reader.onload = (event) => {
      setPersonImagePreview((event.target?.result as string) ?? null);
    };
    reader.readAsDataURL(file);
  };

  const handleGeneratePreview = async () => {
    if (isGenerating || tryOnMutation.isPending) return;

    if (!personImage) {
      setUploadError("Please upload your photo first");
      return;
    }

    setUploadError(null);
    setIsGenerating(true);
    let uploadedPath: string | null = null;

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError || !user) {
        throw new Error("Please log in to use this feature");
      }

      const safeName = personImage.name.replace(/\s+/g, "_");
      const fileName = `${user.id}/${Date.now()}_${safeName}`;
      uploadedPath = fileName;

      const { error: storageUploadError } = await supabase.storage
        .from("tryon-person-images")
        .upload(fileName, personImage, {
          contentType: personImage.type || "image/jpeg",
          upsert: false,
        });

      if (storageUploadError) {
        throw new Error(`Upload failed: ${storageUploadError.message}`);
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from("tryon-person-images").getPublicUrl(fileName);

      if (!publicUrl) {
        throw new Error("Could not get image URL after upload");
      }

      const result = await tryOnMutation.mutateAsync({
        personImageUrl: publicUrl,
        productId,
      });

      setResultImage(result.result_url);
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      console.error("Try-on error:", error);
      setUploadError(message);
      toast({
        title: "AI preview failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      if (uploadedPath) {
        const { error: cleanupError } = await supabase.storage
          .from("tryon-person-images")
          .remove([uploadedPath]);
        if (cleanupError) {
          console.warn("Try-on upload cleanup failed:", cleanupError.message);
        }
      }
      setIsGenerating(false);
    }
  };

  const handleDownload = async () => {
    if (!resultImage) return;

    try {
      const response = await fetch(resultImage);
      if (!response.ok) {
        throw new Error(`Download failed with status ${response.status}`);
      }
      const blob = await response.blob();
      if (!blob.type.startsWith("image/")) {
        throw new Error("Generated file is not a valid image");
      }
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${productName.replace(/\s+/g, "_")}_tryon.png`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Download failed:", error);
      setUploadError("Failed to download image. Please try again.");
    }
  };

  const handleReset = () => {
    setPersonImage(null);
    setPersonImagePreview(null);
    setResultImage(null);
    setUploadError(null);
  };

  const handleClose = () => {
    if (tryOnMutation.isPending || isGenerating) return;
    handleReset();
    onClose();
  };

  const handleBackdropClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={handleBackdropClick}
      role="presentation"
    >
      <div
        className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-6 py-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Try with AI</h2>
            <p className="mt-1 text-sm text-gray-600">
              Upload your photo and confirm the product details to generate a preview.
            </p>
            {quota ? (
              <p className="mt-1 text-xs text-gray-500">
                Remaining: <span className="font-semibold">{quota.daily_remaining}</span> today,{" "}
                <span className="ml-1 font-semibold">{quota.monthly_remaining}</span> this month
              </p>
            ) : null}
          </div>
          <button
            onClick={handleClose}
            className="rounded-full p-2 transition-colors hover:bg-gray-100"
            aria-label="Close modal"
            disabled={tryOnMutation.isPending || isGenerating}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6">
          {!resultImage ? (
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <h3 className="mb-3 text-lg font-semibold">1. Upload Person Photo</h3>
                <div className="rounded-lg border-2 border-dashed border-gray-300 p-6 text-center transition-colors hover:border-gray-400">
                  {personImagePreview ? (
                    <div className="relative">
                      <img
                        src={personImagePreview}
                        alt="Preview"
                        className="h-64 w-full rounded object-contain"
                      />
                      <button
                        onClick={() => {
                          setPersonImage(null);
                          setPersonImagePreview(null);
                          setUploadError(null);
                        }}
                        className="absolute right-2 top-2 rounded-full bg-red-500 p-1 text-white transition-colors hover:bg-red-600"
                        aria-label="Remove image"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <Upload className="mx-auto mb-4 h-12 w-12 text-gray-400" />
                      <label className="cursor-pointer">
                        <span className="font-medium text-blue-600 hover:text-blue-700">
                          Choose File
                        </span>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/jpg"
                          onChange={handleFileSelect}
                          className="hidden"
                        />
                      </label>
                      <p className="mt-2 text-sm text-gray-500">
                        JPG/PNG only, maximum file size 5MB
                      </p>
                      <p className="mt-1 text-xs text-gray-400">
                        Your uploaded image will appear here
                      </p>
                    </>
                  )}
                </div>
                {uploadError ? (
                  <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3">
                    <p className="text-sm text-red-600">{uploadError}</p>
                  </div>
                ) : null}
              </div>

              <div>
                <h3 className="mb-3 text-lg font-semibold">2. Garment Reference</h3>
                <div className="rounded-lg border bg-gray-50 p-4">
                  <img
                    src={productImage}
                    alt={productName}
                    className="mb-3 h-64 w-full rounded object-contain"
                  />
                  <p className="mb-2 text-sm font-medium text-gray-900">{productName}</p>
                  <p className="text-xs text-gray-600">
                    The model preserves face/background and focuses on lower-body drape styling.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center">
              <h3 className="mb-6 text-xl font-semibold text-gray-900">Your AI Try-On Result</h3>
              <div className="mx-auto mb-6 max-w-md">
                <img
                  src={resultImage}
                  alt="Try-on result"
                  className="w-full rounded-lg shadow-lg"
                  onError={() => setUploadError("Could not load generated image URL. Please try again.")}
                />
              </div>
              <div className="flex flex-wrap justify-center gap-3">
                <button
                  onClick={handleDownload}
                  className="flex items-center gap-2 rounded-lg bg-green-600 px-6 py-3 text-white shadow-md transition-colors hover:bg-green-700 hover:shadow-lg"
                >
                  <Download className="h-4 w-4" />
                  Download Result
                </button>
                <button
                  onClick={handleReset}
                  className="rounded-lg bg-gray-200 px-6 py-3 text-gray-700 transition-colors hover:bg-gray-300"
                >
                  Try Again
                </button>
              </div>
            </div>
          )}
        </div>

        {!resultImage ? (
          <div className="sticky bottom-0 z-10 border-t bg-white px-6 py-4">
            <button
              type="button"
              onClick={handleGeneratePreview}
              disabled={!personImage || tryOnMutation.isPending || isGenerating}
              className="w-full rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 px-6 py-3 font-semibold text-white shadow-lg transition-all duration-200 hover:from-purple-700 hover:to-pink-700 hover:shadow-xl disabled:cursor-not-allowed disabled:from-gray-300 disabled:to-gray-300 disabled:shadow-none"
            >
              {tryOnMutation.isPending || isGenerating ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  {tryOnMutation.isPending
                    ? "Generating Preview... (this may take 30-60 seconds)"
                    : "Preparing Preview..."}
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <Sparkles className="h-5 w-5" />
                  Generate AI Preview
                </span>
              )}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
