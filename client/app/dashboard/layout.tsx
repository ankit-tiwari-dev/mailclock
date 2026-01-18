"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { signOut, useSession } from "next-auth/react"
import {
    Clock,
    LogOut,
    Menu,
    MoreVertical,
    Plus,
    Send,
    ChevronLeft,
    X
} from "lucide-react"
import { Button } from "@/components/ui/button"

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const { data: session, status } = useSession()
    const [isSidebarOpen, setIsSidebarOpen] = useState(false) // Mobile
    const [isDesktopSidebarOpen, setIsDesktopSidebarOpen] = useState(true) // Desktop
    const [stats, setStats] = useState({ scheduled: 0, sent: 0 })
    const pathname = usePathname()

    // Listen for sidebar toggle events from compose page
    useEffect(() => {
        const handleSidebarToggle = () => {
            const action = localStorage.getItem('toggleSidebar')
            if (action === 'toggle') {
                setIsDesktopSidebarOpen(prev => !prev)
                setIsSidebarOpen(prev => !prev)
                localStorage.removeItem('toggleSidebar')
            }
        }

        window.addEventListener('storage', handleSidebarToggle)
        return () => window.removeEventListener('storage', handleSidebarToggle)
    }, [])

    // Fetch stats for sidebar counts
    useEffect(() => {
        if (status !== "authenticated") return;

        const fetchStats = async () => {
            try {
                const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/stats`)
                const data = await response.json()
                setStats({ scheduled: data.scheduled || 0, sent: data.sent || 0 })
            } catch (error) {
                console.error('Error fetching stats:', error)
            }
        }

        fetchStats()
        const interval = setInterval(fetchStats, 5000) // Update every 5 seconds
        return () => clearInterval(interval)
    }, [status])

    if (status === "loading") {
        return <div className="min-h-screen bg-black flex items-center justify-center text-white">Loading Auth...</div>
    }

    if (status === "unauthenticated") {
        // Handle redirect in wrapper or page, but layout creates context
        // Ideally should be handled by middleware or page protection
    }

    return (
        <div className="min-h-screen bg-[#F9FAFB] text-slate-800 font-sans selection:bg-green-500/30 antialiased">
            {/* Mobile Sidebar Overlay */}
            {isSidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/20 backdrop-blur-sm z-20 md:hidden animate-in fade-in"
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside className={`fixed left-0 top-0 h-screen w-56 border-r border-slate-200 bg-white flex flex-col p-5 z-30 transition-transform duration-300 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} ${isDesktopSidebarOpen ? 'md:translate-x-0' : 'md:-translate-x-full'}`}>
                {/* Toggle Button Attached to Sidebar Edge */}
                <button
                    onClick={() => {
                        setIsDesktopSidebarOpen(prev => !prev)
                        setIsSidebarOpen(prev => !prev)
                    }}
                    className="absolute -right-3 top-6 w-6 h-6 bg-white border border-slate-200 shadow-md rounded-md flex items-center justify-center hover:bg-slate-50 text-slate-500 hover:text-slate-700 transition-all z-40"
                    aria-label="Toggle sidebar"
                >
                    <ChevronLeft className={`w-4 h-4 transition-transform duration-300 ${!isDesktopSidebarOpen ? 'rotate-180' : ''}`} />
                </button>

                {/* Logo */}
                <div className="mb-6">
                    <div className="flex items-center space-x-2">
                        <div className="w-8 h-8 bg-[#00A86B] rounded-lg flex items-center justify-center">
                            <span className="text-white font-bold text-xl">R</span>
                        </div>
                        <span className="text-xl font-bold text-slate-800 tracking-tight">ReachInbox</span>
                    </div>
                </div>

                {/* User Profile Card */}
                <div className="bg-white border border-slate-200 rounded-xl p-3 mb-4 group hover:shadow-sm transition-all cursor-default relative">
                    <div className="flex items-center space-x-2.5">
                        <div className="w-9 h-9 rounded-full overflow-hidden border border-slate-200 bg-slate-50 flex items-center justify-center flex-shrink-0">
                            {session?.user?.image ? (
                                <img src={session.user.image} alt="Avatar" className="w-full h-full object-cover" />
                            ) : (
                                <span className="text-xs font-bold text-slate-600">{session?.user?.name?.split(' ').map(n => n[0]).join('').toUpperCase() || 'U'}</span>
                            )}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-slate-900 truncate">{session?.user?.name || "Oliver Brown"}</p>
                            <p className="text-[10px] text-slate-500 truncate">{session?.user?.email || "oliver.brown@domain.io"}</p>
                        </div>
                        <ChevronLeft className="w-3.5 h-3.5 text-slate-400 -rotate-90 flex-shrink-0" />
                    </div>
                </div>

                {/* Compose Action */}
                <Link href="/dashboard/compose">
                    <Button className="w-full bg-white border-2 border-[#00A86B] hover:bg-[#00A86B]/5 text-[#00A86B] h-11 rounded-xl font-semibold text-sm transition-all mb-6 shadow-none">
                        Compose
                    </Button>
                </Link>

                {/* Navigation Core */}
                <div className="flex-1 space-y-6">
                    <div>
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-3 pl-1">Core</p>
                        <div className="space-y-1">
                            <Link href="/dashboard"
                                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-all group ${pathname === '/dashboard' && !pathname.includes('sent') ? 'bg-[#E8F5F1]' : 'hover:bg-slate-50'}`}
                            >
                                <div className="flex items-center space-x-2.5">
                                    <Clock className={`w-4 h-4 ${pathname === '/dashboard' ? 'text-slate-700' : 'text-slate-500'}`} />
                                    <span className={`text-sm font-medium ${pathname === '/dashboard' ? 'text-slate-900' : 'text-slate-700'}`}>Scheduled</span>
                                </div>
                                <span className="text-xs font-medium text-slate-500">{stats.scheduled}</span>
                            </Link>

                            <Link href="/dashboard/sent"
                                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-all group ${pathname.includes('sent') ? 'bg-[#E8F5F1]' : 'hover:bg-slate-50'}`}
                            >
                                <div className="flex items-center space-x-2.5">
                                    <Send className={`w-4 h-4 ${pathname.includes('sent') ? 'text-slate-700' : 'text-slate-500'}`} />
                                    <span className={`text-sm font-medium ${pathname.includes('sent') ? 'text-slate-900' : 'text-slate-700'}`}>Sent</span>
                                </div>
                                <span className="text-xs font-medium text-slate-500">{stats.sent}</span>
                            </Link>
                        </div>
                    </div>
                </div>

                <div className="pt-5 border-t border-slate-200 mt-auto">
                    <div
                        className="flex items-center space-x-2.5 px-3 py-2.5 hover:bg-rose-50 rounded-lg transition-colors group cursor-pointer"
                        onClick={() => signOut({ callbackUrl: '/' })}
                    >
                        <LogOut className="w-4 h-4 text-slate-400 group-hover:text-rose-500 transition-colors" />
                        <span className="text-sm font-medium text-slate-600 group-hover:text-rose-500">Sign Out</span>
                    </div>
                </div>
            </aside>

            <div className={`transition-all duration-300 min-h-screen ${isDesktopSidebarOpen ? 'md:pl-56' : 'md:pl-0'}`}>
                {/* Top Navbar */}
                {/* Floating Sidebar Toggle (Only visible when sidebar is closed AND not on compose page) */}
                {!isDesktopSidebarOpen && !isSidebarOpen && pathname !== '/dashboard/compose' && (
                    <button
                        className="fixed top-4 left-4 z-50 p-2 bg-white border border-slate-200 shadow-sm rounded-lg hover:bg-slate-50 text-slate-500 transition-all"
                        onClick={() => setIsDesktopSidebarOpen(true)}
                    >
                        <Menu className="w-5 h-5" />
                    </button>
                )}


                <main>
                    {children}
                </main>
            </div>
        </div>
    )
}
