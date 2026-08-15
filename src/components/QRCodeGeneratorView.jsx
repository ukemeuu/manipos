import React, { useState, useEffect } from 'react';
import { 
    QrCode, Download, Printer, Plus, Trash2, Copy, 
    Check, Sparkles, ExternalLink, Globe, Star, FileText,
    Edit2, Loader2
} from 'lucide-react';
import { supabase } from '../lib/supabase';

export function QRCodeGeneratorView() {
    const [label, setLabel] = useState('');
    const [url, setUrl] = useState('');
    const [previewUrl, setPreviewUrl] = useState('');
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(false);
    const [copiedId, setCopiedId] = useState(null);
    const [showPrintModal, setShowPrintModal] = useState(false);
    const [printTarget, setPrintTarget] = useState(null);
    const [editingId, setEditingId] = useState(null);

    // Default presets
    const PRESETS = [
        { 
            name: 'Pot of Jollof Digital Menu', 
            url: 'https://potofjollof.manipos.com', 
            icon: Globe,
            color: 'text-orange-600 bg-orange-50 border-orange-100'
        },

        { 
            name: 'Ordering Website', 
            url: 'https://potofjollof.com/order', 
            icon: Globe,
            color: 'text-blue-600 bg-blue-50 border-blue-100'
        },
        { 
            name: 'Customer Feedback Form', 
            url: 'https://potofjollof.manipos.com/feedback', 
            icon: Star,
            color: 'text-emerald-600 bg-emerald-50 border-emerald-100'
        },
        { 
            name: 'Google Review Page', 
            url: 'https://g.page/r/CUfyoed3Iq6KEBM/review', 
            icon: Star,
            color: 'text-amber-600 bg-amber-50 border-amber-100'
        },
        { 
            name: 'General Office Sheet', 
            url: 'https://docs.google.com/spreadsheets/d/1dRx2s42HG0oTMDne-M6-iJRBvhc7ynuedDarn9sq_FU/edit?gid=2143842321#gid=2143842321', 
            icon: FileText,
            color: 'text-indigo-600 bg-indigo-50 border-indigo-100'
        }
    ];


    const fetchCodes = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('saved_qrcodes')
                .select('*')
                .order('created_at', { ascending: false });
            if (error) throw error;
            setHistory(data || []);
        } catch (err) {
            console.error('Error fetching QR codes:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchCodes();
    }, []);

    const handleApplyPreset = (preset) => {
        setLabel(preset.name);
        setUrl(preset.url);
        generateQR(preset.url);
    };

    const generateQR = (targetUrl) => {
        if (!targetUrl) return;
        const encoded = encodeURIComponent(targetUrl.trim());
        setPreviewUrl(`https://api.qrserver.com/v1/create-qr-code/?size=350x350&data=${encoded}`);
    };

    const handleSave = async (e) => {
        e.preventDefault();
        if (!label || !url) return;
        
        const encoded = encodeURIComponent(url.trim());
        const qrImgUrl = `https://api.qrserver.com/v1/create-qr-code/?size=350x350&data=${encoded}`;
        
        try {
            if (editingId) {
                const { error } = await supabase
                    .from('saved_qrcodes')
                    .update({
                        label: label.trim(),
                        url: url.trim(),
                        qr_url: qrImgUrl
                    })
                    .eq('id', editingId);
                if (error) throw error;
                setEditingId(null);
            } else {
                const { error } = await supabase
                    .from('saved_qrcodes')
                    .insert([{
                        label: label.trim(),
                        url: url.trim(),
                        qr_url: qrImgUrl
                    }]);
                if (error) throw error;
            }
            
            setLabel('');
            setUrl('');
            fetchCodes();
        } catch (err) {
            console.error('Error saving QR code:', err);
            alert('Failed to save to database: ' + err.message);
        }
    };

    const handleStartEdit = (item) => {
        setEditingId(item.id);
        setLabel(item.label);
        setUrl(item.url);
        generateQR(item.url);
    };

    const handleCancelEdit = () => {
        setEditingId(null);
        setLabel('');
        setUrl('');
        setPreviewUrl('');
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Delete this saved QR code?')) return;
        try {
            const { error } = await supabase
                .from('saved_qrcodes')
                .delete()
                .eq('id', id);
            if (error) throw error;
            fetchCodes();
        } catch (err) {
            console.error('Error deleting QR code:', err);
            alert('Failed to delete QR code: ' + err.message);
        }
    };

    const handleDownload = async (qrUrl, filename) => {
        try {
            // Fetch larger size for download quality
            const downloadUrl = qrUrl.replace('size=350x350', 'size=800x800');
            const response = await fetch(downloadUrl);
            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);
            
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = `${filename.toLowerCase().replace(/[^a-z0-9]/g, '_')}_qrcode.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(blobUrl);
        } catch (e) {
            console.error(e);
            alert('Failed to download QR code image.');
        }
    };

    const handleCopy = (text, id) => {
        navigator.clipboard.writeText(text);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const triggerPrint = (item) => {
        setPrintTarget(item);
        setShowPrintModal(true);
        setTimeout(() => {
            window.print();
        }, 300);
    };

    const formatTimestamp = (ts) => {
        if (!ts) return '';
        try {
            return new Date(ts).toLocaleDateString('en-GB', {
                day: '2-digit', month: 'short', year: 'numeric'
            });
        } catch(e) {
            return '';
        }
    };

    return (
        <div className="space-y-6">
            {/* Scoped print style overrides */}
            <style dangerouslySetInnerHTML={{__html: `
                @media print {
                    body * {
                        visibility: hidden !important;
                    }
                    #print-flyer-preview, #print-flyer-preview * {
                        visibility: visible !important;
                    }
                    #print-flyer-preview {
                        position: absolute !important;
                        left: 0 !important;
                        top: 0 !important;
                        width: 100vw !important;
                        height: 100vh !important;
                        display: flex !important;
                        flex-direction: column !important;
                        align-items: center !important;
                        justify-content: center !important;
                        background: white !important;
                        margin: 0 !important;
                        padding: 0 !important;
                    }
                }
            `}} />

            {/* Header & KPI Summary */}
            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                        <QrCode size={26} />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-gray-900">QR Code Generator & Scan Analytics</h2>
                        <p className="text-sm text-gray-500">Create, track live scan counts (+1), and print marketing & feedback QR codes</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="px-4 py-2 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2">
                        <span className="text-xs font-bold text-gray-500 uppercase">Total Scans:</span>
                        <span className="text-lg font-black text-emerald-700">
                            🔥 {history.reduce((sum, item) => sum + (item.scan_count || 0), 0)}
                        </span>
                    </div>
                    <div className="px-4 py-2 bg-blue-50 border border-blue-200 rounded-xl flex items-center gap-2">
                        <span className="text-xs font-bold text-gray-500 uppercase">Saved Codes:</span>
                        <span className="text-lg font-black text-blue-700">{history.length}</span>
                    </div>
                </div>
            </div>

            {/* Main Generator Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Form & Presets Column */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Presets Card */}
                    <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-4">
                        <h3 className="text-xs font-black uppercase tracking-widest text-gray-400 flex items-center gap-1.5">
                            <Sparkles size={14} className="text-blue-500" /> Quick Presets
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            {PRESETS.map((preset, i) => {
                                const Icon = preset.icon;
                                return (
                                    <button
                                        key={i}
                                        type="button"
                                        onClick={() => handleApplyPreset(preset)}
                                        className={`flex items-center gap-3 p-3.5 rounded-xl border text-left text-xs font-bold transition-all hover:scale-[1.02] shadow-sm hover:shadow ${preset.color}`}
                                    >
                                        <Icon size={18} />
                                        <span>{preset.name}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Generator Inputs */}
                    <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                        <form onSubmit={handleSave} className="space-y-4">
                            <h3 className="text-xs font-black uppercase tracking-widest text-gray-400">
                                {editingId ? 'Edit QR Code Details' : 'Custom Code Details'}
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-600 mb-1">Code Label / Name</label>
                                    <input
                                        type="text"
                                        required
                                        value={label}
                                        onChange={(e) => setLabel(e.target.value)}
                                        placeholder="e.g. Table 5 Menu, Feedback Flyer"
                                        className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none text-sm font-semibold"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-600 mb-1">Target URL Link</label>
                                    <input
                                        type="url"
                                        required
                                        value={url}
                                        onChange={(e) => {
                                            setUrl(e.target.value);
                                            generateQR(e.target.value);
                                        }}
                                        placeholder="https://example.com"
                                        className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none text-sm font-mono"
                                    />
                                </div>
                            </div>
                            <div className="pt-2 flex gap-2">
                                {editingId && (
                                    <button
                                        type="button"
                                        onClick={handleCancelEdit}
                                        className="flex-1 py-3 border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-xl text-xs font-bold transition-colors"
                                    >
                                        Cancel Edit
                                    </button>
                                )}
                                <button
                                    type="submit"
                                    disabled={!label || !url}
                                    className={`py-3 text-white rounded-xl text-xs font-bold transition-colors disabled:opacity-50 ${
                                        editingId ? 'flex-1 bg-amber-600 hover:bg-amber-700 animate-pulse' : 'w-full bg-gray-950 hover:bg-black'
                                    }`}
                                >
                                    {editingId ? 'Update QR Code' : 'Save QR Code to Vault'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>

                {/* Preview Column */}
                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between items-center text-center h-full min-h-[350px]">
                    <div className="w-full space-y-2">
                        <h3 className="text-xs font-black uppercase tracking-widest text-gray-400">Live Preview</h3>
                        <p className="text-xs text-gray-400">Scan code dynamically updates as you type</p>
                    </div>

                    <div className="my-6 p-4 border border-gray-150 rounded-2xl bg-white shadow-inner flex items-center justify-center w-52 h-52 shrink-0">
                        {previewUrl ? (
                            <img 
                                src={previewUrl} 
                                alt="QR Code Preview" 
                                className="w-48 h-48 object-contain"
                            />
                        ) : (
                            <div className="flex flex-col items-center justify-center gap-2 text-gray-300">
                                <QrCode size={48} className="stroke-[1.5]" />
                                <span className="text-[10px] uppercase font-bold tracking-widest">No Link Input</span>
                            </div>
                        )}
                    </div>

                    <div className="w-full flex gap-2">
                        <button
                            type="button"
                            disabled={!previewUrl}
                            onClick={() => handleDownload(previewUrl, label || 'qrcode')}
                            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 border border-gray-200 rounded-xl text-xs font-bold text-gray-600 bg-white hover:bg-gray-50 transition-colors disabled:opacity-50"
                        >
                            <Download size={14} /> Download PNG
                        </button>
                        <button
                            type="button"
                            disabled={!previewUrl}
                            onClick={() => triggerPrint({ label: label || 'Custom QR', qr_url: previewUrl, url })}
                            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-colors disabled:opacity-50 shadow-sm"
                        >
                            <Printer size={14} /> Print Flyer
                        </button>
                    </div>
                </div>

            </div>

            {/* History / Vault Card */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-5 border-b border-gray-50 flex items-center justify-between">
                    <h3 className="font-semibold text-gray-800 text-sm">Account QR Code Vault</h3>
                    {loading && <Loader2 size={16} className="animate-spin text-gray-400" />}
                </div>
                
                {loading && history.length === 0 ? (
                    <div className="p-16 text-center text-gray-400 text-sm flex items-center justify-center gap-2">
                        <Loader2 size={18} className="animate-spin text-blue-600" /> Loading account QR codes...
                    </div>
                ) : history.length === 0 ? (
                    <div className="p-16 text-center text-gray-400 text-sm italic">
                        No saved QR codes found in your account database. Create one above!
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-gray-50/50">
                                <tr className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                                    <th className="p-4 pl-6">Label / Tag</th>
                                    <th className="p-4">Destination Link</th>
                                    <th className="p-4">Date Created</th>
                                    <th className="p-4 pr-6 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {history.map((item) => (
                                    <tr key={item.id} className="hover:bg-gray-50/30 transition-colors">
                                        <td className="p-4 pl-6 font-bold text-gray-900 text-xs">
                                            {item.label}
                                        </td>
                                        <td className="p-4 text-xs font-mono text-gray-550 max-w-xs truncate">
                                            <a 
                                                href={item.url} 
                                                target="_blank" 
                                                rel="noreferrer" 
                                                className="hover:underline flex items-center gap-1 w-max"
                                            >
                                                {item.url} <ExternalLink size={10} className="text-gray-400" />
                                            </a>
                                        </td>
                                        <td className="p-4 text-xs text-gray-400 font-semibold">{formatTimestamp(item.created_at)}</td>
                                        <td className="p-4 pr-6 text-right">
                                            <div className="flex justify-end items-center gap-2">
                                                <button
                                                    onClick={() => handleCopy(item.url, item.id)}
                                                    className="p-1.5 border border-gray-100 hover:border-gray-250 bg-white rounded-lg text-gray-450 transition-all hover:text-gray-700"
                                                    title="Copy URL"
                                                >
                                                    {copiedId === item.id ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                                                </button>
                                                <button
                                                    onClick={() => handleStartEdit(item)}
                                                    className={`p-1.5 border rounded-lg transition-all ${
                                                        editingId === item.id
                                                            ? 'border-amber-250 bg-amber-50 text-amber-700 font-bold'
                                                            : 'border-gray-100 hover:border-gray-250 bg-white text-gray-450 hover:text-gray-700'
                                                    }`}
                                                    title="Edit QR Code"
                                                >
                                                    <Edit2 size={14} />
                                                </button>
                                                <button
                                                    onClick={() => triggerPrint(item)}
                                                    className="p-1.5 border border-gray-100 hover:border-gray-250 bg-white rounded-lg text-gray-450 transition-all hover:text-gray-700"
                                                    title="Print Flyer"
                                                >
                                                    <Printer size={14} />
                                                </button>
                                                <button
                                                    onClick={() => handleDownload(item.qr_url, item.label)}
                                                    className="p-1.5 border border-gray-100 hover:border-gray-250 bg-white rounded-lg text-gray-450 transition-all hover:text-gray-700"
                                                    title="Download PNG"
                                                >
                                                    <Download size={14} />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(item.id)}
                                                    className="p-1.5 border border-red-100 hover:bg-red-50 rounded-lg text-red-500 transition-all"
                                                    title="Delete"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Hidden/Overlay Printable Flyer Template */}
            {showPrintModal && printTarget && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 print:hidden">
                    <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                            <h3 className="font-bold text-gray-800 text-sm">Print Layout Preview</h3>
                            <button 
                                onClick={() => { setShowPrintModal(false); setPrintTarget(null); }}
                                className="px-3 py-1.5 text-xs bg-gray-200 hover:bg-gray-300 font-bold rounded-lg transition-colors text-gray-700"
                            >
                                Close Preview
                            </button>
                        </div>
                        
                        {/* Scrollable mockup container */}
                        <div className="p-8 max-h-[60vh] overflow-y-auto bg-gray-100 flex justify-center custom-scrollbar shadow-inner">
                            {/* Standard A4 Flyer template mockup */}
                            <div 
                                id="print-flyer-preview" 
                                className="bg-white border-[12px] border-amber-500 w-[400px] h-[550px] flex flex-col justify-between items-center p-8 text-center shadow-md box-border"
                            >
                                {/* Brand Header */}
                                <div className="space-y-1">
                                    <div className="flex items-center justify-center gap-1.5">
                                        <img src="/logo.png" alt="POJ" className="w-8 h-8 object-contain" />
                                        <span className="text-[10px] font-black tracking-widest text-white px-2 py-0.5 rounded bg-black">POJ MANAGEMENT</span>
                                    </div>
                                    <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none pt-2">
                                        {printTarget.label.toLowerCase().includes('feedback') ? 'WE VALUE YOUR FEEDBACK!' : 'SCAN TO ORDER'}
                                    </h1>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                        {printTarget.label.toLowerCase().includes('feedback') ? 'Scan code to share review' : 'Scan code to view menu & order'}
                                    </p>
                                </div>

                                {/* QR Code Frame */}
                                <div className="p-3 border-2 border-dashed border-gray-300 rounded-3xl bg-white shadow-inner flex items-center justify-center w-52 h-52 shrink-0">
                                    <img 
                                        src={printTarget.qr_url.replace('size=350x350', 'size=500x500')} 
                                        alt="Print QR Code" 
                                        className="w-48 h-48 object-contain"
                                    />
                                </div>

                                {/* Footer & Instructions */}
                                <div className="space-y-2">
                                    <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-2.5 text-[9px] text-amber-800 font-bold max-w-[260px] mx-auto leading-relaxed">
                                        Open camera on your smartphone & point at the QR code to scan.
                                    </div>
                                    <div className="text-[8px] font-black text-gray-400 uppercase tracking-widest pt-1">
                                        Thank you for dining with us! | potofjollof.com
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="p-5 border-t border-gray-100 flex justify-end gap-2 bg-gray-50/50">
                            <button
                                onClick={() => { setShowPrintModal(false); setPrintTarget(null); }}
                                className="px-4 py-2 border border-gray-200 hover:bg-gray-100 text-gray-650 rounded-xl text-xs font-bold transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => window.print()}
                                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 shadow"
                            >
                                <Printer size={14} /> Send to Printer
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}
