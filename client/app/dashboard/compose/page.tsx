"use client"

import { useState, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import Papa from "papaparse"
import {
    ArrowLeft,
    ChevronDown,
    Clock,
    Paperclip,
    UploadCloud,
    RotateCcw,
    RotateCw,
    Type,
    Bold,
    Italic,
    Underline,
    AlignLeft,
    List,
    Link as LinkIcon,
    Image as ImageIcon,
    Quote,
    Code,
    Calendar,
    X
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useSession } from "next-auth/react"

export default function ComposePage() {
    const router = useRouter()
    const { data: session } = useSession()
    const [previewEmails, setPreviewEmails] = useState<string[]>([])
    const [file, setFile] = useState<File | null>(null)
    const [isUploading, setIsUploading] = useState(false)

    // State
    const [subject, setSubject] = useState("")
    const [body, setBody] = useState("")
    const [delay, setDelay] = useState(2)
    const [hourlyLimit, setHourlyLimit] = useState(50)
    const [sendAt, setSendAt] = useState(new Date().toISOString().slice(0, 16))
    const [detectedEmails, setDetectedEmails] = useState<number>(0)
    const [showSendLater, setShowSendLater] = useState(false)
    const [activeFormats, setActiveFormats] = useState<string[]>([])

    const imageInputRef = useRef<HTMLInputElement>(null)
    const sendLaterRef = useRef<HTMLDivElement>(null)

    // Handle back button click to toggle sidebar
    const handleBackClick = () => {
        localStorage.setItem('toggleSidebar', 'toggle')
        window.dispatchEvent(new Event('storage'))
    }

    // Close popover when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (sendLaterRef.current && !sendLaterRef.current.contains(event.target as Node)) {
                setShowSendLater(false)
            }
        }
        document.addEventListener("mousedown", handleClickOutside)
        return () => document.removeEventListener("mousedown", handleClickOutside)
    }, [])

    const checkFormats = () => {
        if (typeof window === 'undefined') return
        const formats = ['bold', 'italic', 'underline', 'justifyLeft', 'insertUnorderedList']
        const active = formats.filter(format => document.queryCommandState(format))
        setActiveFormats(active)
    }

    const handleFormat = (command: string, value?: string) => {
        if (command === 'createLink') {
            let url = prompt('Enter link URL:', 'https://')
            if (url) {
                if (!url.match(/^https?:\/\//)) url = 'https://' + url
                document.execCommand(command, false, url)
            }
        } else if (command === 'insertImage') {
            imageInputRef.current?.click()
        } else if (command === 'insertCode') {
            const selection = window.getSelection();
            const text = selection ? selection.toString() : '';
            const html = ` <code style="background-color: #f1f5f9; padding: 2px 4px; border-radius: 4px; font-family: monospace;">${text || 'code'}</code>&nbsp;`;
            document.execCommand('insertHTML', false, html);
        } else {
            document.execCommand(command, false, value)
        }
        checkFormats()
    }

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) {
            const reader = new FileReader()
            reader.onload = (e) => {
                const imgUrl = e.target?.result as string
                setBody(prev => prev + `<br /><img src="${imgUrl}" alt="uploaded image" style="max-width: 100%; margin-top: 10px;" /><br />`)
            }
            reader.readAsDataURL(file)
        }
    }

    const handleFileUpload = (e: any) => {
        const uploadedFile = e.target.files[0]
        setFile(uploadedFile)

        if (uploadedFile) {
            Papa.parse(uploadedFile, {
                header: true,
                skipEmptyLines: true,
                complete: (results) => {
                    const allEmails = results.data.map((row: any) => row.email).filter(Boolean)
                    setDetectedEmails(allEmails.length)
                    setPreviewEmails(allEmails.slice(0, 3))
                }
            })
        }
    }

    const startBatchJob = async () => {
        if (!file && detectedEmails === 0) {
            alert("Please upload a CSV file with email addresses.")
            return
        }

        if (!subject.trim()) {
            alert("Please enter an email subject.")
            return
        }

        if (!body.trim()) {
            alert("Please enter an email body.")
            return
        }

        if (showSendLater) {
            const selectedDate = new Date(sendAt).getTime()
            const now = new Date().getTime()
            if (selectedDate < now) {
                alert("You cannot schedule emails in the past. Please select a future time.")
                setIsUploading(false)
                return
            }
        }

        setIsUploading(true)

        try {
            if (file) {
                Papa.parse(file, {
                    header: true,
                    skipEmptyLines: true,
                    complete: async (results) => {
                        const emails = results.data.map((row: any) => row.email).filter(Boolean)

                        if (emails.length === 0) {
                            alert("No valid emails found in CSV file.")
                            setIsUploading(false)
                            return
                        }

                        console.log("Scheduling emails:", emails)

                        try {
                            const response = await fetch('http://localhost:4000/api/schedule', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    emails,
                                    subject,
                                    body,
                                    sendAt,
                                    delay,
                                    hourlyLimit,
                                    userId: session?.user?.email || 'demo@reachinbox.ai'
                                })
                            })

                            const data = await response.json()

                            if (!response.ok) {
                                throw new Error(data.error || 'Failed to schedule emails')
                            }

                            console.log("✅ Successfully scheduled:", data)
                            alert(`Successfully scheduled ${emails.length} emails!`)
                            router.push('/dashboard')
                        } catch (error: any) {
                            console.error("❌ Scheduling error:", error)
                            alert(`Error: ${error.message}`)
                        } finally {
                            setIsUploading(false)
                        }
                    },
                    error: (error) => {
                        console.error("CSV Parse Error:", error)
                        alert("Failed to parse CSV file. Please check the format.")
                        setIsUploading(false)
                    }
                })
            }
        } catch (error: any) {
            console.error("Error:", error)
            alert(`Error: ${error.message}`)
            setIsUploading(false)
        }
    }

    return (
        <div className="flex flex-col h-screen bg-white font-sans text-slate-800 overflow-hidden">

            {/* --- HEADER --- */}
            <header className="flex-none border-b border-slate-200 bg-white z-20">
                <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button onClick={handleBackClick} className="p-1 -ml-2 rounded-full hover:bg-slate-100 transition-colors">
                            <ArrowLeft className="w-5 h-5 text-slate-600" />
                        </button>
                        <h1 className="text-xl font-medium text-slate-800">Compose New Email</h1>
                    </div>

                    <div className="flex items-center gap-2 sm:gap-4 relative">
                        {/* Action Icons */}
                        <div className="flex items-center gap-2">
                            <button className="w-9 h-9 rounded-full border border-green-600 flex items-center justify-center text-green-600 hover:bg-green-50 transition-colors">
                                <Paperclip className="w-4 h-4" />
                            </button>
                            <div className="relative" ref={sendLaterRef}>
                                <button
                                    onClick={() => setShowSendLater(!showSendLater)}
                                    className={`w-9 h-9 rounded-full border border-green-600 flex items-center justify-center transition-colors ${showSendLater ? 'text-green-600 bg-green-50' : 'text-green-600 hover:bg-green-50'}`}
                                >
                                    <Clock className="w-4 h-4" />
                                </button>

                                {/* Send Later Popover */}
                                {showSendLater && (
                                    <div className="absolute top-full right-0 mt-3 w-72 sm:w-80 bg-white rounded-xl shadow-2xl border border-slate-100 z-50 animate-in fade-in zoom-in-95 duration-200 overflow-hidden">
                                        <div className="p-4">
                                            <h3 className="text-sm font-semibold text-slate-900 mb-4">Send Later</h3>
                                            <div className="relative mb-4">
                                                <input
                                                    type="datetime-local"
                                                    min={new Date().toISOString().slice(0, 16)}
                                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2.5 px-3 text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500"
                                                    value={sendAt}
                                                    onChange={(e) => setSendAt(e.target.value)}
                                                />
                                                <Calendar className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
                                            </div>
                                            <div className="space-y-1">
                                                {['Tomorrow', 'Tomorrow, 10:00 AM', 'Tomorrow, 11:00 AM', 'Tomorrow, 3:00 PM'].map((opt) => (
                                                    <button key={opt} className="w-full text-left px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-md transition-colors font-medium">
                                                        {opt}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="bg-slate-50 px-4 py-3 flex items-center justify-between border-t border-slate-100">
                                            <button
                                                className="text-xs font-semibold text-slate-500 hover:text-slate-800"
                                                onClick={() => setShowSendLater(false)}
                                            >
                                                Cancel
                                            </button>
                                            <Button
                                                className="bg-white border border-green-600 hover:bg-green-50 text-green-700 text-xs font-bold rounded-full h-8 px-6 shadow-none"
                                                onClick={() => setShowSendLater(false)}
                                            >
                                                Done
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Primary Send Button */}
                        <Button
                            className="bg-white border border-green-600 text-green-600 hover:bg-green-50 font-medium h-9 px-8 rounded-full transition-all text-sm shadow-sm"
                            onClick={startBatchJob}
                            disabled={isUploading}
                        >
                            {isUploading ? "Sending..." : "Send"}
                        </Button>
                    </div>
                </div>
            </header>

            {/* --- SCROLLABLE CONTENT --- */}
            <main className="flex-1 overflow-y-auto">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">

                    {/* FROM Field */}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-0">
                        <label className="w-20 text-sm font-medium text-slate-500 pt-1 sm:pt-0">From</label>
                        <div className="flex-1">
                            <div className="inline-flex items-center space-x-2 bg-slate-100 px-3 py-1.5 rounded-md cursor-pointer hover:bg-slate-200 transition-colors text-sm text-slate-700">
                                <span>{session?.user?.email || 'user@example.com'}</span>
                                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                            </div>
                        </div>
                    </div>

                    {/* TO Field */}
                    <div className="flex items-center border-b border-slate-200 pb-4">
                        <label className="w-20 text-sm font-normal text-slate-600">To</label>
                        <div className="flex-1 flex items-center gap-4"> {/* Added gap and horizontal flex */}
                            <div className="flex-1 flex items-center space-x-2 overflow-x-auto no-scrollbar">
                                {file && previewEmails.length > 0 ? (
                                    <>
                                        {previewEmails.map((email, i) => (
                                            <span key={i} className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-[#E0F2F1] text-[#00796B] border border-[#B2DFDB] whitespace-nowrap">
                                                {email}
                                            </span>
                                        ))}
                                        {detectedEmails > 3 && (
                                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-[#E0F2F1] text-[#00796B] border border-[#B2DFDB] whitespace-nowrap">
                                                +{detectedEmails - 3}
                                            </span>
                                        )}
                                    </>
                                ) : (
                                    <input
                                        type="text"
                                        placeholder="recipient@example.com"
                                        className="flex-1 bg-transparent border-none text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-0 px-0"
                                    />
                                )}
                            </div>

                            {/* This label is now moved inside the flex container to stay on the right */}
                            <label className="flex items-center space-x-2 cursor-pointer hover:opacity-80 transition-opacity shrink-0">
                                <UploadCloud className="w-4 h-4 text-[#00A86B]" />
                                <span className="text-xs font-bold text-[#00A86B]">{file ? 'Replace List' : 'Upload List'}</span>
                                <input type="file" className="hidden" accept=".csv" onChange={handleFileUpload} />
                            </label>
                        </div>
                    </div>

                    {/* SUBJECT Field */}
                    <div className="flex flex-col sm:flex-row sm:items-center border-b border-slate-100 pb-4 gap-2 sm:gap-0">
                        <label className="w-20 text-sm font-medium text-slate-500">Subject</label>
                        <input
                            className="flex-1 bg-transparent border-none text-sm text-slate-800 placeholder:text-slate-300 focus:outline-none focus:ring-0 px-0"
                            placeholder="Enter subject here..."
                            value={subject}
                            onChange={e => setSubject(e.target.value)}
                        />
                    </div>

                    {/* SCHEDULING PARAMS */}
                    <div className="flex flex-wrap items-center gap-y-4 gap-x-8 pb-2">
                        {/* Delay */}
                        <div className="flex items-center gap-3">
                            <label className="text-sm font-normal text-slate-600">Delay between 2 emails</label>
                            <input
                                type="number"
                                min="0"
                                className="w-16 h-9 bg-white border border-slate-200 rounded-lg text-center text-sm text-slate-600 focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all outline-none"
                                value={delay}
                                onChange={e => { const val = Number(e.target.value); if (val >= 0) setDelay(val); }}
                            />
                        </div>

                        {/* Hourly Limit */}
                        <div className="flex items-center gap-3">
                            <label className="text-sm font-normal text-slate-600">Hourly Limit</label>
                            <input
                                type="number"
                                min="0"
                                className="w-16 h-9 bg-white border border-slate-200 rounded-lg text-center text-sm text-slate-600 focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all outline-none"
                                value={hourlyLimit}
                                onChange={e => { const val = Number(e.target.value); if (val >= 0) setHourlyLimit(val); }}
                            />
                        </div>
                    </div>

                    {/* EDITOR SECTION */}
                    <div className="flex-1 flex flex-col min-h-[400px] bg-[#fafafa] rounded-lg p-4 sm:p-6 border border-transparent focus-within:border-slate-200 transition-colors">

                        <div className="text-sm text-slate-400 mb-4 select-none">Type Your Reply...</div>

                        {/* Toolbar */}
                        <div className="flex flex-wrap items-center gap-1 mb-4 border-b border-slate-200 pb-3 sticky top-0 z-10">
                            {/* History */}
                            <div className="flex items-center gap-1 mr-3 border-r border-slate-200 pr-3">
                                <button onClick={() => handleFormat('undo')} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded transition-colors"><RotateCcw className="w-4 h-4" /></button>
                                <button onClick={() => handleFormat('redo')} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded transition-colors"><RotateCw className="w-4 h-4" /></button>
                            </div>

                            {/* Text Style */}
                            <div className="flex items-center gap-1 mr-3 border-r border-slate-200 pr-3">
                                <button className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded transition-colors flex items-center gap-0.5"><Type className="w-4 h-4" /><ChevronDown className="w-3 h-3" /></button>
                            </div>

                            {/* Formatting */}
                            <div className="flex items-center gap-1 mr-3 border-r border-slate-200 pr-3">
                                <button onClick={() => handleFormat('bold')} className={`p-1.5 rounded transition-colors ${activeFormats.includes('bold') ? 'bg-slate-200 text-slate-800' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-200'}`}><Bold className="w-4 h-4" /></button>
                                <button onClick={() => handleFormat('italic')} className={`p-1.5 rounded transition-colors ${activeFormats.includes('italic') ? 'bg-slate-200 text-slate-800' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-200'}`}><Italic className="w-4 h-4" /></button>
                                <button onClick={() => handleFormat('underline')} className={`p-1.5 rounded transition-colors ${activeFormats.includes('underline') ? 'bg-slate-200 text-slate-800' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-200'}`}><Underline className="w-4 h-4" /></button>
                            </div>

                            {/* Alignment */}
                            <div className="flex items-center gap-1 mr-3 border-r border-slate-200 pr-3">
                                <button onClick={() => handleFormat('justifyLeft')} className={`p-1.5 rounded transition-colors ${activeFormats.includes('justifyLeft') ? 'bg-slate-200 text-slate-800' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-200'}`}><AlignLeft className="w-4 h-4" /></button>
                                <button onClick={() => handleFormat('insertUnorderedList')} className={`p-1.5 rounded transition-colors ${activeFormats.includes('insertUnorderedList') ? 'bg-slate-200 text-slate-800' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-200'}`}><List className="w-4 h-4" /></button>
                            </div>

                            {/* Inserts */}
                            <div className="flex items-center gap-1">
                                <button onClick={() => handleFormat('createLink')} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded transition-colors"><LinkIcon className="w-4 h-4" /></button>
                                <button onClick={() => handleFormat('insertImage')} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded transition-colors"><ImageIcon className="w-4 h-4" /></button>
                                <button onClick={() => handleFormat('formatBlock', 'blockquote')} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded transition-colors"><Quote className="w-4 h-4" /></button>
                                <button onClick={() => handleFormat('insertCode')} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded transition-colors"><Code className="w-4 h-4" /></button>
                                <input type="file" ref={imageInputRef} className="hidden" accept="image/*" onChange={handleImageUpload} />
                            </div>
                        </div>

                        {/* Editable Area */}
                        <div
                            className="flex-1 w-full bg-transparent text-sm text-slate-800 focus:outline-none leading-relaxed overflow-y-auto"
                            contentEditable
                            suppressContentEditableWarning
                            onInput={(e) => setBody(e.currentTarget.innerHTML)}
                            onKeyUp={checkFormats}
                            onMouseUp={checkFormats}
                            dangerouslySetInnerHTML={{ __html: body }}
                            style={{ minHeight: '200px' }}
                        />
                    </div>

                </div>
            </main>
        </div>
    )
}