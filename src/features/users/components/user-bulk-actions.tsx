"use client";

import { useState } from "react";
import { Ban, CheckCircle2, UserCog } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Field, FieldLabel } from "@/components/ui/field";
import { ConfirmActionDialog } from "@/features/shared/components/confirm-action-dialog";
import { useMutationCoordinator } from "@/features/shared/components/mutation-provider";
import { useResourceSelection } from "@/features/shared/components/resource-selection";
import {
  bulkUpdateUsersAction,
  type BulkUserChange,
} from "@/features/users/actions/bulk-update-users-action";

const ROLE_OPTIONS = [
  { value: "owner", label: "Owner" },
  { value: "admin", label: "Admin" },
  { value: "staff", label: "Staff" },
  { value: "customer", label: "Customer" },
];

function usersLabel(count: number) {
  return `${count} user${count === 1 ? "" : "s"}`;
}

/** Role and access changes for the rows checked in the staff users table. */
export function UserBulkActions() {
  const { ids, clear } = useResourceSelection();
  const { isPending, runMutation } = useMutationCoordinator();
  const [role, setRole] = useState("");
  const [roleError, setRoleError] = useState("");
  const [disableError, setDisableError] = useState("");
  const [activateError, setActivateError] = useState("");

  function apply(change: BulkUserChange, onError: (message: string) => void, verb: string) {
    runMutation(async () => {
      const result = await bulkUpdateUsersAction({ ids, change });
      if (!result.success) {
        onError(result.message);
        return;
      }
      onError("");
      toast.success(`${verb} ${usersLabel(result.data?.count ?? ids.length)}.`);
      clear();
    });
  }

  return (
    <>
      <ConfirmActionDialog
        confirmDisabled={!role}
        confirmLabel="Change role"
        description={`The new role applies to ${usersLabel(ids.length)}. Owners and admins get the ops app; staff and customers don't.`}
        error={roleError}
        icon={UserCog}
        onConfirm={() =>
          apply(
            { role: role as "owner" | "admin" | "staff" | "customer" },
            setRoleError,
            "Changed the role of",
          )
        }
        title="Change role?"
        trigger={
          <Button disabled={isPending} size="sm" variant="outline">
            <UserCog /> Change role
          </Button>
        }
        variant="default"
      >
        <Field>
          <FieldLabel htmlFor="bulk-role">New role</FieldLabel>
          <Combobox
            id="bulk-role"
            onValueChange={setRole}
            options={ROLE_OPTIONS}
            placeholder="Choose a role"
            value={role}
          />
        </Field>
      </ConfirmActionDialog>
      <Button
        disabled={isPending}
        onClick={() => apply({ is_active: true }, setActivateError, "Activated")}
        size="sm"
        variant="outline"
      >
        <CheckCircle2 /> Activate
      </Button>
      <ConfirmActionDialog
        cancelLabel="Keep access"
        confirmLabel="Disable access"
        description={`${ids.length === 1 ? "This user loses" : `These ${ids.length} users lose`} access to the app until reactivated. Their history stays.`}
        error={disableError}
        icon={Ban}
        onConfirm={() => apply({ is_active: false }, setDisableError, "Disabled")}
        title="Disable access?"
        trigger={
          <Button disabled={isPending} size="sm" variant="outline">
            <Ban /> Disable
          </Button>
        }
      />
      {activateError ? (
        <p className="basis-full text-sm text-destructive" role="alert">
          {activateError}
        </p>
      ) : null}
    </>
  );
}
