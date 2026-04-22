import { DefaultSession, DefaultUser } from "next-auth";
import { AccountStatus, UserRole } from "@/generated/prisma";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: UserRole;
    } & DefaultSession["user"];
  }

  interface User extends DefaultUser {
    role: UserRole;
    status?: AccountStatus;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: UserRole;
    accountStatus?: AccountStatus;
    userValidatedAt?: number;
  }
}
