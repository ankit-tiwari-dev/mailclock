"use client"

import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import Link from "next/link"
import {
    AlertCircle,
    CheckCircle2,
    Search,
    Layers,
    Mail
} from "lucide-react"

export default function SentPage() {
    const { data: session, status } = useSession()
    const [jobs, setJobs] = useState<any[]>([])
    const [searchQuery, setSearchQuery] = useState('')

    // Redirect if not authenticated
    useEffect(() => {
        if (status === "unauthenticated") {
            window.location.href = "/login"
        }
    }, [status])

    // Fetch sent emails
    useEffect(() => {
        if (status !== "authenticated") return;

        const fetchJobs = async () => {
            try {
                const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/jobs`)
                const data = await response.json()
                // Filter only sent and failed emails
                const sentJobs = data.filter((job: any) => ['SENT', 'FAILED'].includes(job.status))
                setJobs(sentJobs)
            } catch (error) {
                console.error('Error fetching jobs:', error)
            }
        }

        fetchJobs()
        const interval = setInterval(fetchJobs, 5000) // Update every 5 seconds
        return () => clearInterval(interval)
    }, [status])

    const filteredJobs = jobs.filter(job => {
        if (!searchQuery) return true;
        const query = searchQuery.toLowerCase();
        return (
            job.data?.email?.toLowerCase().includes(query) ||
            job.data?.subject?.toLowerCase().includes(query)
        );
    });

    if (status === "loading") {
        return <div className="min-h-screen bg-white flex items-center justify-center text-slate-900">Loading...</div>
    }

    return (
        <div className="space-y-6 p-4 md:p-6">
            {/* Page Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Sent Emails</h1>
                    <p className="text-sm text-slate-500 mt-1">View history of all sent and failed emails</p>
                </div>
                <div className="flex items-center space-x-2 bg-slate-100 px-4 py-2 rounded-lg">
                    <Mail className="w-4 h-4 text-slate-600" />
                    <span className="text-sm font-semibold text-slate-700">{filteredJobs.length} Total</span>
                </div>
            </div>

            {/* Email History Table */}
            <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                <div className="px-6 py-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center space-x-3">
                        <div className="w-9 h-9 rounded-lg bg-slate-50 flex items-center justify-center border border-slate-200">
                            <Layers className="w-4 h-4 text-[#00A86B]" />
                        </div>
                        <div>
                            <h3 className="font-bold text-slate-900 text-xs">Email History</h3>
                            <p className="text-xs text-slate-500">All sent and failed email campaigns</p>
                        </div>
                    </div>
                    <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search by email or subject..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#00A86B]/20 transition-all"
                        />
                    </div>
                </div>

                <div className="divide-y divide-slate-100">
                    {filteredJobs.length === 0 ? (
                        <div className="p-12 text-center">
                            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Mail className="w-8 h-8 text-slate-300" />
                            </div>
                            <h3 className="text-slate-900 font-bold mb-1">No sent emails found</h3>
                            <p className="text-slate-500 text-xs">
                                {searchQuery ? 'Try a different search term.' : 'Your sent emails will appear here.'}
                            </p>
                        </div>
                    ) : (
                        filteredJobs.map((job) => (
                            <Link
                                key={job.id}
                                href={`/dashboard/email/${job.id}`}
                                className="block"
                            >
                                <div className="group px-6 py-4 hover:bg-slate-50 transition-colors flex items-center justify-between cursor-pointer">
                                    <div className="flex items-center space-x-4 min-w-0 flex-1">
                                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${job.status === 'SENT' ? 'bg-green-500' : 'bg-red-500'}`} />
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-bold text-slate-900 truncate">To: {job.recipient || job.data?.email || 'Unknown Recipient'}</p>
                                            <p className="text-xs text-slate-500 truncate">{job.subject || job.data?.subject || 'No Subject'}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center space-x-6 pl-4">
                                        <div className="text-right hidden md:block">
                                            <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide">Sent At</p>
                                            <p className="text-xs font-medium text-slate-700 tabular-nums">
                                                {new Date(job.sentAt || job.scheduledAt).toLocaleString(undefined, {
                                                    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
                                                })}
                                            </p>
                                        </div>
                                        <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide border flex items-center space-x-1.5 ${job.status === 'SENT'
                                            ? 'bg-green-50 border-green-100 text-green-600'
                                            : 'bg-red-50 border-red-100 text-red-600'
                                            }`}>
                                            {job.status === 'SENT' ? (
                                                <CheckCircle2 className="w-3.5 h-3.5" />
                                            ) : (
                                                <AlertCircle className="w-3.5 h-3.5" />
                                            )}
                                            <span>{job.status}</span>
                                        </div>
                                    </div>
                                </div>
                            </Link>
                        ))
                    )}
                </div>
            </section>
        </div>
    )
}
