"use client"

import { useState } from "react"
import Papa from "papaparse"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Loader2 } from "lucide-react"

export function ComposeEmail() {
    const [file, setFile] = useState<File | null>(null)
    const [subject, setSubject] = useState("")
    const [body, setBody] = useState("")
    const [delay, setDelay] = useState(2)
    const [hourlyLimit, setHourlyLimit] = useState(50)
    const [sendAt, setSendAt] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [isOpen, setIsOpen] = useState(false)

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            setFile(e.target.files[0])
        }
    }

    const handleSchedule = async () => {
        if (!file || !subject || !body || !sendAt) {
            alert("Please fill all fields")
            return
        }

        setIsLoading(true)

        Papa.parse(file, {
            header: true,
            complete: async (results) => {
                const recipients = results.data.map((row: any) => row.email).filter((email: string) => email);

                if (recipients.length === 0) {
                    alert("No valid 'email' column found in CSV.");
                    setIsLoading(false);
                    return;
                }

                try {
                    const res = await fetch(`${(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/api\/?$/, '')}/api/schedule`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            emails: recipients, // Send Array as expected by Backend
                            subject,
                            body,
                            delay,
                            hourlyLimit,
                            sendAt
                        })
                    });

                    if (!res.ok) throw new Error("Failed to schedule");

                    const data = await res.json();
                    alert(data.message || `Scheduled ${recipients.length} emails!`);
                    setIsOpen(false);
                } catch (err) {
                    console.error("Failed to schedule batch:", err);
                    alert("Failed to schedule campaign. Check console.");
                } finally {
                    setIsLoading(false);
                }

                // Success handling moved inside the try block above
            }
        })
    }

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button className="bg-blue-600 hover:bg-blue-700">Compose & Schedule</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>New Campaign</DialogTitle>
                    <DialogDescription>
                        Upload a CSV with an 'email' column and set your message.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <label htmlFor="csv" className="text-right text-sm font-medium">
                            CSV
                        </label>
                        <Input
                            id="csv"
                            type="file"
                            accept=".csv"
                            onChange={handleFileChange}
                            className="col-span-3"
                        />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <label htmlFor="subject" className="text-right text-sm font-medium">
                            Subject
                        </label>
                        <Input
                            id="subject"
                            value={subject}
                            onChange={(e) => setSubject(e.target.value)}
                            className="col-span-3"
                        />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <label htmlFor="body" className="text-right text-sm font-medium">
                            Body
                        </label>
                        <Input
                            id="body"
                            value={body}
                            onChange={(e) => setBody(e.target.value)}
                            className="col-span-3"
                        />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <label htmlFor="delay" className="text-right text-sm font-medium">
                            Delay (sec)
                        </label>
                        <Input
                            id="delay"
                            type="number"
                            min="1"
                            value={delay}
                            onChange={(e) => setDelay(Number(e.target.value))}
                            className="col-span-3"
                        />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <label htmlFor="hourlyLimit" className="text-right text-sm font-medium">
                            Hourly Limit
                        </label>
                        <Input
                            id="hourlyLimit"
                            type="number"
                            min="1"
                            value={hourlyLimit}
                            onChange={(e) => setHourlyLimit(Number(e.target.value))}
                            className="col-span-3"
                        />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <label htmlFor="time" className="text-right text-sm font-medium">
                            Send At
                        </label>
                        <Input
                            id="time"
                            type="datetime-local"
                            value={sendAt}
                            onChange={(e) => setSendAt(e.target.value)}
                            className="col-span-3"
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button type="submit" onClick={handleSchedule} disabled={isLoading}>
                        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Schedule
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
