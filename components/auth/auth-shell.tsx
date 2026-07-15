import type { ReactNode } from "react";
import { CheckCircle2, MapPinned, RadioTower } from "lucide-react";

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-dvh bg-card lg:grid-cols-[1.05fr_0.95fr]">
      <section className="relative hidden overflow-hidden bg-brand-950 px-12 py-10 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 opacity-30 [background-image:radial-gradient(circle_at_20%_20%,#14968b_0,transparent_28%),radial-gradient(circle_at_85%_70%,#315e7c_0,transparent_32%)]" />
        <svg
          aria-hidden="true"
          className="absolute inset-x-0 top-1/2 h-80 w-full -translate-y-1/2 opacity-60"
          preserveAspectRatio="none"
          viewBox="0 0 900 400"
        >
          <path
            d="M-20 330 C120 210 240 345 375 220 S630 110 920 190"
            fill="none"
            stroke="#18314d"
            strokeWidth="56"
          />
          <path
            d="M-20 330 C120 210 240 345 375 220 S630 110 920 190"
            fill="none"
            stroke="#2bb6a8"
            strokeLinecap="round"
            strokeWidth="5"
          />
          <circle cx="374" cy="220" fill="#c5a03a" r="10" stroke="#fff" strokeWidth="4" />
          <circle cx="710" cy="143" fill="#2bb6a8" r="10" stroke="#fff" strokeWidth="4" />
        </svg>
        <div className="relative flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-md bg-teal-400 text-base font-black text-brand-950">
            M
          </span>
          <div>
            <p className="font-semibold">City Rentals</p>
            <p className="text-xs text-brand-100/65">Rental operations control</p>
          </div>
        </div>
        <div className="relative max-w-xl">
          <p className="text-xs font-semibold tracking-[0.18em] text-teal-400 uppercase">
            Calm operations. Clear decisions.
          </p>
          <h1 className="mt-4 text-4xl leading-[1.12] font-bold tracking-[-0.035em] xl:text-5xl">
            Know where every vehicle stands.
          </h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-brand-100/75">
            One operational view for live tracking, rentals, geofences, and the alerts that need your attention.
          </p>
          <div className="mt-10 grid grid-cols-3 gap-3">
            {[
              { icon: RadioTower, label: "Tracker health" },
              { icon: MapPinned, label: "Fleet location" },
              { icon: CheckCircle2, label: "Rental status" },
            ].map((item) => (
              <div
                className="rounded-lg border border-white/10 bg-white/[0.04] p-4 backdrop-blur-sm"
                key={item.label}
              >
                <item.icon className="size-5 text-teal-400" />
                <p className="mt-3 text-xs font-medium text-brand-100">{item.label}</p>
              </div>
            ))}
          </div>
        </div>
        <p className="relative text-xs text-brand-100/45">
          Location timestamps are displayed in Philippine Standard Time.
        </p>
      </section>
      <section className="flex items-center justify-center px-5 py-10 sm:px-10 lg:px-16">
        <div className="w-full max-w-md">{children}</div>
      </section>
    </main>
  );
}
