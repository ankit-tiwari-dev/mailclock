"use client"

import {
    Table,
    TableBody,
    TableCaption,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { useEffect, useState } from "react"

interface Job {
    id: string;
    recipient: string;
    subject: string;
    status: 'PENDING' | 'SENT' | 'FAILED';
    scheduledAt: string;
}

export function DashboardTable() {
    const mockJobs: Job[] = [
        { id: '1', recipient: 'alice@example.com', subject: 'Hello', status: 'PENDING', scheduledAt: '2024-10-10T10:00:00Z' },
        { id: '2', recipient: 'bob@example.com', subject: 'Offer', status: 'SENT', scheduledAt: '2024-10-09T10:00:00Z' },
        { id: '3', recipient: 'charlie@example.com', subject: 'Update', status: 'FAILED', scheduledAt: '2024-10-08T10:00:00Z' },
    ];

    return (
        <div className="rounded-md border">
            <Table>
                <TableCaption>A list of your recent email campaigns.</TableCaption>
                <TableHeader>
                    <TableRow>
                        <TableHead className="w-[100px]">ID</TableHead>
                        <TableHead>Recipient</TableHead>
                        <TableHead>Subject</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Scheduled At</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {mockJobs.map((job) => (
                        <TableRow key={job.id}>
                            <TableCell className="font-medium">{job.id}</TableCell>
                            <TableCell>{job.recipient}</TableCell>
                            <TableCell>{job.subject}</TableCell>
                            <TableCell>
                                <div className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${job.status === 'PENDING' ? 'border-yellow-500 text-yellow-500' :
                                        job.status === 'SENT' ? 'border-green-500 text-green-500' :
                                            'border-red-500 text-red-500'
                                    }`}>
                                    {job.status}
                                </div>
                            </TableCell>
                            <TableCell className="text-right">{new Date(job.scheduledAt).toLocaleDateString()}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    )
}
