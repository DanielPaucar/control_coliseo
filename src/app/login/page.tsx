import { LoginView } from "./LoginView";

type LoginPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = (await searchParams) ?? {};

  const raw = params.error;
  const errorParam = Array.isArray(raw) ? raw[0] : raw ?? undefined;

  return <LoginView errorParam={errorParam} />;
}
