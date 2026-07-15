import { z } from "zod";

export const requiredText = (label: string, max = 200) =>
  z.string().trim().min(1, `${label} is required.`).max(max);

export const optionalText = (max = 2000) =>
  z.string().trim().max(max).optional();

export const optionalEmail = z
  .union([z.email("Enter a valid email address."), z.literal("")])
  .optional();
export const optionalUrl = z
  .union([z.url("Enter a valid URL."), z.literal("")])
  .optional();
export const optionalUuid = z.uuid("Select a valid record.").optional();
export const optionalNumber = (minimum = 0) =>
  z.coerce.number().min(minimum).optional();
export const requiredNumber = (label: string, minimum = 0) =>
  z.coerce.number().min(minimum, `${label} must be ${minimum} or greater.`);
