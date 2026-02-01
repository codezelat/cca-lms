import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { StudentSubmission } from "@/components/assignments/student-submission";

export default async function AssignmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="container mx-auto py-8 px-4 max-w-5xl">
      <Suspense
        fallback={
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-terminal-accent" />
          </div>
        }
      >
        <StudentSubmission assignmentId={id} />
      </Suspense>
    </div>
  );
}
