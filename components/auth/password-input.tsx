"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function PasswordInput(props: Omit<React.ComponentProps<typeof Input>, "type">) {
  const [visible, setVisible] = React.useState(false);

  return (
    <div className="relative">
      <Input className="pr-11" type={visible ? "text" : "password"} {...props} />
      <Button
        aria-label={visible ? "Hide password" : "Show password"}
        className="absolute top-1/2 right-0.5 -translate-y-1/2 text-muted-foreground"
        onClick={() => setVisible((current) => !current)}
        size="icon-sm"
        type="button"
        variant="ghost"
      >
        {visible ? <EyeOff /> : <Eye />}
      </Button>
    </div>
  );
}
