'use client';

import React, { useState, useEffect } from 'react';
import { X, Plus, Calendar, Clock, ArrowRight, Save, Trash2, CheckCircle2, Circle, AlertCircle, GripVertical } from 'lucide-react';
import { format, differenceInDays, parseISO } from 'date-fns';
import { ConfirmModal } from '@/components/ui/ConfirmModal';

interface Task {
    id: string;
    title: string;
    description?: string;
    status: 'todo' | 'doing' | 'done';
    dueDate?: string; // ISO date string YYYY-MM-DD
    priority: 'low' | 'medium' | 'high';
}

interface PlannerData {
    title: string;
    tasks: Task[];
    lastModified: string;
}

interface PlannerEditorProps {
    isOpen: boolean;
    onClose: () => void;
    initialData: PlannerData | null;
    fileName: string;
    onSave: (data: PlannerData) => Promise<void>;
}

export const PlannerEditor = ({ isOpen, onClose, initialData, fileName, onSave }: PlannerEditorProps) => {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [activeTab, setActiveTab] = useState<'board' | 'list'>('board');

    // Load initial data
    useEffect(() => {
        if (isOpen && initialData) {
            setTasks(initialData.tasks || []);
        } else if (isOpen) {
            setTasks([]);
        }
    }, [isOpen, initialData]);

    const handleAddTask = (status: Task['status'] = 'todo') => {
        const newTask: Task = {
            id: crypto.randomUUID(),
            title: 'New Task',
            status,
            priority: 'medium',
            dueDate: new Date().toISOString().split('T')[0] // Today
        };
        setTasks(prev => [...prev, newTask]);
    };

    const updateTask = (id: string, updates: Partial<Task>) => {
        setTasks(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
    };

    // Helper functions
    const getStatusColor = (status: string) => {
        switch (status) {
            case 'todo': return 'bg-slate-100 border-slate-200';
            case 'doing': return 'bg-blue-50 border-blue-200';
            case 'done': return 'bg-emerald-50 border-emerald-200';
            default: return 'bg-slate-50';
        }
    };

    const getPriorityColor = (priority: string) => {
        switch (priority) {
            case 'high': return 'text-red-500 bg-red-50';
            case 'medium': return 'text-orange-500 bg-orange-50';
            case 'low': return 'text-blue-500 bg-blue-50';
            default: return 'text-slate-500';
        }
    };

    const getDueStatus = (dateStr?: string) => {
        if (!dateStr) return { label: 'No Date', color: 'text-slate-400' };
        const days = differenceInDays(parseISO(dateStr), new Date());

        if (days < 0) return { label: 'Overdue', color: 'text-red-600 font-bold' };
        if (days === 0) return { label: 'Today', color: 'text-orange-600 font-bold' };
        if (days <= 2) return { label: `${days} days left`, color: 'text-orange-500' };
        return { label: format(parseISO(dateStr), 'MMM d'), color: 'text-slate-500' };
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const dataToSave: PlannerData = {
                title: fileName.replace('.splan', ''),
                tasks,
                lastModified: new Date().toISOString()
            };
            await onSave(dataToSave);
            onClose();
        } catch (e) {
            console.error('Failed to save planner', e);
            // Parent handles toast error
        } finally {
            setIsSaving(false);
        }
    };

    // State for Modals
    const [confirmState, setConfirmState] = useState<{ isOpen: boolean, taskId: string | null }>({ isOpen: false, taskId: null });


    const deleteTask = (id: string) => {
        setConfirmState({ isOpen: true, taskId: id });
    };

    const confirmDelete = () => {
        if (confirmState.taskId) {
            setTasks(prev => prev.filter(t => t.id !== confirmState.taskId));
            setConfirmState({ isOpen: false, taskId: null });
        }
    };

    // ... handleSave ...

    if (!isOpen) return null;

    return (
        <>
            <div className="fixed inset-0 z-[100] bg-white/95 backdrop-blur-sm flex flex-col h-screen w-screen animate-in fade-in duration-200">
                {/* ... Header & Board ... */}
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white">
                    <div className="flex items-center gap-4">
                        <div className="h-10 w-10 bg-indigo-600 rounded-lg flex items-center justify-center text-white shadow-lg shadow-indigo-200">
                            <Calendar className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                                {fileName}
                                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-normal">.splan</span>
                            </h2>
                            <p className="text-sm text-slate-500">{tasks.length} tasks • {tasks.filter(t => t.status === 'done').length} completed</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors font-medium"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={isSaving}
                            className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 hover:shadow-lg hover:shadow-indigo-200 transition-all font-medium flex items-center gap-2 disabled:opacity-50"
                        >
                            {isSaving ? <Clock className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            Save Changes
                        </button>
                    </div>
                </div>

                {/* Kanban Board */}
                <div className="flex-1 overflow-x-auto overflow-y-hidden p-6 bg-slate-50/50">
                    <div className="flex gap-6 h-full min-w-[1000px] max-w-7xl mx-auto">
                        {/* Columns */}
                        {['todo', 'doing', 'done'].map((status) => (
                            <div key={status} className="flex-1 flex flex-col h-full bg-slate-100/50 rounded-2xl border border-slate-200/60 overflow-hidden">
                                {/* Column Header */}
                                <div className={`p-4 border-b flex items-center justify-between ${status === 'todo' ? 'bg-white border-slate-200' : status === 'doing' ? 'bg-blue-50/50 border-blue-100' : 'bg-emerald-50/50 border-emerald-100'}`}>
                                    <h3 className="font-semibold capitalize text-slate-700 flex items-center gap-2">
                                        {status === 'todo' && <Circle className="w-4 h-4 text-slate-400" />}
                                        {status === 'doing' && <Clock className="w-4 h-4 text-blue-500" />}
                                        {status === 'done' && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                                        {status === 'todo' ? 'To Do' : status === 'doing' ? 'In Progress' : 'Done'}
                                        <span className="ml-2 px-2 py-0.5 bg-white/50 rounded-full text-xs text-slate-500 border border-slate-100">
                                            {tasks.filter(t => t.status === status).length}
                                        </span>
                                    </h3>
                                    <button
                                        onClick={() => handleAddTask(status as Task['status'])}
                                        className="p-1 hover:bg-white rounded-md transition-colors text-slate-500 hover:text-indigo-600"
                                    >
                                        <Plus className="w-5 h-5" />
                                    </button>
                                </div>

                                {/* Task List */}
                                <div className="flex-1 overflow-y-auto p-3 space-y-3">
                                    {tasks.filter(t => t.status === status).map(task => (
                                        <div
                                            key={task.id}
                                            className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 group hover:shadow-md hover:border-indigo-200 transition-all cursor-grab active:cursor-grabbing"
                                        >
                                            <div className="mb-2">
                                                <input
                                                    type="text"
                                                    value={task.title}
                                                    onChange={(e) => updateTask(task.id, { title: e.target.value })}
                                                    className="w-full font-medium text-slate-700 bg-transparent border-none focus:ring-0 p-0 placeholder:text-slate-300"
                                                    placeholder="Task title..."
                                                />
                                            </div>

                                            <div className="flex items-center justify-between mt-3 text-xs">
                                                <div className="flex items-center gap-2">
                                                    {/* Date Picker Trigger (Simple HTML Date Input needed for MVP) */}
                                                    <div className="relative group/date">
                                                        <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-50 border border-slate-100 cursor-pointer ${getDueStatus(task.dueDate).color}`}>
                                                            <Calendar className="w-3.5 h-3.5" />
                                                            <span>{getDueStatus(task.dueDate).label}</span>
                                                        </div>
                                                        <input
                                                            type="date"
                                                            className="absolute inset-0 opacity-0 cursor-pointer"
                                                            value={task.dueDate || ''}
                                                            onChange={(e) => updateTask(task.id, { dueDate: e.target.value })}
                                                        />
                                                    </div>

                                                    {/* Priority Selector */}
                                                    <select
                                                        value={task.priority}
                                                        onChange={(e) => updateTask(task.id, { priority: e.target.value as any })}
                                                        className={`appearance-none px-2 py-1 rounded-md border border-transparent font-medium cursor-pointer ${getPriorityColor(task.priority)} text-xs focus:outline-none`}
                                                    >
                                                        <option value="low">Low</option>
                                                        <option value="medium">Medium</option>
                                                        <option value="high">High</option>
                                                    </select>
                                                </div>

                                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    {status !== 'todo' && (
                                                        <button onClick={() => updateTask(task.id, { status: status === 'doing' ? 'todo' : 'doing' })} className="p-1.5 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600">
                                                            <ArrowRight className="w-3.5 h-3.5 rotate-180" />
                                                        </button>
                                                    )}
                                                    {status !== 'done' && (
                                                        <button onClick={() => updateTask(task.id, { status: status === 'doing' ? 'done' : 'doing' })} className="p-1.5 hover:bg-slate-100 rounded text-slate-400 hover:text-blue-600">
                                                            <ArrowRight className="w-3.5 h-3.5" />
                                                        </button>
                                                    )}
                                                    <button onClick={() => deleteTask(task.id)} className="p-1.5 hover:bg-red-50 rounded text-slate-400 hover:text-red-500 ml-1">
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}

                                    <button
                                        onClick={() => handleAddTask(status as Task['status'])}
                                        className="w-full py-2.5 border-2 border-dashed border-slate-200 rounded-xl text-sm text-slate-400 hover:border-indigo-300 hover:text-indigo-500 hover:bg-indigo-50/50 transition-all flex items-center justify-center gap-2"
                                    >
                                        <Plus className="w-4 h-4" /> Add Task
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Modals */}
            <ConfirmModal
                isOpen={confirmState.isOpen}
                onClose={() => setConfirmState({ isOpen: false, taskId: null })}
                onConfirm={confirmDelete}
                title="Delete Task?"
                description="This action cannot be undone."
                confirmText="Delete"
                isDanger
            />
        </>
    );
};
