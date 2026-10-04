import { z } from "zod";

/** `YYYY-MM-DD`, the shape a native date input and Postgres `date` share. */
export const requiredDate = (label: string) =>
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, `${label} is required.`);

export const optionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date.")
  .optional();

/** BIR TIN: 9 digits plus an optional 3-5 digit branch code. */
export const TIN_PATTERN = /^[0-9]{3}-?[0-9]{3}-?[0-9]{3}(-?[0-9]{3,5})?$/;

export const optionalTin = z
  .string()
  .trim()
  .regex(TIN_PATTERN, "Use the 000-000-000 or 000-000-000-00000 format.")
  .optional();
