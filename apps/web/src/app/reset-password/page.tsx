import Link from "next/link";
import { Logo } from "@/components/logo";
import { ResetPasswordForm } from "@/components/password-reset-forms";

export const metadata = { title: "Choose a new password" };

export default async function Page(props: PageProps<"/reset-password">) {
  const { token, error } = await props.searchParams;
  return (
    <main className="grid min-h-dvh place-items-center px-5 py-12">
      <div className="w-full max-w-sm">
        <Link href="/" aria-label="Mailclock home">
          <Logo />
        </Link>
        <h1 className="mb-6 mt-8 text-2xl font-semibold">Choose a new password</h1>
        <ResetPasswordForm token={typeof token === "string" ? token : null} invalid={typeof error === "string"} />
      </div>
    </main>
  );
}
