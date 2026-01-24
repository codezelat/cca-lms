import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Login",
  description:
    "Sign in to access Codezela Career Accelerator Learning Management System",
  robots: {
    index: false,
    follow: false,
  },
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
