import { z } from "zod";

/** Same rules as registration (see password-requirements.ts). */
export const setPasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, "Password must contain at least 8 characters.")
      .max(72, "Password must be 72 characters or fewer.")
      .regex(/[A-Za-z]/, "Password must contain at least one letter.")
      .regex(/[0-9]/, "Password must contain at least one number."),
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export type SetPasswordInput = z.infer<typeof setPasswordSchema>;
