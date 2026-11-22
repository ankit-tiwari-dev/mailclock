import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { Logo } from "@/components/logo";
import { Notice } from "@/components/ui";
import { auth, enabledSocialProviders } from "@/lib/auth";

export const metadata = { title: "Sign in" };

export default async function Page(props: PageProps<"/login">) {
  const { reset } = await props.searchParams;
  if (await auth.api.getSession({ headers: await headers() })) redirect("/dashboard");
  return (
    <main className="grid min-h-dvh place-items-center px-5 py-12">
      <div className="w-full max-w-sm">
        <Link href="/" aria-label="Mailclock home">
          <Logo />
        </Link>
        <h1 className="mb-6 mt-8 text-2xl font-semibold">Sign in to Mailclock</h1>
        {reset === "1" && (
          <div className="mb-5">
            <Notice tone="success">Your password was changed. Sign in with the new one.</Notice>
          </div>
        )}
        <AuthForm mode="login" social={enabledSocialProviders} />
      </div>
    </main>
  );
}
