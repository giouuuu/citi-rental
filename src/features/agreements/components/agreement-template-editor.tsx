"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  LoaderCircle,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { saveAgreementTemplateAction } from "@/features/agreements/actions/save-agreement-template-action";
import { AgreementDocument } from "@/features/agreements/components/agreement-document";
import {
  type AgreementSection,
  type AgreementSectionKind,
  type AgreementTemplate,
  buildAgreementTerms,
  emptyAgreementSection,
  HOURS_TOKEN,
} from "@/features/agreements/lib/agreement-template";
import { agreementTemplateSchema } from "@/features/agreements/schemas/agreement-template-schema";
import type { AgreementTemplateSettings } from "@/features/agreements/services/get-agreement-template-settings";
import { ConfirmActionDialog } from "@/features/shared/components/confirm-action-dialog";
import { useMutationCoordinator } from "@/features/shared/components/mutation-provider";

type Errors = Record<string, string[]>;

const SECTION_KINDS: Record<
  AgreementSectionKind,
  { label: string; description: string }
> = {
  list: {
    label: "Bulleted list",
    description: "A heading, optional intro and closing, and bullet points.",
  },
  fines: {
    label: "Fines table",
    description: "Violations with a peso amount each.",
  },
  labeled: {
    label: "Labeled items",
    description: "Lines like “Fuel: return at the same level.”",
  },
};

function validate(template: AgreementTemplate): Errors {
  const parsed = agreementTemplateSchema.safeParse(template);
  if (parsed.success) return {};
  const errors: Errors = {};
  for (const issue of parsed.error.issues) {
    const path = issue.path.join(".");
    (errors[path] ??= []).push(issue.message);
  }
  return errors;
}

