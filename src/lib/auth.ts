import AzureADProvider from "next-auth/providers/azure-ad";
import type { NextAuthOptions } from "next-auth";
import type { AppUserRole } from "@/types/auth";

const GROUP_ROLE_MAP: Record<string, AppUserRole> = {
  "e10a3003-546f-4cd3-8236-d6c46b96c3f2": "admin",
  "31474537-b620-4b3d-b47e-92df19199e08": "financiero",
  "9f5205f6-8328-4393-a6f5-95fd3330315f": "guardiania",
};

const REQUIRED_ENV_VARS = ["CLIENT_ID", "CLIENT_SECRET", "TENANT_ID", "AUTH_SECRET"] as const;

REQUIRED_ENV_VARS.forEach((key) => {
  if (!process.env[key]) {
    throw new Error(`Configuración faltante: define ${key} en el archivo .env`);
  }
});

function resolveRoleFromGroups(groups?: unknown): AppUserRole | undefined {
  if (!Array.isArray(groups)) {
    return undefined;
  }

  for (const groupId of groups) {
    if (typeof groupId !== "string") {
      continue;
    }
    const role = GROUP_ROLE_MAP[groupId];
    if (role) {
      return role;
    }
  }

  return undefined;
}

export const authOptions: NextAuthOptions = {
  secret: process.env.AUTH_SECRET,
  providers: [
    AzureADProvider({
      clientId: process.env.CLIENT_ID as string,
      clientSecret: process.env.CLIENT_SECRET as string,
      tenantId: process.env.TENANT_ID as string,
      authorization: {
        params: {
          scope: "openid profile email offline_access",
        },
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, profile }) {
      const groups = (profile as { groups?: unknown })?.groups;
      const role = resolveRoleFromGroups(groups);

      if (Array.isArray(groups)) {
        token.groups = groups.filter((groupId): groupId is string => typeof groupId === "string");
      }

      if (role) {
        token.role = role;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.role = token.role;
        if (token.groups) {
          session.user.groups = token.groups;
        }
      }

      return session;
    },
  },
  session: {
    strategy: "jwt",
  },
  debug: process.env.NODE_ENV === "development",
};
