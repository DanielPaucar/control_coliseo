import type { DefaultSession, DefaultUser } from "next-auth";
import type { JWT } from "next-auth/jwt";
import type { AppUserRole } from "./auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      role?: AppUserRole;
      groups?: string[];
    };
  }

  interface User extends DefaultUser {
    role?: AppUserRole;
    groups?: string[];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: AppUserRole;
    groups?: string[];
  }
}
