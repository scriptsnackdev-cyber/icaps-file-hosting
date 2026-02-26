import React, { useState, useEffect } from 'react';
import { X, ChevronDown, CheckCircle2, AlertCircle, Loader2, FileIcon, Trash2, Ban, Square, FolderIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export type TaskStatus = 'PENDING' | 'SUCCESS' | 'SKIPPED' | 'ERROR' | 'CANCELLED';
export type TaskType = 'UPLOAD' | 'DELETE' | 'FOLDER_UPLOAD';

export interface AsyncTask {
    id: string;
    type: TaskType;
    name: string;
    status: TaskStatus;
    totalItems?: number;
    completedItems?: number;
}

interface TaskProgressProps {
    tasks: AsyncTask[];
    onClearCompleted: () => void;
    onStop?: () => void;
    eta?: string;
    speed?: string;
    overallProgress?: number;
}

export function TaskProgress({ tasks, onClearCompleted, onStop, eta, speed, overallProgress }: TaskProgressProps) {
    const [isExpanded, setIsExpanded] = useState(true);
    const [isVisible, setIsVisible] = useState(false);

    const [prevTasksLength, setPrevTasksLength] = useState(tasks.length);

    // Auto-show when new tasks arrive
    if (tasks.length !== prevTasksLength) {
        setPrevTasksLength(tasks.length);
        if (tasks.length > 0) {
            setIsVisible(true);
            setIsExpanded(true);
        }
    }

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
    if (speed && !isAllDone) statsParts.push(`${speed}`);
    if (eta && !isAllDone) statsParts.push(`ETA: ${eta}`);

    if (successCount > 0 && isAllDone) statsParts.push(`${successCount} success`);
    if (skippedCount > 0) statsParts.push(`${skippedCount} skipped`);
    if (errorCount > 0) statsParts.push(`${errorCount} failed`);
    if (cancelledCount > 0) statsParts.push(`${cancelledCount} cancelled`);

    const subtitle = statsParts.join(' • ');

    // Progress Value (0-100)
    let progressValue = 0;
    if (overallProgress !== undefined) {
        progressValue = overallProgress;
    } else {
        progressValue = totalCount > 0 ? ((totalCount - pendingCount) / totalCount) * 100 : 0;
    }

    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div
                    initial={{ opacity: 0, y: 50, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 50, scale: 0.95 }}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    className="fixed bottom-6 right-6 z-[60] w-[28rem] rounded-2xl overflow-hidden flex flex-col font-sans shadow-2xl border border-white/20 bg-white/90 backdrop-blur-xl"
                >
                    {/* Header */}
                    <div
                        className="bg-slate-900/95 text-white px-5 py-4 flex flex-col cursor-pointer hover:bg-slate-800 transition-colors gap-1 backdrop-blur-sm relative overflow-hidden group"
                        onClick={() => setIsExpanded(!isExpanded)}
                    >
                        {/* Shimmer Effect */}
                        {!isAllDone && (
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:animate-shimmer" />
                        )}

                        <div className="flex items-center justify-between w-full relative z-10">
                            <div className="flex items-center gap-3">
                                <motion.div
                                    animate={!isAllDone ? { rotate: 360 } : { scale: [1, 1.2, 1] }}
                                    transition={!isAllDone ? { repeat: Infinity, duration: 1, ease: "linear" } : { duration: 0.3 }}
                                >
                                    {isAllDone ? (
                                        (errorCount > 0 || cancelledCount > 0) ? <AlertCircle className="w-5 h-5 text-orange-400" /> : <CheckCircle2 className="w-5 h-5 text-green-400" />
                                    ) : (
                                        <Loader2 className="w-5 h-5 text-blue-400" />
                                    )}
                                </motion.div>
                                <span className="font-semibold text-sm tracking-wide text-slate-100">{headerText}</span>
                            </div>
                            <div className="flex items-center gap-1">
                                {/* Stop Button */}
                                {!isAllDone && onStop && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); onStop(); }}
                                        className="p-1.5 hover:bg-white/10 text-red-400 hover:text-red-300 rounded-full transition-colors mr-1"
                                        title="Stop Upload"
                                    >
                                        <Square className="w-4 h-4 fill-current" />
                                    </button>
                                )}

                                <button className="p-1.5 hover:bg-white/10 rounded-full transition-colors text-slate-400 hover:text-white">
                                    <motion.div animate={{ rotate: isExpanded ? 180 : 0 }}>
                                        <ChevronDown className="w-4 h-4" />
                                    </motion.div>
                                </button>
                                {isAllDone && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); onClearCompleted(); }}
                                        className="p-1.5 hover:bg-white/10 rounded-full transition-colors text-slate-400 hover:text-white"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Progress Bar & Subtitle */}
                        <AnimatePresence>
                            {((pendingCount > 0) || subtitle) && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="mt-3 w-full relative z-10"
                                >
                                    {/* Only show bar if pending tasks exist to show progress moving */}
                                    {!isAllDone && (
                                        <div className="w-full bg-slate-800/50 rounded-full h-1.5 mb-2 overflow-hidden border border-white/5">
                                            <motion.div
                                                className="bg-gradient-to-r from-blue-500 to-cyan-400 h-1.5 rounded-full relative"
                                                initial={{ width: 0 }}
                                                animate={{ width: `${progressValue}%` }}
                                                transition={{ duration: 0.5, ease: "easeOut" }}
                                            >
                                                <div className="absolute inset-0 bg-white/20 animate-pulse" />
                                            </motion.div>
                                        </div>
                                    )}
                                    {subtitle && (
                                        <motion.div
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            className="text-xs text-slate-400 font-medium flex items-center justify-between"
                                        >
                                            <span>{subtitle}</span>
                                            {!isAllDone && <span className="text-white/80">{Math.round(progressValue)}%</span>}
                                        </motion.div>
                                    )}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* List */}
                    <AnimatePresence>
                        {isExpanded && (
                            <motion.div
                                initial={{ height: 0 }}
                                animate={{ height: "auto" }}
                                exit={{ height: 0 }}
                                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                className="bg-slate-50/50 backdrop-blur-md overflow-hidden"
                            >
                                <div className="max-h-80 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
                                    <div className="flex flex-col divide-y divide-slate-100">
                                        {tasks.slice(0, 100).map((task) => (
                                            <motion.div
                                                layout
                                                key={task.id}
                                                initial={{ opacity: 0, x: -20 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                className="flex items-center gap-3 px-5 py-3 bg-white/50 hover:bg-blue-50/50 transition-colors group"
                                            >
                                                {/* Icon */}
                                                <div className={`shrink-0 p-2 rounded-lg ${task.status === 'ERROR' ? 'bg-red-50 text-red-500' :
                                                    task.status === 'SUCCESS' ? 'bg-green-50 text-green-500' :
                                                        'bg-slate-100 text-slate-500'
                                                    }`}>
                                                    {task.type === 'FOLDER_UPLOAD' ? <FolderIcon className="w-4 h-4" /> :
                                                        task.type === 'UPLOAD' ? <FileIcon className="w-4 h-4" /> :
                                                            <Trash2 className="w-4 h-4" />}
                                                </div>

                                                {/* Name / Stats */}
                                                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                                                    <div className="flex items-center gap-2">
                                                        <p className="text-sm font-semibold text-slate-700 truncate group-hover:text-blue-700 transition-colors" title={task.name}>{task.name}</p>
                                                        {task.type === 'FOLDER_UPLOAD' && task.totalItems && (
                                                            <span className="text-xs text-slate-400 font-medium">
                                                                {task.completedItems || 0} of {task.totalItems}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className={`text-[10px] uppercase tracking-wider font-bold ${task.status === 'ERROR' ? 'text-red-500' :
                                                        task.status === 'SUCCESS' ? 'text-green-600' :
                                                            'text-slate-400'
                                                        }`}>
                                                        {task.status === 'SKIPPED' ? 'Skipped' : task.status}
                                                    </p>
                                                </div>

                                                {/* Status Indicator */}
                                                <div className="shrink-0 flex items-center">
                                                    {task.status === 'PENDING' && (
                                                        <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                                                    )}
                                                    {task.status === 'SUCCESS' && (
                                                        <CheckCircle2 className="w-5 h-5 text-green-500 drop-shadow-sm" />
                                                    )}
                                                    {task.status === 'SKIPPED' && (
                                                        <div className="w-5 h-5 rounded-full border border-slate-300 flex items-center justify-center">
                                                            <X className="w-3 h-3 text-slate-400" />
                                                        </div>
                                                    )}
                                                    {task.status === 'ERROR' && (
                                                        <AlertCircle className="w-5 h-5 text-red-500 drop-shadow-sm" />
                                                    )}
                                                    {task.status === 'CANCELLED' && (
                                                        <Ban className="w-5 h-5 text-slate-400" />
                                                    )}
                                                </div>
                                            </motion.div>
                                        ))}
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
