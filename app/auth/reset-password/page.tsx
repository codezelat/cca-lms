import ResetPasswordPageClient from "@/components/auth/reset-password-page-client";

export const dynamic = "force-dynamic";

type ResetPasswordPageProps = {
  searchParams?: Promise<{
    token?: string | string[];
  }>;
};

function getFirstParamValue(value?: string | string[]) {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

export default async function ResetPasswordPage({
  searchParams,
}: ResetPasswordPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const initialToken = getFirstParamValue(resolvedSearchParams?.token) || null;

  return <ResetPasswordPageClient initialToken={initialToken} />;
}
