"use client"

import { useSession, signIn } from "next-auth/react"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { Zap } from "lucide-react"

export default function Home() {
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === "authenticated") {
      router.push("/dashboard")
    }
  }, [status, router])

  if (status === "loading") {
    return <div className="min-h-screen bg-white flex items-center justify-center text-slate-900">Loading Auth...</div>
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-8 bg-[#0a0a0a] border border-slate-200 p-10 rounded-3xl text-center shadow-2xl">
        <div className="flex flex-col items-center">
          <div className="p-3 bg-blue-600 rounded-2xl shadow-[0_0_30px_rgba(37,99,235,0.4)] mb-6">
            <Zap className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl font-black tracking-tighter text-[#00A86B] italic uppercase">ReachInbox AI</h1>
          <p className="text-slate-500 mt-2 font-medium">The Intelligent Outreach Engine</p>
        </div>

        <div className="space-y-4">
          <button
            className="w-full py-4 rounded-xl bg-[#00A86B]/20 text-[#00A86B] font-bold text-lg hover:bg-slate-200 transition-all flex items-center justify-center"
            onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
          >
            <img src="https://www.vectorlogo.zone/logos/google/google-icon.svg" className="w-6 h-6 mr-3" alt="Google" />
            Sign in with Google
          </button>
        </div>
      </div>
    </div>
  )
}
