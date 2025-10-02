export type AppUserRole = "admin" | "financiero" | "guardiania";

export const ROLE_LABELS: Record<AppUserRole, string> = {
  admin: "Administrador",
  financiero: "Financiero",
  guardiania: "Guardianía",
};
