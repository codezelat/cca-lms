import { auth } from "@/lib/auth";
import { AuthProvider } from "@/components/auth-provider";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { FetchActivityProvider } from "@/components/ui/fetch-activity";
import { Navbar } from "@/components/navbar";
import StudentVisitTracker from "@/components/audit/student-visit-tracker";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  return (
    <AuthProvider session={session}>
      <FetchActivityProvider>
        <ConfirmProvider>
          <StudentVisitTracker />
          <Navbar />
          <main className="flex-1">{children}</main>
        </ConfirmProvider>
      </FetchActivityProvider>
    </AuthProvider>
  );
}
