import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, ArrowLeft, Save, FileText, Undo, Redo } from 'lucide-react';

export interface CreateNoteModalProps {
    isOpen: boolean;
    onClose: () => void;
    onCreate: (name: string, content: string) => Promise<void>;
    initialName?: string;
    initialContent?: string;
}

export default function CreateNoteModal({ isOpen, onClose, onCreate, initialName, initialContent }: CreateNoteModalProps) {
    const [name, setName] = useState('Untitled document');
    const [content, setContent] = useState('');
    const [isCreating, setIsCreating] = useState(false);

    // History management
    const [history, setHistory] = useState<string[]>(['']);
    const [historyIndex, setHistoryIndex] = useState(0);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);
    const isUndoRedo = useRef(false);

    // Reset when opening
    useEffect(() => {
        if (isOpen) {
            setName(initialName || 'Untitled document');
            const init = initialContent || '';
            setContent(init);
            setHistory([init]);
            setHistoryIndex(0);
            isUndoRedo.current = false;
        }
    }, [isOpen, initialName, initialContent]);

    if (!isOpen) return null;

    const addToHistory = (newContent: string) => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);

        timeoutRef.current = setTimeout(() => {
            setHistory(prev => {
                const newHistory = prev.slice(0, historyIndex + 1);
                newHistory.push(newContent);
                return newHistory;
            });
            setHistoryIndex(prev => prev + 1);
        }, 500);
    };

    const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const val = e.target.value;
        setContent(val);
        if (!isUndoRedo.current) {
            addToHistory(val);
        }
        isUndoRedo.current = false;
    };

    const handleUndo = () => {
        if (historyIndex > 0) {
            isUndoRedo.current = true;
            const prevIndex = historyIndex - 1;
            const prevContent = history[prevIndex];
            setContent(prevContent);
            setHistoryIndex(prevIndex);
        }
    };

    const handleRedo = () => {
        if (historyIndex < history.length - 1) {
            isUndoRedo.current = true;
            const nextIndex = historyIndex + 1;
            const nextContent = history[nextIndex];
            setContent(nextContent);
            setHistoryIndex(nextIndex);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
            e.preventDefault();
            if (e.shiftKey) {
                handleRedo();
            } else {
                handleUndo();
            }
        } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
            e.preventDefault();
            handleRedo();
        }
    };

    const handleSave = async () => {
        if (!name.trim()) return;

        // Ensure .txt extension
        let finalName = name.trim();
        if (!finalName.toLowerCase().endsWith('.txt')) {
            finalName += '.txt';
        }

        setIsCreating(true);
        try {
            await onCreate(finalName, content);
            onClose();
        } catch (error) {
            console.error(error);
        } finally {
            setIsCreating(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-[#F9FBFD] z-[200] flex flex-col animate-in fade-in duration-200">
            {/* Toolbar/Header */}
            <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between shadow-sm z-10">
                <div className="flex items-center gap-4 flex-1">
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors"
                        title="Back"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>

                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white shadow-sm">
                            <FileText className="w-5 h-5" />
                        </div>
                        <div>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="text-lg font-medium text-slate-800 border-none focus:ring-0 p-0 hover:bg-slate-50 rounded px-1 -ml-1 w-full max-w-[300px] placeholder-slate-400"
                                placeholder="Untitled document"
                            />
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="hidden sm:flex items-center gap-1 mr-4 text-slate-500">
                        <button
                            onClick={handleUndo}
                            disabled={historyIndex <= 0}
                            className={`p-1.5 rounded transition-colors ${historyIndex > 0 ? 'hover:bg-slate-100 text-slate-600' : 'text-slate-300 cursor-not-allowed'}`}
                            title="Undo (Ctrl+Z)"
                        >
                            <Undo className="w-4 h-4" />
                        </button>
                        <button
                            onClick={handleRedo}
                            disabled={historyIndex >= history.length - 1}
                            className={`p-1.5 rounded transition-colors ${historyIndex < history.length - 1 ? 'hover:bg-slate-100 text-slate-600' : 'text-slate-300 cursor-not-allowed'}`}
                            title="Redo (Ctrl+Y)"
                        >
                            <Redo className="w-4 h-4" />
                        </button>
                    </div>

                    <button
                        onClick={handleSave}
                        disabled={isCreating}
                        className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-full font-medium shadow-md transition-all flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed text-sm"
                    >
                        {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Save to Drive
                    </button>

                    <button className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-300 transition-colors">
                        <div className="w-5 h-5 bg-gradient-to-br from-purple-500 to-indigo-500 rounded-full"></div>
                    </button>
                </div>
            </div>

            {/* Editor Area */}
            <div className="flex-1 overflow-y-auto bg-[#F9FBFD] p-4 sm:p-8 flex justify-center">
                <div className="w-full max-w-[850px] min-h-[1100px] bg-white shadow-lg border border-slate-200 rounded-sm sm:my-2 animate-in slide-in-from-bottom-4 duration-500 flex flex-col relative">
                    <textarea
                        value={content}
                        onChange={handleContentChange}
                        onKeyDown={handleKeyDown}
                        className="flex-1 w-full px-8 py-8 resize-none outline-none text-slate-800 font-sans leading-relaxed text-base"
                        placeholder="Start typing..."
                        spellCheck={false}
                    />
                </div>
            </div>
        </div>
    );
}
