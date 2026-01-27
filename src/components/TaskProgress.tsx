import React, { useState, useEffect } from 'react';
import { X, ChevronDown, ChevronUp, CheckCircle2, AlertCircle, Loader2, FileIcon, Trash2, StopCircle, Ban, Square } from 'lucide-react';

export type TaskStatus = 'PENDING' | 'SUCCESS' | 'SKIPPED' | 'ERROR' | 'CANCELLED';
export type TaskType = 'UPLOAD' | 'DELETE';

export interface AsyncTask {
    id: string;
    type: TaskType;
    name: string;
    status: TaskStatus;
}

interface TaskProgressProps {
    tasks: AsyncTask[];
    onClearCompleted: () => void;
    onStop?: () => void;
}

export function TaskProgress({ tasks, onClearCompleted, onStop }: TaskProgressProps) {
    const [isExpanded, setIsExpanded] = useState(true);
    const [isVisible, setIsVisible] = useState(false);

    // Auto-hide when list is empty
    useEffect(() => {
        if (tasks.length > 0) {
            setIsVisible(true);
            setIsExpanded(true);
        }
    }, [tasks.length]);

    if (tasks.length === 0) return null;

    const pendingCount = tasks.filter(t => t.status === 'PENDING').length;
    const successCount = tasks.filter(t => t.status === 'SUCCESS').length;
    const skippedCount = tasks.filter(t => t.status === 'SKIPPED').length;
    const errorCount = tasks.filter(t => t.status === 'ERROR').length;
    const cancelledCount = tasks.filter(t => t.status === 'CANCELLED').length;

    // Total count is static for the batch if we pre-fill tasks
    const totalCount = tasks.length;
    const isAllDone = pendingCount === 0;

    // Header Text logic
    let headerText = '';
    const activeTasks = tasks.filter(t => t.status === 'PENDING');

    // Determine the type of work being done
    // If we have mixed types, generic "Processing". If mostly upload, "Uploading".
    const uploadTasks = tasks.filter(t => t.type === 'UPLOAD');
    const deleteTasks = tasks.filter(t => t.type === 'DELETE');

    let actionVerb = 'Processing';
    if (uploadTasks.length > deleteTasks.length) actionVerb = 'Uploading';
    else if (deleteTasks.length > 0) actionVerb = 'Deleting';

    if (!isAllDone) {
        // e.g. "Uploading 50/100 items..."
        const doneCount = totalCount - pendingCount;
        headerText = `${actionVerb} ${doneCount}/${totalCount} item${totalCount !== 1 ? 's' : ''}...`;
    } else {
        if (cancelledCount > 0) {
            headerText = "Upload Cancelled";
        } else {
            headerText = `${totalCount} task${totalCount !== 1 ? 's' : ''} completed`;
        }
    }

    // Extended Stats for Header (Subtitle)
    const statsParts = [];
    if (successCount > 0) statsParts.push(`${successCount} success`);
    if (skippedCount > 0) statsParts.push(`${skippedCount} skipped`);
    if (errorCount > 0) statsParts.push(`${errorCount} failed`);
    if (cancelledCount > 0) statsParts.push(`${cancelledCount} cancelled`);

    const subtitle = statsParts.join(', ');

    return (
        <div className="fixed bottom-6 right-6 z-[60] w-[26rem] bg-white rounded-t-xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col font-sans animate-in slide-in-from-bottom-5 duration-300">
            {/* Header */}
            <div
                className="bg-slate-900 text-white px-5 py-4 flex flex-col cursor-pointer hover:bg-slate-800 transition-colors gap-1"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-3">
                        {isAllDone ? (
                            (errorCount > 0 || cancelledCount > 0) ? <AlertCircle className="w-5 h-5 text-orange-400" /> : <CheckCircle2 className="w-5 h-5 text-green-400" />
                        ) : (
                            <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
                        )}
                        <span className="font-semibold text-sm tracking-wide">{headerText}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        {/* Stop Button */}
                        {!isAllDone && onStop && (
                            <button
                                onClick={(e) => { e.stopPropagation(); onStop(); }}
                                className="p-1 hover:bg-slate-700 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-full transition-colors mr-1"
                                title="Stop Upload"
                            >
                                <Square className="w-5 h-5 fill-current" />
                            </button>
                        )}

                        <button className="p-1 hover:bg-slate-700 rounded-full transition-colors">
                            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                        </button>
                        {isAllDone && (
                            <button
                                onClick={(e) => { e.stopPropagation(); onClearCompleted(); }}
                                className="p-1 hover:bg-slate-700 rounded-full transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                </div>

                {/* Progress Bar & Subtitle */}
                {(pendingCount > 0 || subtitle) && (
                    <div className="mt-2 w-full">
                        {/* Only show bar if pending tasks exist to show progress moving */}
                        {!isAllDone && (
                            <div className="w-full bg-slate-700 rounded-full h-1.5 mb-1.5 overflow-hidden">
                                <div
                                    className="bg-blue-500 h-1.5 rounded-full transition-all duration-300 ease-out"
                                    style={{ width: `${((totalCount - pendingCount) / totalCount) * 100}%` }}
                                ></div>
                            </div>
                        )}
                        {subtitle && <div className="text-xs text-slate-400">{subtitle}</div>}
                    </div>
                )}
            </div>

            {/* List */}
            <div className={`transition-all duration-300 ease-in-out bg-slate-50 ${isExpanded ? 'max-h-80 opacity-100 overflow-y-auto' : 'max-h-0 opacity-0 overflow-hidden'}`}>
                <div className="flex flex-col">
                    {tasks.map((task) => (
                        <div key={task.id} className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 bg-white last:border-0 hover:bg-slate-50 transition-colors">
                            {/* Icon */}
                            <div className="shrink-0 text-slate-400">
                                {task.type === 'UPLOAD' ? <FileIcon className="w-4 h-4" /> : <Trash2 className="w-4 h-4" />}
                            </div>

                            {/* Name */}
                            <div className="flex-1 min-w-0 flex flex-col">
                                <p className="text-sm font-medium text-slate-700 truncate" title={task.name}>{task.name}</p>
                                <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                                    {task.status === 'SKIPPED' ? 'Skipped (Filter)' : task.status}
                                </p>
                            </div>

                            {/* Status Indicator */}
                            <div className="shrink-0 flex items-center">
                                {task.status === 'PENDING' && (
                                    <span className="text-xs text-blue-600 font-medium">Waiting...</span>
                                )}
                                {task.status === 'SUCCESS' && (
                                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                                )}
                                {task.status === 'SKIPPED' && (
                                    <div className="w-5 h-5 rounded-full border border-slate-300 flex items-center justify-center">
                                        <X className="w-3 h-3 text-slate-400" />
                                    </div>
                                )}
                                {task.status === 'ERROR' && (
                                    <AlertCircle className="w-5 h-5 text-red-500" />
                                )}
                                {task.status === 'CANCELLED' && (
                                    <Ban className="w-5 h-5 text-slate-400" />
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
