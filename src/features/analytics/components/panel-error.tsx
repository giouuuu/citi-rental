import { CircleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function PanelError({ title, message }: { title: string; message: string }) {
  return (
    <Alert variant="destructive">
      <CircleAlert />
      <AlertTitle>{title} unavailable</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
