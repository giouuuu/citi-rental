import { z } from "zod";

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .pipe(z.email("Enter a valid email address.")),
  password: z.string().min(1, "Enter your password."),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .trim()
    .pipe(z.email("Enter a valid email address.")),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  password: z
    .string()
    .min(8, "Password must contain at least 8 characters.")
    .max(72, "Password must be 72 characters or fewer."),
});

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
