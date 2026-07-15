import { z } from "zod";

export const registerSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(2, "Enter your full name.")
      .max(120, "Full name must be 120 characters or fewer."),
    organizationName: z
      .string()
      .trim()
      .min(2, "Enter your organization name.")
      .max(120, "Organization name must be 120 characters or fewer."),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .pipe(z.email("Enter a valid email address.")),
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

export type RegisterInput = Omit<
  z.infer<typeof registerSchema>,
  "confirmPassword"
>;
