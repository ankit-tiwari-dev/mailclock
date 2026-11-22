import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { Logo } from "@/components/logo";
import { auth, enabledSocialProviders } from "@/lib/auth";

export const metadata = { title: "Sign in" };

export default async function Page() {
  if (await auth.api.getSession({ headers: await headers() })) redirect("/dashboard");
  return (
    <main className="grid min-h-dvh place-items-center px-5 py-12">
      <div className="w-full max-w-sm">
        <Link href="/" aria-label="Mailclock home">
          <Logo />
        </Link>
        <h1 className="mb-6 mt-8 text-2xl font-semibold">Sign in to Mailclock</h1>
        <AuthForm mode="login" social={enabledSocialProviders} />
      </div>
    </main>
  );
}
