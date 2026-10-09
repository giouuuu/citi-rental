import { reviewDefinition, saveReviewAction } from "@/features/reviews";
import { ResourceCreateScreen } from "@/features/shared";

export default function Page() {
  return (
    <ResourceCreateScreen
      action={saveReviewAction}
      definition={reviewDefinition}
      initialValues={{ source: "facebook" }}
    />
  );
}
