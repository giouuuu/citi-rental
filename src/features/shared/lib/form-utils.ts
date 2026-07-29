import type { FieldValues, Path, UseFormSetError } from "react-hook-form";

/** Map server ActionResult.fieldErrors onto react-hook-form. */
export function applyServerFieldErrors<T extends FieldValues>(
  setError: UseFormSetError<T>,
  fieldErrors?: Record<string, string[]>,
) {
  if (!fieldErrors) return;

  for (const [name, messages] of Object.entries(fieldErrors)) {
    const message = messages?.[0];
    if (!message) continue;
    setError(name as Path<T>, { type: "server", message });
  }
}

/** Build FormData for existing server actions from RHF values. */
export function valuesToFormData(
  values: Record<string, unknown>,
  extras?: Record<string, string | Blob>,
): FormData {
  const formData = new FormData();

  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null) continue;

    if (typeof value === "boolean") {
      if (value) formData.set(key, "on");
      continue;
    }

    if (value instanceof File) {
      if (value.size > 0) formData.set(key, value);
      continue;
    }

    if (typeof FileList !== "undefined" && value instanceof FileList) {
      const file = value.item(0);
      if (file && file.size > 0) formData.set(key, file);
      continue;
    }

    if (typeof value === "string" && value.trim() === "") continue;

    formData.set(key, String(value));
  }

  if (extras) {
    for (const [key, value] of Object.entries(extras)) {
      formData.set(key, value);
    }
  }

  return formData;
}
