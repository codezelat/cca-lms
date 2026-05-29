import LoginPageClient from "@/components/auth/login-page-client";

export const dynamic = "force-dynamic";

type LoginPageProps = {
  searchParams?: Promise<{
    callbackUrl?: string | string[];
  }>;
};

function getFirstParamValue(value?: string | string[]) {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const callbackUrl =
    getFirstParamValue(resolvedSearchParams?.callbackUrl) || "/dashboard";

  return <LoginPageClient initialCallbackUrl={callbackUrl} />;
}
