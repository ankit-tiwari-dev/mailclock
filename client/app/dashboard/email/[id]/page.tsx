"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import {
    ArrowLeft,
    Star,
    Archive,
    Trash2,
    Download
} from "lucide-react"

export default function EmailViewPage() {
    const { data: session, status } = useSession()
    const params = useParams()
    const router = useRouter()
    const [email, setEmail] = useState<any>(null)
    const [loading, setLoading] = useState(true)

    const emailId = params.id

    // Fetch email details
    useEffect(() => {
        if (status !== "authenticated") return;

        const fetchEmail = async () => {
            try {
                const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/jobs/${emailId}`)
                const data = await response.json()
                setEmail(data)
            } catch (error) {
                console.error('Error fetching email:', error)
            } finally {
                setLoading(false)
            }
        }

        if (emailId) {
            fetchEmail()
        }
    }, [status, emailId])

    if (status === "loading" || loading) {
        return <div className="min-h-screen bg-white flex items-center justify-center text-slate-900">Loading...</div>
    }

    if (!email) {
        return (
            <div className="min-h-screen bg-white flex items-center justify-center">
                <div className="text-center">
                    <h2 className="text-xl font-bold text-slate-900 mb-2">Email not found</h2>
                    <button
                        onClick={() => router.back()}
                        className="text-[#00A86B] hover:underline text-sm"
                    >
                        Go back
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-[#F9FAFB]">
            {/* Header */}
            <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
                <div className="flex items-center space-x-4 flex-1 min-w-0">
                    <button
                        onClick={() => router.back()}
                        className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5 text-slate-700" />
                    </button>
                    <h1 className="text-sm font-medium text-slate-900 truncate">
                        {email.data?.subject || 'No Subject'}
                    </h1>
                </div>
                <div className="flex items-center space-x-2">
                    <button className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                        <Star className="w-5 h-5 text-slate-400" />
                    </button>
                    <button className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                        <Archive className="w-5 h-5 text-slate-400" />
                    </button>
                    <button className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                        <Trash2 className="w-5 h-5 text-slate-400" />
                    </button>
                    {session?.user?.image && (
                        <img
                            src={session.user.image}
                            alt="User"
                            className="w-8 h-8 rounded-full border border-slate-200"
                        />
                    )}
                </div>
            </div>

            {/* Email Content */}
            <div className="max-w-4xl mx-auto p-6">
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    {/* Sender Info */}
                    <div className="p-6 border-b border-slate-100">
                        <div className="flex items-start justify-between">
                            <div className="flex items-start space-x-3">
                                <div className="w-10 h-10 rounded-full bg-[#00A86B] flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                                    {email.data?.email?.charAt(0).toUpperCase() || 'A'}
                                </div>
                                <div>
                                    <div className="flex items-center space-x-2">
                                        <p className="text-sm font-semibold text-slate-900">
                                            {email.data?.email?.split('@')[0] || 'Sender'}
                                        </p>
                                        <span className="text-xs text-slate-500">
                                            &lt;{email.data?.email || 'sender@example.com'}&gt;
                                        </span>
                                    </div>
                                    <p className="text-xs text-slate-500">to me</p>
                                </div>
                            </div>
                            <p className="text-xs text-slate-500">
                                {email.processedAt ? new Date(email.processedAt).toLocaleString(undefined, {
                                    month: 'short',
                                    day: 'numeric',
                                    hour: 'numeric',
                                    minute: '2-digit',
                                    hour12: true
                                }) : 'Just now'}
                            </p>
                        </div>
                    </div>

                    {/* Email Body */}
                    <div className="p-6">
                        <div
                            className="prose prose-sm max-w-none text-slate-700"
                            dangerouslySetInnerHTML={{ __html: email.data?.body || '<p>No content</p>' }}
                        />
                    </div>

                    {/* Attachments (if any) */}
                    {email.data?.attachments && email.data.attachments.length > 0 && (
                        <div className="px-6 pb-6">
                            <p className="text-xs font-semibold text-slate-600 mb-3">
                                {email.data.attachments.length} Attachment{email.data.attachments.length > 1 ? 's' : ''}
                            </p>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                {email.data.attachments.map((attachment: any, index: number) => (
                                    <div
                                        key={index}
                                        className="border border-slate-200 rounded-lg p-3 hover:bg-slate-50 transition-colors group"
                                    >
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                                                <span className="text-xs font-bold text-blue-600">
                                                    {attachment.filename?.split('.').pop()?.toUpperCase() || 'FILE'}
                                                </span>
                                            </div>
                                            <button className="p-1 hover:bg-slate-100 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                                                <Download className="w-4 h-4 text-slate-500" />
                                            </button>
                                        </div>
                                        <p className="text-xs font-medium text-slate-900 truncate">
                                            {attachment.filename || 'Attachment'}
                                        </p>
                                        <p className="text-[10px] text-slate-500">
                                            {attachment.size ? `${(attachment.size / 1024).toFixed(1)} KB` : 'N/A'}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Email Info */}
                <div className="mt-4 bg-white rounded-xl border border-slate-200 p-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                        <div>
                            <p className="text-slate-500 font-medium mb-1">Status</p>
                            <p className={`font-semibold ${email.status === 'SENT' ? 'text-green-600' : 'text-red-600'}`}>
                                {email.status}
                            </p>
                        </div>
                        <div>
                            <p className="text-slate-500 font-medium mb-1">Job ID</p>
                            <p className="font-mono text-slate-700">{email.id?.substring(0, 8)}...</p>
                        </div>
                        <div>
                            <p className="text-slate-500 font-medium mb-1">Scheduled For</p>
                            <p className="text-slate-700">
                                {email.data?.scheduledTime ? new Date(email.data.scheduledTime).toLocaleString() : 'Immediate'}
                            </p>
                        </div>
                        <div>
                            <p className="text-slate-500 font-medium mb-1">Recipient</p>
                            <p className="text-slate-700 truncate">{email.data?.email}</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
