"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  ArrowLeft,
  Loader2,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default function NewProgrammeClient() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    status: "DRAFT" as "DRAFT" | "PUBLISHED",
  });

  // Validation errors
  const [errors, setErrors] = useState({
    title: "",
  });

  const validateForm = (): boolean => {
    const newErrors = {
      title: "",
    };

    if (!formData.title.trim()) {
      newErrors.title = "Programme title is required";
    } else if (formData.title.length < 3) {
      newErrors.title = "Title must be at least 3 characters";
    } else if (formData.title.length > 200) {
      newErrors.title = "Title must not exceed 200 characters";
    }

    setErrors(newErrors);
    return !newErrors.title;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess(false);

    if (!validateForm()) {
      return;
    }

    try {
      setIsLoading(true);

      const response = await fetch("/api/admin/programmes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create programme");
      }

      setSuccess(true);

      // Redirect to programmes list after a short delay
      setTimeout(() => {
        router.push("/programmes");
        router.refresh();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setIsLoading(false);
    }
  };

  const handleInputChange = (field: keyof typeof formData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear error for this field when user starts typing
    if (errors[field as keyof typeof errors]) {
      setErrors((prev) => ({ ...prev, [field]: "" }));
    }
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-terminal-dark">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <Button
            variant="outline"
            onClick={() => router.push("/programmes")}
            className="mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Programmes
          </Button>
          <div className="mb-2 flex min-w-0 items-center gap-2">
            <BookOpen className="h-5 w-5 shrink-0 text-terminal-green sm:h-6 sm:w-6" />
            <h1 className="min-w-0 break-words font-mono text-xl font-bold text-terminal-green terminal-glow sm:text-3xl">
              $ programmes --create
            </h1>
          </div>
          <p className="break-words font-mono text-sm text-terminal-text-muted">
            Create a new learning programme
          </p>
        </div>

        {/* Success Message */}
        {success && (
          <Card className="mb-6 border-terminal-green bg-terminal-green/10">
            <CardContent className="pt-6">
              <div className="flex min-w-0 items-start gap-3 text-terminal-green">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
                <span className="break-words font-mono">
                  Programme created successfully! Redirecting...
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Error Message */}
        {error && (
          <Card className="mb-6 border-destructive bg-destructive/10">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3 text-destructive">
                <AlertCircle className="h-5 w-5 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <h3 className="font-mono font-semibold mb-1">Error</h3>
                  <p className="break-words text-sm">{error}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Form */}
        <Card>
          <CardHeader>
            <CardTitle>Programme Details</CardTitle>
            <CardDescription>
              Enter the details for the new programme
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Title */}
              <div className="space-y-2">
                <Label htmlFor="title" className="font-mono">
                  Programme Title *
                </Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => handleInputChange("title", e.target.value)}
                  placeholder="e.g., Advanced Web Development"
                  disabled={isLoading || success}
                  className={errors.title ? "border-destructive" : ""}
                />
                {errors.title && (
                  <p className="text-sm text-destructive font-mono">
                    {errors.title}
                  </p>
                )}
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="description" className="font-mono">
                  Description
                </Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) =>
                    handleInputChange("description", e.target.value)
                  }
                  placeholder="Provide a detailed description of the programme..."
                  rows={5}
                  disabled={isLoading || success}
                />
                <p className="text-xs text-terminal-text-muted font-mono">
                  Optional: Add a brief overview of what students will learn
                </p>
              </div>

              {/* Status */}
              <div className="space-y-2">
                <Label htmlFor="status" className="font-mono">
                  Initial Status
                </Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) =>
                    handleInputChange("status", value as "DRAFT" | "PUBLISHED")
                  }
                  disabled={isLoading || success}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DRAFT">Draft</SelectItem>
                    <SelectItem value="PUBLISHED">Published</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-terminal-text-muted font-mono">
                  Draft programmes are not visible to students
                </p>
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center">
                <Button
                  type="submit"
                  disabled={isLoading || success}
                  className="w-full sm:min-w-[120px] sm:w-auto"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : success ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Created
                    </>
                  ) : (
                    "Create Programme"
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.push("/programmes")}
                  disabled={isLoading || success}
                  className="w-full sm:w-auto"
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
