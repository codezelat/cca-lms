import { Metadata } from "next";

export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Codezela Career Accelerator - Your learning dashboard",
  robots: {
    index: false,
    follow: false,
  },
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
