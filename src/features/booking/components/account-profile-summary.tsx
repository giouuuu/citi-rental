import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type AccountProfileSummaryProps = {
  fullName: string;
  email?: string;
  role?: string;
  avatarUrl?: string;
  initials: string;
};

export function AccountProfileSummary({
  fullName,
  email,
  role,
  avatarUrl,
  initials,
}: AccountProfileSummaryProps) {
  return (
    <section
      aria-labelledby="account-profile-heading"
      className="rounded-xl border border-border bg-card p-5 sm:p-6"
    >
      <h2 className="sr-only" id="account-profile-heading">
        Profile
      </h2>
      <div className="flex items-center gap-4">
        <Avatar className="size-16">
          {avatarUrl ? (
            <AvatarImage alt="" referrerPolicy="no-referrer" src={avatarUrl} />
          ) : null}
          <AvatarFallback className="bg-teal-500 text-lg font-bold text-brand-950">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold text-brand-950">
            {fullName}
          </p>
          {email ? (
            <p className="truncate text-sm text-muted-foreground">{email}</p>
          ) : null}
          {role ? (
            <p className="mt-1 text-xs tracking-wide text-muted-foreground uppercase">
              {role}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
