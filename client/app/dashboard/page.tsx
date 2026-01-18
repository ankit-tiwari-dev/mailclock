"use client"

import { useState, useEffect } from "react"
import Link from 'next/link'
import {
    Activity,
    AlertCircle,
    CheckCircle2,
    Calendar,
    Layers,
    Plus,
    Search
} from "lucide-react"
import { useSession } from "next-auth/react"
import { Button } from "@/components/ui/button"
// Table imports if needed for job list, assumed handled by raw divs or previous code structure
// We will use standard HTML for list as per previous implementation to save imports

export default function Dashboard() {
    const { data: session, status } = useSession()
    const [jobs, setJobs] = useState<any[]>([])
    const [stats, setStats] = useState({ scheduled: 0, sent: 0, failed: 0, pending: 0 })
    const [systemStatus, setSystemStatus] = useState({ redis: 'connecting...', worker: '...' })
    const [activeTab, setActiveTab] = useState<'scheduled' | 'sent'>('scheduled')
    const [searchQuery, setSearchQuery] = useState('')

    // Redirect if not authenticated
    useEffect(() => {
        if (status === "unauthenticated") {
            window.location.href = "/login"
        }
    }, [status])

    // Fetch real-time feed
    useEffect(() => {
        if (status !== "authenticated") return;

        const interval = setInterval(() => {
            const baseUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/api\/?$/, '');

            const safeFetch = (endpoint: string, setter: (data: any) => void) => {
                fetch(`${baseUrl}${endpoint}`)
                    .then(res => {
                        if (!res.ok) throw new Error(`HTTP ${res.status}`);
                        return res.json();
                    })
                    .then(data => setter(data))
                    .catch(err => console.error(`Error fetching ${endpoint}:`, err.message));
            };

            safeFetch('/api/jobs', setJobs);
            safeFetch('/api/stats', setStats);
            safeFetch('/api/health', setSystemStatus);
        }, 2000)
        return () => clearInterval(interval)
    }, [status])

    const filteredJobs = jobs.filter(job => {
        // Tab Filter
        const matchesTab = activeTab === 'scheduled'
            ? ['PENDING', 'SENDING'].includes(job.status)
            : ['SENT', 'FAILED'].includes(job.status);

        if (!matchesTab) return false;

        // Search Filter
        if (!searchQuery) return true;
        const query = searchQuery.toLowerCase();
        return (
            job.data?.email?.toLowerCase().includes(query) ||
            job.data?.subject?.toLowerCase().includes(query)
        );
    });

    if (status === "loading") {
        return <div className="min-h-screen bg-white flex items-center justify-center text-white">Loading Auth...</div>
    }

    return (
        <div className="space-y-6 p-4 md:p-6">
            {/* Status Cards */}
            <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                        <Activity className="w-16 h-16 text-[#00A86B]" />
                    </div>
                    <div className="relative z-10">
                        <div className="flex items-center justify-between mb-3">
                            <div className="p-2 bg-[#00A86B]/10 rounded-lg">
                                <Activity className="w-5 h-5 text-[#00A86B]" />
                            </div>
                            <span className="text-[9px] font-bold bg-[#00A86B] text-white px-2 py-0.5 rounded-full uppercase tracking-wider">Live</span>
                        </div>
                        <h3 className="text-2xl font-bold text-slate-900 mb-1">{stats.sent}</h3>
                        <p className="text-xs font-medium text-slate-500">Emails Sent</p>
                    </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                        <Calendar className="w-16 h-16 text-blue-500" />
                    </div>
                    <div className="relative z-10">
                        <div className="flex items-center justify-between mb-3">
                            <div className="p-2 bg-blue-50 rounded-lg">
                                <Calendar className="w-5 h-5 text-blue-500" />
                            </div>
                        </div>
                        <h3 className="text-2xl font-bold text-slate-900 mb-1">{stats.scheduled}</h3>
                        <p className="text-xs font-medium text-slate-500">Scheduled</p>
                    </div>
                </div>

                {/* System Health Widget */}
                <div className="bg-white p-5 rounded-2xl text-slate-900 border border-slate-100 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
                    <div className="flex items-center justify-between relative z-10 h-full">
                        <div className="flex items-center space-x-3">
                            <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
                            <div>
                                <h4 className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide">System Health</h4>
                                <p className="text-sm font-semibold text-slate-900">{systemStatus.redis === 'active' ? 'Operational' : 'Disconnected'}</p>
                            </div>
                        </div>
                        <div className="h-8 w-[1px] bg-slate-100 mx-2" />
                        <div className="text-right">
                            <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide">Latency</p>
                            <p className="text-sm font-bold text-green-500 tabular-nums">12ms</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Main Action Component - Link to Compose */}
            <section className="flex justify-end">
                <Link href="/dashboard/compose">
                    <Button className="bg-[#00A86B] hover:bg-[#00925D] text-white shadow-sm px-6 py-5 rounded-xl font-semibold text-sm transition-all transform hover:-translate-y-0.5">
                        <Plus className="w-4 h-4 mr-2" /> New Dispatch
                    </Button>
                </Link>
            </section>

            {/* Live Feed Table */}
            <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                <div className="px-6 py-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center space-x-3">
                        <div className="w-9 h-9 rounded-lg bg-slate-50 flex items-center justify-center border border-slate-200">
                            <Layers className="w-4 h-4 text-[#00A86B]" />
                        </div>
                        <div>
                            <h3 className="font-bold text-slate-900 text-xs">Real-Time Dispatch Feed</h3>
                            <p className="text-xs text-slate-500">Monitoring all active and completed jobs</p>
                        </div>
                    </div>
                    <div className="flex items-center self-start md:self-auto space-x-2 bg-green-50 px-3 py-1 rounded-full border border-green-100">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                        <span className="text-[9px] text-green-700 font-bold uppercase tracking-wide">Live Syncing</span>
                    </div>
                </div>

                {/* Filter / Search Bar */}
                <div className="px-8 py-4 bg-slate-50/50 border-b border-slate-100 flex items-center space-x-4">
                    <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search campaigns..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#00A86B]/20 transition-all"
                        />
                    </div>
                    <div className="flex items-center space-x-2 border-l border-slate-200 pl-4 ml-auto">
                        <button
                            onClick={() => setActiveTab('scheduled')}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wide transition-colors ${activeTab === 'scheduled' ? 'bg-slate-200 text-slate-800' : 'text-slate-400 hover:text-slate-600'}`}
                        >
                            Scheduled
                        </button>
                        <button
                            onClick={() => setActiveTab('sent')}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wide transition-colors ${activeTab === 'sent' ? 'bg-slate-200 text-slate-800' : 'text-slate-400 hover:text-slate-600'}`}
                        >
                            History
                        </button>
                    </div>
                </div>

                <div className="divide-y divide-slate-100">
                    {filteredJobs.length === 0 ? (
                        <div className="p-12 text-center">
                            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Layers className="w-8 h-8 text-slate-300" />
                            </div>
                            <h3 className="text-slate-900 font-bold mb-1">No campaigns found</h3>
                            <p className="text-slate-500 text-xs">Start a new dispatch to see activity here.</p>
                        </div>
                    ) : (
                        filteredJobs.map((job) => (
                            <Link
                                key={job.id}
                                href={`/dashboard/email/${job.id}`}
                                className="block"
                            >
                                <div className="group px-6 md:px-8 py-4 hover:bg-slate-50 transition-colors flex items-center justify-between cursor-pointer">
                                    <div className="flex items-center space-x-4 min-w-0">
                                        <div className={`w-2 h-2 rounded-full ${job.status === 'SENT' ? 'bg-green-500' : job.status === 'FAILED' ? 'bg-red-500' : 'bg-amber-400'}`} />
                                        <div className="min-w-0">
                                            <p className="text-sm font-bold text-slate-900 truncate">To: {job.recipient || job.data?.email || 'Unknown Recipient'}</p>
                                            <p className="text-xs text-slate-500 truncate max-w-[200px] md:max-w-md">{job.subject || job.data?.subject || 'No Subject'}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center space-x-6 pl-4">
                                        <div className="text-right hidden md:block">
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Scheduled For</p>
                                            <p className="text-xs font-medium text-slate-700 tabular-nums">
                                                {new Date(job.sentAt || job.scheduledAt).toLocaleString(undefined, {
                                                    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
                                                })}
                                            </p>
                                        </div>
                                        <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${job.status === 'SENT'
                                            ? 'bg-green-50 border-green-100 text-green-600'
                                            : job.status === 'FAILED'
                                                ? 'bg-red-50 border-red-100 text-red-600'
                                                : 'bg-amber-50 border-amber-100 text-amber-600'
                                            }`}>
                                            {job.status}
                                        </div>
                                        {job.status === 'FAILED' && (
                                            <AlertCircle className="w-4 h-4 text-red-400" />
                                        )}
                                        {job.status === 'SENT' && (
                                            <CheckCircle2 className="w-4 h-4 text-green-400" />
                                        )}
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