function move<T>(items: T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

function TextField({
  id,
  label,
  value,
  onChange,
  errors,
  description,
  placeholder,
  multiline = false,
  disabled,
  hideLabel = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  errors?: string[];
  description?: string;
  placeholder?: string;
  multiline?: boolean;
  disabled?: boolean;
  hideLabel?: boolean;
}) {
  const invalid = Boolean(errors?.length);
  const Control = multiline ? Textarea : Input;
  return (
    <Field data-invalid={invalid}>
      <FieldLabel className={hideLabel ? "sr-only" : undefined} htmlFor={id}>
        {label}
      </FieldLabel>
      <Control
        aria-invalid={invalid}
        disabled={disabled}
        id={id}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {description ? <FieldDescription>{description}</FieldDescription> : null}
      {invalid ? <FieldError errors={errors!.map((message) => ({ message }))} /> : null}
    </Field>
  );
}

/** Move up, move down and remove, for one row of a list. */
function RowControls({
  label,
  index,
  count,
  disabled,
  onMove,
  onRemove,
}: {
  label: string;
  index: number;
  count: number;
  disabled?: boolean;
  onMove: (to: number) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <Button
        aria-label={`Move ${label} up`}
        disabled={disabled || index === 0}
        size="icon-sm"
        type="button"
        variant="ghost"
        onClick={() => onMove(index - 1)}
      >
        <ArrowUp />
      </Button>
      <Button
        aria-label={`Move ${label} down`}
        disabled={disabled || index === count - 1}
        size="icon-sm"
        type="button"
        variant="ghost"
        onClick={() => onMove(index + 1)}
      >
        <ArrowDown />
      </Button>
      <Button
        aria-label={`Remove ${label}`}
        className="text-destructive hover:text-destructive"
        disabled={disabled}
        size="icon-sm"
        type="button"
        variant="ghost"
        onClick={onRemove}
      >
        <Trash2 />
      </Button>
    </div>
  );
}

/** A list of rows that can be added, reordered and removed. */
function RowList<T>({
  itemLabel,
  items,
  disabled,
  onChange,
  newItem,
  renderItem,
}: {
  itemLabel: string;
  items: T[];
  disabled?: boolean;
  onChange: (items: T[]) => void;
  newItem: () => T;
  renderItem: (item: T, index: number, update: (item: T) => void) => React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      {items.length ? (
        <ol className="space-y-3">
          {items.map((item, index) => (
            <li key={index} className="flex items-start gap-2">
              <span className="w-6 shrink-0 pt-2 text-right text-xs text-muted-foreground tabular-nums">
                {index + 1}.
              </span>
              <div className="min-w-0 flex-1">
                {renderItem(item, index, (next) =>
                  onChange(items.map((current, i) => (i === index ? next : current))),
                )}
              </div>
              <div className="pt-0.5">
                <RowControls
                  count={items.length}
                  disabled={disabled}
                  index={index}
                  label={`${itemLabel} ${index + 1}`}
                  onMove={(to) => onChange(move(items, index, to))}
                  onRemove={() => onChange(items.filter((_, i) => i !== index))}
                />
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted-foreground">
          No {itemLabel}s. This part is left off the agreement until you add one.
        </p>
      )}
      <Button
        disabled={disabled}
        size="sm"
        type="button"
        variant="outline"
        onClick={() => onChange([...items, newItem()])}
      >
        <Plus /> Add {itemLabel}
      </Button>
    </div>
  );
}

function SectionEditor({
  section,
  index,
  errors,
  disabled,
  onChange,
}: {
  section: AgreementSection;
  index: number;
  errors: Errors;
  disabled?: boolean;
  onChange: (section: AgreementSection) => void;
}) {
  const path = `sections.${index}`;
  const heading = (
    <TextField
      disabled={disabled}
      errors={errors[`${path}.heading`]}
      id={`${path}-heading`}
      label="Heading"
      placeholder="e.g. Insurance"
      value={section.heading}
      onChange={(heading) => onChange({ ...section, heading })}
    />
  );

  if (section.kind === "fines") {
    return (
      <div className="space-y-5">
        {heading}
        <RowList
          disabled={disabled}
          itemLabel="fine"
          items={section.items}
          newItem={() => ({ label: "", amount: 0 })}
          renderItem={(fine, row, update) => (
            <div className="grid items-start gap-2 sm:grid-cols-[1fr_9rem]">
              <TextField
                hideLabel
                disabled={disabled}
                errors={errors[`${path}.items.${row}.label`]}
                id={`${path}-fine-${row}-label`}
                label={`Fine ${row + 1} violation`}
                placeholder="Violation"
                value={fine.label}
                onChange={(label) => update({ ...fine, label })}
              />
              <Field data-invalid={Boolean(errors[`${path}.items.${row}.amount`])}>
                <FieldLabel className="sr-only" htmlFor={`${path}-fine-${row}-amount`}>
                  {`Fine ${row + 1} amount in pesos`}
                </FieldLabel>
                <Input
                  aria-invalid={Boolean(errors[`${path}.items.${row}.amount`])}
                  disabled={disabled}
                  id={`${path}-fine-${row}-amount`}
                  inputMode="decimal"
                  min={0}
                  placeholder="₱ amount"
                  type="number"
                  value={Number.isNaN(fine.amount) ? "" : fine.amount}
                  onChange={(event) =>
                    update({
                      ...fine,
                      amount: event.target.value === "" ? Number.NaN : Number(event.target.value),
                    })
                  }
                />
                {errors[`${path}.items.${row}.amount`] ? (
                  <FieldError
                    errors={errors[`${path}.items.${row}.amount`]!.map((message) => ({
                      message,
                    }))}
                  />
                ) : null}
              </Field>
            </div>
          )}
          onChange={(items) => onChange({ ...section, items })}
        />
      </div>
    );
  }

  if (section.kind === "labeled") {
    return (
      <div className="space-y-5">
        {heading}
        <RowList
          disabled={disabled}
          itemLabel="item"
          items={section.items}
          newItem={() => ({ label: "", text: "" })}
          renderItem={(item, row, update) => (
            <div className="grid items-start gap-2 sm:grid-cols-[12rem_1fr]">
              <TextField
                hideLabel
                disabled={disabled}
                errors={errors[`${path}.items.${row}.label`]}
                id={`${path}-item-${row}-label`}
                label={`Item ${row + 1} label`}
                placeholder="Label, e.g. Fuel"
                value={item.label}
                onChange={(label) => update({ ...item, label })}
              />
              <TextField
                hideLabel
                multiline
                disabled={disabled}
                errors={errors[`${path}.items.${row}.text`]}
                id={`${path}-item-${row}-text`}
                label={`Item ${row + 1} detail`}
                placeholder="Detail"
                value={item.text}
                onChange={(text) => update({ ...item, text })}
              />
            </div>
          )}
          onChange={(items) => onChange({ ...section, items })}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {heading}
      <TextField
        multiline
        description="Optional. Printed under the heading, before the bullets."
        disabled={disabled}
        errors={errors[`${path}.intro`]}
        id={`${path}-intro`}
        label="Intro"
        value={section.intro}
        onChange={(intro) => onChange({ ...section, intro })}
      />
      <RowList
        disabled={disabled}
        itemLabel="bullet"
        items={section.items}
        newItem={() => ""}
        renderItem={(item, row, update) => (
          <TextField
            hideLabel
            multiline
            disabled={disabled}
            errors={errors[`${path}.items.${row}`]}
            id={`${path}-item-${row}`}
            label={`Bullet ${row + 1}`}
            value={item}
            onChange={update}
          />
        )}
        onChange={(items) => onChange({ ...section, items })}
      />
      <TextField
        multiline
        description="Optional. Printed after the bullets."
        disabled={disabled}
        errors={errors[`${path}.closing`]}
        id={`${path}-closing`}
        label="Closing"
        value={section.closing}
        onChange={(closing) => onChange({ ...section, closing })}
      />
    </div>
  );
}

/**
 * Edit the rental agreement: every wording, and which parts it has. Saved
 * changes apply to agreements signed and bookings made afterwards.
 */
export function AgreementTemplateEditor({
  settings,
}: {
  settings: AgreementTemplateSettings;
}) {
  const router = useRouter();
  const { isPending, runMutation } = useMutationCoordinator();
  const [template, setTemplate] = useState<AgreementTemplate>(settings.template);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const dirty = JSON.stringify(template) !== JSON.stringify(settings.template);

  function change(next: AgreementTemplate) {
    setTemplate(next);
    // Once a save was refused, errors clear as each part is fixed.
    if (Object.keys(errors).length) setErrors(validate(next));
  }

  function patchCancellation(patch: Partial<AgreementTemplate["cancellation"]>) {
    change({ ...template, cancellation: { ...template.cancellation, ...patch } });
  }

  function save(next: AgreementTemplate | null) {
    if (next) {
      const found = validate(next);
      setErrors(found);
      if (Object.keys(found).length) {
        setFormError("Fill in or remove the highlighted parts, then save again.");
        return;
      }
    }
    setFormError(null);
    runMutation(async () => {
      const result = await saveAgreementTemplateAction(next);
      if (!result.success) {
        setErrors(result.fieldErrors ?? {});
        setFormError(result.message ?? "The agreement could not be saved.");
        return;
      }
      toast.success(
        next ? "Rental agreement saved." : "Rental agreement reset to the original wording.",
      );
      router.refresh();
    });
  }

  const previewTerms = buildAgreementTerms({
    freeCancellationHours: settings.freeCancellationHours,
    template,
    version: settings.version,
  });

  return (
    <Tabs className="gap-6" defaultValue="edit">
      <TabsList>
        <TabsTrigger value="edit">Edit</TabsTrigger>
        <TabsTrigger value="preview">Preview</TabsTrigger>
      </TabsList>

      <TabsContent className="space-y-6" value="edit">
        <Card>
          <CardHeader>
            <CardTitle>Opening</CardTitle>
            <CardDescription>
              The title and the clauses the renter agrees to first. These also
              open the terms shown on the booking form.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <TextField
              disabled={isPending}
              errors={errors.title}
              id="agreement-title"
              label="Title"
              value={template.title}
              onChange={(title) => change({ ...template, title })}
            />
            <TextField
              multiline
              disabled={isPending}
              errors={errors.intro}
              id="agreement-intro"
              label="Intro"
              value={template.intro}
              onChange={(intro) => change({ ...template, intro })}
            />
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Clauses</h3>
              <RowList
                disabled={isPending}
                itemLabel="clause"
                items={template.clauses}
                newItem={() => ""}
                renderItem={(clause, index, update) => (
                  <TextField
                    hideLabel
                    multiline
                    disabled={isPending}
                    errors={errors[`clauses.${index}`]}
                    id={`clause-${index}`}
                    label={`Clause ${index + 1}`}
                    value={clause}
                    onChange={update}
                  />
                )}
                onChange={(clauses) => change({ ...template, clauses })}
              />
            </div>
          </CardContent>
        </Card>

        {template.sections.map((section, index) => (
          <Card key={index}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                {section.heading.trim() || "Untitled section"}
                <Badge variant="outline">{SECTION_KINDS[section.kind].label}</Badge>
              </CardTitle>
              <CardDescription>{SECTION_KINDS[section.kind].description}</CardDescription>
              <CardAction>
                <RowControls
                  count={template.sections.length}
                  disabled={isPending}
                  index={index}
                  label={`section ${section.heading.trim() || index + 1}`}
                  onMove={(to) =>
                    change({ ...template, sections: move(template.sections, index, to) })
                  }
                  onRemove={() =>
                    change({
                      ...template,
                      sections: template.sections.filter((_, i) => i !== index),
                    })
                  }
                />
              </CardAction>
            </CardHeader>
            <CardContent>
              <SectionEditor
                disabled={isPending}
                errors={errors}
                index={index}
                section={section}
                onChange={(next) =>
                  change({
                    ...template,
                    sections: template.sections.map((current, i) =>
                      i === index ? next : current,
                    ),
                  })
                }
              />
            </CardContent>
          </Card>
        ))}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button disabled={isPending} type="button" variant="outline">
              <Plus /> Add section
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-72">
            {(Object.keys(SECTION_KINDS) as AgreementSectionKind[]).map((kind) => (
              <DropdownMenuItem
                key={kind}
                className="flex-col items-start gap-0.5"
                onSelect={() =>
                  change({
                    ...template,
                    sections: [...template.sections, emptyAgreementSection(kind)],
                  })
                }
              >
                <span className="font-medium">{SECTION_KINDS[kind].label}</span>
                <span className="text-xs text-muted-foreground">
                  {SECTION_KINDS[kind].description}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Card>
          <CardHeader>
            <CardTitle>Acknowledgement</CardTitle>
            <CardDescription>
              Printed above the signatures. Leave it blank to leave it off.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TextField
              hideLabel
              multiline
              disabled={isPending}
              errors={errors.acknowledgement}
              id="agreement-acknowledgement"
              label="Acknowledgement"
              value={template.acknowledgement}
              onChange={(acknowledgement) => change({ ...template, acknowledgement })}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cancellation policy</CardTitle>
            <CardDescription>
              Printed after the signatures and shown first on the booking form.
              Write {HOURS_TOKEN} where the free-cancellation window from
              Settings goes (now {settings.freeCancellationHours} hours). Clear
              every part to leave the policy off.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <TextField
              disabled={isPending}
              errors={errors["cancellation.title"]}
              id="cancellation-title"
              label="Title"
              value={template.cancellation.title}
              onChange={(title) => patchCancellation({ title })}
            />
            <TextField
              multiline
              disabled={isPending}
              errors={errors["cancellation.intro"]}
              id="cancellation-intro"
              label="Intro"
              value={template.cancellation.intro}
              onChange={(intro) => patchCancellation({ intro })}
            />
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Policy parts</h3>
              <RowList
                disabled={isPending}
                itemLabel="part"
                items={template.cancellation.sections}
                newItem={() => ({ heading: "", body: "" })}
                renderItem={(part, index, update) => (
                  <div className="space-y-2">
                    <TextField
                      hideLabel
                      disabled={isPending}
                      errors={errors[`cancellation.sections.${index}.heading`]}
                      id={`cancellation-part-${index}-heading`}
                      label={`Part ${index + 1} heading`}
                      placeholder="Heading"
                      value={part.heading}
                      onChange={(heading) => update({ ...part, heading })}
                    />
                    <TextField
                      hideLabel
                      multiline
                      disabled={isPending}
                      errors={errors[`cancellation.sections.${index}.body`]}
                      id={`cancellation-part-${index}-body`}
                      label={`Part ${index + 1} text`}
                      placeholder="Text"
                      value={part.body}
                      onChange={(body) => update({ ...part, body })}
                    />
                  </div>
                )}
                onChange={(sections) => patchCancellation({ sections })}
              />
            </div>
            <TextField
              multiline
              disabled={isPending}
              errors={errors["cancellation.closing"]}
              id="cancellation-closing"
              label="Closing"
              value={template.cancellation.closing}
              onChange={(closing) => patchCancellation({ closing })}
            />
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="preview">
        <div className="mx-auto max-w-3xl rounded-lg border border-border bg-background p-6">
          <p className="mb-6 rounded-md border-2 border-dashed border-muted-foreground/40 px-3 py-2 text-center text-xs font-semibold tracking-widest text-muted-foreground uppercase">
            Sample renter and car{dirty ? " · unsaved changes" : ""}
          </p>
          <AgreementDocument
            companySignatureUrl={null}
            parties={settings.sampleParties}
            renterSignatureUrl={null}
            signedAt={null}
            terms={previewTerms}
          />
        </div>
      </TabsContent>

      <div className="sticky bottom-0 z-10 -mx-1 space-y-3 border-t border-border bg-background/95 px-1 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        {formError ? (
          <Alert variant="destructive">
            <TriangleAlert />
            <AlertTitle>Unable to save</AlertTitle>
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {dirty
              ? "Unsaved changes. Agreements already signed keep their wording."
              : settings.isCustom
                ? "Your edited agreement is in use."
                : "The original agreement is in use."}
          </p>
          <div className="flex flex-wrap gap-2">
            {dirty ? (
              <Button
                disabled={isPending}
                type="button"
                variant="ghost"
                onClick={() => {
                  setTemplate(settings.template);
                  setErrors({});
                  setFormError(null);
                }}
              >
                Discard changes
              </Button>
            ) : null}
            {settings.isCustom ? (
              <ConfirmActionDialog
                confirmLabel="Reset agreement"
                description="The agreement goes back to the original wording, sections and fines. Agreements already signed keep their wording."
                title="Reset to the original agreement?"
                trigger={
                  <Button disabled={isPending} type="button" variant="outline">
                    <RotateCcw /> Reset to original
                  </Button>
                }
                onConfirm={() => save(null)}
              />
            ) : null}
            <Button
              disabled={isPending || !dirty}
              type="button"
              onClick={() => save(template)}
            >
              {isPending ? <LoaderCircle className="animate-spin" /> : <Save />}
              {isPending ? "Saving…" : "Save agreement"}
            </Button>
          </div>
        </div>
      </div>
    </Tabs>
  );
}
