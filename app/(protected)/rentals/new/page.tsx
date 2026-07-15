import { saveRentalAction } from "@/features/rentals";
import { rentalDefinition } from "@/features/rentals";
import { ResourceCreateScreen } from "@/features/shared";
export default function Page() {
  return (
    <ResourceCreateScreen
      action={saveRentalAction}
      definition={rentalDefinition}
    />
  );
}
