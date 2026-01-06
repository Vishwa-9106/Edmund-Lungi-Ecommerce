"use client";

import { useState, useRef, useCallback } from "react";
import { X, Upload, Sparkles, AlertCircle, RefreshCw, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { validateBodyImage, fileToBase64, urlToBase64 } from "@/lib/imageValidation";
import type { ValidationResult } from "@/lib/imageValidation";
import { supabase } from "@/supabase";

interface AiTryOnModalProps {
  isOpen: boolean;
  onClose: () => void;
  productImages: string[];
  productName: string;
}

export function AiTryOnModal({ isOpen, onClose, productImages, productName }: AiTryOnModalProps) {
  const [userImage, setUserImage] = useState<File | null>(null);
  const [userImagePreview, setUserImagePreview] = useState<string | null>(null);
  const [selectedPattern, setSelectedPattern] = useState<string>(productImages[0] || "");
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [bodyType, setBodyType] = useState<"full" | "half" | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [rechargeUrl, setRechargeUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setValidationError("Please select an image file (JPG, PNG).");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setValidationError("Image size must be less than 5MB.");
      return;
    }

    setValidationError(null);
    setApiError(null);
    setGeneratedImage(null);

    const result: ValidationResult = await validateBodyImage(file);

    if (!result.valid) {
      setValidationError(result.error || "Invalid image");
      setUserImage(null);
      setUserImagePreview(null);
      setBodyType(null);
      return;
    }

    setBodyType(result.bodyType || null);
    setUserImage(file);
    setUserImagePreview(URL.createObjectURL(file));
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!userImage || !selectedPattern) return;

    setIsLoading(true);
    setApiError(null);
    setGeneratedImage(null);

    try {
      const userImageBase64 = await fileToBase64(userImage);
      
      let patternBase64: string;
      if (selectedPattern.startsWith("data:")) {
        patternBase64 = selectedPattern.split(",")[1];
      } else {
        patternBase64 = await urlToBase64(selectedPattern);
      }

      const { data, error } = await supabase.functions.invoke("ai-tryon", {
        body: {
          userImage: userImageBase64,
          dhotImage: patternBase64,
          bodyType: bodyType,
        },
      });

      if (error) {
        throw new Error(error.message || "Failed to generate preview");
      }

      if (data?.error) {
        if (data.rechargeUrl) {
          setRechargeUrl(data.rechargeUrl);
        }
        throw new Error(data.error);
      }

      if (data?.image) {
        setGeneratedImage(`data:image/png;base64,${data.image}`);
      } else {
        throw new Error("No image returned from API");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to generate preview";
      setApiError(message);
    } finally {
      setIsLoading(false);
    }
  }, [userImage, selectedPattern, bodyType]);

  const handleRetry = useCallback(() => {
    setApiError(null);
    handleGenerate();
  }, [handleGenerate]);

  const resetModal = useCallback(() => {
    setUserImage(null);
    setUserImagePreview(null);
    setGeneratedImage(null);
    setValidationError(null);
    setApiError(null);
    setBodyType(null);
    setSelectedPattern(productImages[0] || "");
  }, [productImages]);

  const handleClose = useCallback(() => {
    resetModal();
    onClose();
  }, [onClose, resetModal]);

  if (!isOpen) return null;

  const canGenerate = userImage && selectedPattern && !isLoading && !validationError;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/50 backdrop-blur-sm">
      <div className="bg-card rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 animate-scale-in">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="font-display text-xl font-semibold">AI Try-On</h2>
            <p className="text-sm text-muted-foreground mt-1">{productName}</p>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-secondary rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-6">
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileSelect}
              className="hidden"
            />
            
            {!userImagePreview ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
              >
                <Upload className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="font-medium mb-2">Upload Your Photo</p>
                <p className="text-sm text-muted-foreground mb-4">
                  Half-body or full-body photo, JPG/PNG up to 5MB
                </p>
                <Button variant="outline" size="sm" type="button">
                  Choose File
                </Button>
              </div>
            ) : (
              <div className="relative">
                <div className="aspect-[3/4] max-h-64 mx-auto rounded-xl overflow-hidden bg-secondary">
                  <img
                    src={userImagePreview}
                    alt="Your photo"
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="flex items-center justify-between mt-3">
                  <div className="flex items-center gap-2 text-sm text-green-600">
                    <Check className="w-4 h-4" />
                    <span>{bodyType === "full" ? "Full-body" : "Half-body"} photo detected</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setUserImage(null);
                      setUserImagePreview(null);
                      setBodyType(null);
                      setGeneratedImage(null);
                    }}
                  >
                    Change Photo
                  </Button>
                </div>
              </div>
            )}

            {validationError && (
              <div className="flex items-start gap-2 mt-3 p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{validationError}</span>
              </div>
            )}
          </div>

          <div>
            <p className="font-medium mb-3">Select Dhoti Pattern</p>
            <div className="grid grid-cols-4 gap-3">
              {productImages.map((img, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedPattern(img)}
                  className={`aspect-square rounded-lg overflow-hidden transition-all ${
                    selectedPattern === img
                      ? "ring-2 ring-primary ring-offset-2"
                      : "hover:ring-2 ring-muted-foreground/30"
                  }`}
                >
                  <img
                    src={img}
                    alt={`Pattern ${i + 1}`}
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          </div>

          {(generatedImage || isLoading || apiError) && (
            <div className="bg-secondary rounded-xl p-4">
              <p className="font-medium mb-3 text-center">AI Preview</p>
              {isLoading ? (
                <div className="aspect-[3/4] max-h-80 mx-auto flex flex-col items-center justify-center">
                  <div className="w-10 h-10 border-3 border-primary border-t-transparent rounded-full animate-spin mb-4" />
                  <p className="text-muted-foreground">Generating AI preview…</p>
                </div>
                ) : apiError ? (
                  <div className="aspect-[3/4] max-h-80 mx-auto flex flex-col items-center justify-center text-center p-4">
                    <AlertCircle className="w-10 h-10 text-destructive mb-4" />
                    <p className="text-destructive mb-4">{apiError}</p>
                    <div className="flex flex-col gap-2 w-full">
                      {rechargeUrl ? (
                        <Button asChild className="gap-2">
                          <a href={rechargeUrl} target="_blank" rel="noopener noreferrer">
                            Recharge Segmind Credits
                          </a>
                        </Button>
                      ) : (
                        <Button onClick={handleRetry} variant="outline" className="gap-2">
                          <RefreshCw className="w-4 h-4" />
                          Retry
                        </Button>
                      )}
                    </div>
                  </div>
              ) : generatedImage ? (
                <div className="aspect-[3/4] max-h-80 mx-auto rounded-lg overflow-hidden">
                  <img
                    src={generatedImage}
                    alt="AI Try-On Preview"
                    className="w-full h-full object-contain"
                  />
                </div>
              ) : null}
            </div>
          )}

          <Button
            className="w-full btn-primary gap-2"
            onClick={handleGenerate}
            disabled={!canGenerate}
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                Generate AI Preview
              </>
            )}
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            AI-assisted preview. Actual fit may vary.
          </p>
        </div>
      </div>
    </div>
  );
}
