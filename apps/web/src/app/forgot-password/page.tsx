import Link from "next/link";
import { Logo } from "@/components/logo";
import { ForgotPasswordForm } from "@/components/password-reset-forms";

export const metadata = { title: "Reset your password" };

export default function Page() {
  return (
    <main className="grid min-h-dvh place-items-center px-5 py-12">
      <div className="w-full max-w-sm">
        <Link href="/" aria-label="Mailclock home">
          <Logo />
        </Link>
        <h1 className="mb-2 mt-8 text-2xl font-semibold">Reset your password</h1>
        <p className="mb-6 text-sm text-ink-soft">Enter your account&apos;s email and we&apos;ll send you a link to choose a new password.</p>
        <ForgotPasswordForm />
      </div>
    </main>
  );
}
