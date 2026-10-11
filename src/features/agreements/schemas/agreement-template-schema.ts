import { z } from "zod";

import type { AgreementTemplate } from "@/features/agreements/lib/agreement-template";

const line = (max: number) => z.string().trim().max(max, `Keep this under ${max} characters.`);
const required = (max: number, message: string) => line(max).min(1, message);

const listSection = z.object({
  kind: z.literal("list"),
  heading: required(120, "Give this section a heading."),
  intro: line(1000),
  items: z.array(required(1000, "Fill in or remove this item.")).max(40),
  closing: line(2000),
});

const finesSection = z.object({
  kind: z.literal("fines"),
  heading: required(120, "Give this section a heading."),
  items: z
    .array(
      z.object({
        label: required(200, "Name the violation or remove this row."),
        amount: z
          .number({ error: "Enter the fine in pesos." })
          .finite()
          .min(0, "The fine can't be negative.")
          .max(10_000_000),
      }),
    )
    .max(40),
});

const labeledSection = z.object({
  kind: z.literal("labeled"),
  heading: required(120, "Give this section a heading."),
  items: z
    .array(
      z.object({
        label: required(120, "Add a label or remove this item."),
        text: required(1000, "Fill in or remove this item."),
      }),
    )
    .max(40),
});

const policy = (title: z.ZodString) =>
  z.object({
    title,
    intro: line(1000),
    sections: z
      .array(
        z.object({
          heading: required(160, "Give this part a heading."),
          body: required(1500, "Fill in or remove this part."),
        }),
      )
      .max(20),
    closing: line(1000),
  });

export const agreementTemplateSchema = z.object({
  title: required(120, "Give the agreement a title."),
  intro: line(1000),
  clauses: z.array(required(1500, "Fill in or remove this clause.")).max(60),
  sections: z
    .array(z.discriminatedUnion("kind", [listSection, finesSection, labeledSection]))
    .max(20),
  acknowledgement: line(1500),
  cancellation: policy(line(120)),
  // Templates saved before policies could be added have none.
  policies: z
    .array(policy(required(120, "Give this policy a title.")))
    .max(10)
    .default([]),
}) satisfies z.ZodType<AgreementTemplate>;

/** A saved template, or null when it is missing or no longer valid. */
export function parseAgreementTemplate(value: unknown): AgreementTemplate | null {
  if (value == null) return null;
  const parsed = agreementTemplateSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
