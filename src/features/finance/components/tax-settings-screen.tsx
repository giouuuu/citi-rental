import { PageHeader } from "@/components/design-system/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RestampVatForm, TaxSettingsForm } from "@/features/finance/components/tax-settings-form";
import { pct } from "@/features/finance/lib/income-tax";
import { taxSettingsToForm } from "@/features/finance/schemas/tax-settings-schema";
import { getTaxSettings } from "@/features/finance/services/finance-service";
import { formatPhpExact } from "@/features/shared/lib/money";

export async function TaxSettingsScreen() {
  const settings = await getTaxSettings();
  const brackets = [...settings.graduatedBrackets].sort((a, b) => a.over - b.over);

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: "Finance", href: "/finance" },
          { label: "Tax settings" },
        ]}
        description="Registration facts and the rates the statement uses. Owner only."
        title="Tax settings"
      />
      <TaxSettingsForm defaults={taxSettingsToForm(settings)} />
      <RestampVatForm vatRegistered={settings.vatRegistered} />
      <Card>
        <CardHeader>
          <CardTitle>Graduated income tax table</CardTitle>
          <CardDescription>
            Annual rates for individuals (TRAIN, 2023 onward). Stored in the database; ask a developer to update it if
            the law changes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table aria-label="Graduated income tax table">
            <TableHeader>
              <TableRow>
                <TableHead>Taxable income over</TableHead>
                <TableHead className="text-right">Base tax</TableHead>
                <TableHead className="text-right">Plus, on the excess</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {brackets.map((bracket) => (
                <TableRow key={bracket.over}>
                  <TableCell className="font-mono tabular-nums">{formatPhpExact(bracket.over)}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{formatPhpExact(bracket.base)}</TableCell>
                  <TableCell className="text-right tabular-nums">{pct(bracket.rate)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
