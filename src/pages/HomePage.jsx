import { useState, useCallback, useRef } from "react";
import { callE2R, callE2RBatch, checkE2RHealth } from "../services/e2rService";
import { splitParagraphs } from "../utils/helpers";
import { saveAs } from "file-saver";
import jsPDF from "jspdf";
import Papa from "papaparse";
import * as pdfjsLib from "pdfjs-dist";
import mammoth from "mammoth";
import {
    Upload, FileText, CheckCircle, X, Download,
    RefreshCw, Wifi, WifiOff, ChevronRight,
    BarChart2, Clock, Zap,
} from "lucide-react";

pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

// ─── Text extraction ──────────────────────────────────────────────────────────
const extractText = async (file) => {
    const type = file.type;

    if (type === "text/plain") return await file.text();

    if (type.includes("csv")) {
        return new Promise((resolve) => {
            Papa.parse(file, {
                complete: (res) => resolve(res.data.flat().join(" ")),
            });
        });
    }

    if (type === "application/pdf") {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = async () => {
                const pdf = await pdfjsLib.getDocument(new Uint8Array(reader.result)).promise;
                let text = "";
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const content = await page.getTextContent();
                    text += content.items.map((s) => s.str).join(" ") + "\n\n";
                }
                resolve(text);
            };
            reader.readAsArrayBuffer(file);
        });
    }

    if (type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
        const arrayBuffer = await file.arrayBuffer();

        // This is the specific block that was causing the error
        // It MUST be inside this 'async' function to use 'await'
        const result = await mammoth.convertToHtml({
            arrayBuffer,
            convertImage: mammoth.images.imgElement(async (image) => {
                const imageBuffer = await image.read("base64");
                return {
                    src: `data:${image.contentType};base64,${imageBuffer}`
                };
            })
        });
        return result.value;
    }

    return "";
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const splitSentences = (text) => {
    if (!text) return [];
    return (
        text
            .replace(/\n+/g, " ")
            .match(/[^.!?]+[.!?]+|[^.!?]+$/g)
            ?.map((s) => s.trim())
            .filter(Boolean) || []
    );
};

const avgScore = (items, key) => {
    if (!items.length) return 0;
    return Math.round(items.reduce((s, r) => s + (r[key] || 0), 0) / items.length);
};

// ─── Score badge ──────────────────────────────────────────────────────────────
const ScorePill = ({ label, value, accent = false }) => (
    <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${accent
            ? "bg-emerald-100 text-emerald-700"
            : "bg-zinc-100 text-zinc-500"
            }`}
    >
        {label}: {value}%
    </span>
);

// ─── API status indicator ─────────────────────────────────────────────────────
const ApiStatus = ({ status }) => {
    const map = {
        checking: { icon: <RefreshCw size={13} className="animate-spin" />, label: "Checking…", cls: "text-zinc-400" },
        online: { icon: <Wifi size={13} />, label: "API online", cls: "text-emerald-500" },
        offline: { icon: <WifiOff size={13} />, label: "API offline", cls: "text-rose-400" },
        idle: { icon: null, label: "", cls: "" },
    };
    const { icon, label, cls } = map[status] || map.idle;
    if (!label) return null;
    return (
        <span className={`flex items-center gap-1.5 text-xs font-medium ${cls}`}>
            {icon} {label}
        </span>
    );
};

// ─── Main component ───────────────────────────────────────────────────────────
export default function HomePage() {
    const [file, setFile] = useState(null);
    const [results, setResults] = useState([]);   // { text, scoreBefore, scoreAfter, timeMs }
    const [loading, setLoading] = useState(false);
    const [progress, setProgress] = useState({ done: 0, total: 0 });
    const [showModal, setShowModal] = useState(false);
    const [apiStatus, setApiStatus] = useState("idle"); // idle | checking | online | offline
    const [dragOver, setDragOver] = useState(false);
    const fileInputRef = useRef(null);
    const [inputMode, setInputMode] = useState("file"); // "file" or "text"
    const [pastedText, setPastedText] = useState("");

    // ── API health ping ──────────────────────────────────────────────────────────
    const pingApi = useCallback(async () => {
        setApiStatus("checking");
        const ok = await checkE2RHealth();
        setApiStatus(ok ? "online" : "offline");
    }, []);

    // ── File selection ───────────────────────────────────────────────────────────
    const handleFile = (f) => {
        if (!f) return;
        const allowed = ["text/plain", "text/csv", "application/pdf",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
        if (!allowed.includes(f.type) && !f.name.endsWith(".csv")) return;
        setFile(f);
        setResults([]);
    };

    const onFileInput = (e) => handleFile(e.target.files[0]);
    const onDrop = (e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); };
    const onDragOver = (e) => { e.preventDefault(); setDragOver(true); };
    const onDragLeave = () => setDragOver(false);

    // ── Conversion ───────────────────────────────────────────────────────────────
    const handleConvert = async () => {
        // Check if we have content based on the active mode
        const hasContent = inputMode === "file" ? !!file : pastedText.trim().length > 0;
        if (!hasContent) return;

        setLoading(true);
        setResults([]);
        setProgress({ done: 0, total: 0 });

        try {
            // Source selection
            const raw = inputMode === "file"
                ? await extractText(file)
                : pastedText;

            const paragraphs = splitParagraphs(raw);
            setProgress({ done: 0, total: paragraphs.length });

            const output = [];
            for (let i = 0; i < paragraphs.length; i++) {
                const paragraphText = paragraphs[i];
                const sentences = splitSentences(paragraphText);

                const simplifiedSentences = await Promise.all(
                    sentences.map(async (s) => {
                        const r = await callE2R(s);
                        return r.simplified;
                    })
                );

                output.push({
                    id: i + 1,
                    text: simplifiedSentences.join(" "),
                    imageUrl: null
                });
                setProgress((p) => ({ ...p, done: i + 1, total: paragraphs.length }));
            }

            setResults(output);
            setShowModal(true);
        } catch (err) {
            console.error("Conversion error:", err);
        } finally {
            setLoading(false);
        }
    };
    // ── Export ────────────────────────────────────────────────────────────────────
    const exportFile = () => {
        const text = results.map((r) => r.text).join("\n\n");

        if (file?.type === "application/pdf") {
            const pdf = new jsPDF();
            let y = 15;
            results.forEach((r) => {
                const lines = pdf.splitTextToSize(r.text, 180);
                if (y + lines.length * 8 > 280) { pdf.addPage(); y = 15; }
                pdf.text(lines, 15, y);
                y += lines.length * 8 + 6;
            });
            pdf.save("SINHALEASY_Output.pdf");
        } else {
            saveAs(
                new Blob([text], { type: "text/plain;charset=utf-8" }),
                "SINHALEASY_Output.txt"
            );
        }
    };

    // ── Derived stats ─────────────────────────────────────────────────────────────
    const avgBefore = avgScore(results.filter((r) => r.scoreBefore), "scoreBefore");
    const avgAfter = avgScore(results.filter((r) => r.scoreAfter), "scoreAfter");
    const totalMs = results.reduce((s, r) => s + (r.timeMs || 0), 0);
    const hasScores = results.some((r) => r.scoreAfter > 0);

    // ─────────────────────────────────────────────────────────────────────────────
    return (
        <div className="min-h-screen dark:bg-zinc-950 flex flex-col items-center justify-start px-4 py-16">

            {/* ── Header ── */}
            <div className="w-full max-w-xl text-center mb-10">
                <div className="inline-flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-full px-4 py-1.5 mb-5">
                    <Zap size={13} className="text-amber-400" />
                    <span className="text-xs text-zinc-400 font-medium tracking-wide">
                        BERT CWI · mT5 · Easy-to-Read
                    </span>
                </div>
                <h1 className="text-4xl font-bold dark:text-white text-zinc-900 tracking-tight mb-2">
                    SINHALEASY
                </h1>
                <p className="dark:text-zinc-500 text-zinc-600 text-sm leading-relaxed">
                    Adapt complex Sinhala documents into E2R-compliant easy-to-read format.
                </p>
                <div className="flex items-center justify-center gap-3 mt-4">
                    <ApiStatus status={apiStatus} />
                    <button onClick={pingApi} className="text-xs text-zinc-600 hover:text-zinc-300 underline underline-offset-2 transition-colors">
                        Check API
                    </button>
                </div>
            </div>

            {/* ── New: Mode Switcher ── */}
            <div className="flex bg-zinc-100 dark:bg-zinc-900 p-1 rounded-xl mb-6 w-full max-w-xl">
                <button
                    onClick={() => setInputMode("file")}
                    className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${inputMode === "file"
                            ? "bg-white dark:bg-zinc-800 shadow-sm dark:text-white text-zinc-900"
                            : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                        }`}
                >
                    Upload File
                </button>
                <button
                    onClick={() => setInputMode("text")}
                    className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${inputMode === "text"
                            ? "bg-white dark:bg-zinc-800 shadow-sm dark:text-white text-zinc-900"
                            : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                        }`}
                >
                    Paste Text
                </button>
            </div>

            <div className="w-full max-w-xl">
                {/* ── Conditional Input Area ── */}
                {inputMode === "file" ? (
                    /* Existing Upload Box */
                    <div
                        onDrop={onDrop}
                        onDragOver={onDragOver}
                        onDragLeave={onDragLeave}
                        onClick={() => fileInputRef.current?.click()}
                        className={`
                            relative cursor-pointer rounded-2xl border-2 border-dashed p-12
                            flex flex-col items-center gap-4 transition-all duration-200
                            ${dragOver
                                ? "dark:border-white border-blue-500 dark:bg-zinc-800 bg-blue-50"
                                : "dark:border-zinc-800 border-zinc-200 dark:bg-zinc-900 bg-white hover:border-zinc-400 dark:hover:border-zinc-600"}
                        `}
                    >
                        <div className={`p-4 rounded-full transition-colors ${dragOver ? "dark:bg-white bg-blue-500" : "dark:bg-zinc-800 bg-zinc-100"}`}>
                            <Upload size={28} className={dragOver ? "dark:text-black text-white" : "dark:text-zinc-400 text-zinc-500"} />
                        </div>
                        <div className="text-center">
                            <p className="dark:text-white text-zinc-900 font-semibold">
                                {dragOver ? "Drop to upload" : "Click or drag a file here"}
                            </p>
                            <p className="dark:text-zinc-600 text-zinc-500 text-xs mt-1">PDF · DOCX · TXT · CSV</p>
                        </div>
                        <input ref={fileInputRef} type="file" className="hidden" accept=".txt,.csv,.pdf,.docx" onChange={onFileInput} />
                    </div>
                ) : (
                    /* New: Manual Textarea Box */
                    <div className="group relative">
                        <textarea
                            value={pastedText}
                            onChange={(e) => setPastedText(e.target.value)}
                            placeholder="Paste your Sinhala paragraph here..."
                            className="w-full h-56 p-6 rounded-2xl border-2 border-dashed 
                                dark:bg-zinc-900 bg-white dark:border-zinc-800 border-zinc-200 
                                dark:text-zinc-100 text-zinc-900 text-lg leading-relaxed
                                focus:border-blue-500 dark:focus:border-zinc-600 outline-none transition-all
                                resize-none scrollbar-hide"
                        />
                        {pastedText && (
                            <button
                                onClick={() => setPastedText("")}
                                className="absolute top-4 right-4 p-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-400 hover:text-rose-500 transition-colors"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>
                )}

                {/* File pill (Show only in File mode) */}
                {inputMode === "file" && file && (
                    <div className="mt-3 flex items-center justify-between dark:bg-zinc-900 bg-white border dark:border-zinc-800 border-zinc-200 rounded-xl px-4 py-3 shadow-sm">
                        <div className="flex items-center gap-3">
                            <FileText size={18} className="dark:text-blue-400 text-blue-600 shrink-0" />
                            <div>
                                <p className="text-sm dark:text-white text-zinc-900 font-medium leading-none truncate max-w-[200px]">{file.name}</p>
                                <p className="text-xs dark:text-zinc-500 text-zinc-500 mt-0.5">{(file.size / 1024).toFixed(1)} KB</p>
                            </div>
                        </div>
                        <button onClick={() => { setFile(null); setResults([]); }} className="dark:text-zinc-600 text-zinc-400 hover:text-rose-500 transition-colors p-1">
                            <X size={16} />
                        </button>
                    </div>
                )}

                {/* Progress bar and Convert Button (Shared) */}
                {loading && progress.total > 0 && (
                    <div className="mt-4">
                        <div className="flex justify-between text-xs dark:text-zinc-500 text-zinc-500 mb-1.5 font-medium">
                            <span>Processing sentences…</span>
                            <span>{progress.done} / {progress.total}</span>
                        </div>
                        <div className="h-1.5 dark:bg-zinc-800 bg-zinc-200 rounded-full overflow-hidden">
                            <div
                                className="h-full dark:bg-white bg-zinc-900 rounded-full transition-all duration-300"
                                style={{ width: `${(progress.done / progress.total) * 100}%` }}
                            />
                        </div>
                    </div>
                )}

                <button
                    disabled={loading || (inputMode === "file" ? !file : !pastedText.trim())}
                    onClick={handleConvert}
                    className={`
                        w-full mt-4 py-3.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2
                        transition-all duration-200
                        ${loading || (inputMode === "file" ? !file : !pastedText.trim())
                            ? "dark:bg-zinc-800 bg-zinc-200 dark:text-zinc-600 text-zinc-400 cursor-not-allowed"
                            : "dark:bg-white bg-zinc-900 dark:text-black text-white hover:opacity-90 active:scale-[0.99] shadow-lg"}
                    `}
                >
                    {loading ? <><RefreshCw size={16} className="animate-spin" /> Processing…</> : <><CheckCircle size={16} /> Convert to E2R</>}
                </button>
            </div>

            {/* ── Results modal ── */}
            {showModal && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-0 sm:p-6 transition-all">
                    <div className="bg-white dark:bg-zinc-900 w-full sm:max-w-4xl h-full sm:h-[90vh] sm:rounded-3xl flex flex-col overflow-hidden shadow-2xl border dark:border-zinc-800 border-zinc-200">

                        {/* Header - High Contrast */}
                        <div className="flex items-center justify-between px-8 py-5 border-b dark:border-zinc-800 border-zinc-200 bg-zinc-50 dark:bg-zinc-950">
                            <div>
                                <h2 className="text-xl font-bold dark:text-white text-zinc-900">Converted Document</h2>
                                <p className="text-xs dark:text-zinc-500 text-zinc-500 mt-1">E2R Compliant Layout Applied</p>
                            </div>
                            <button onClick={() => setShowModal(false)} className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-full transition-colors">
                                <X size={24} className="dark:text-white text-zinc-900" />
                            </button>
                        </div>

                        {/* Content Area - Applying Layout Rules 15, 17, 18, 21 */}
                        {/* Content Area - Inside the Modal */}
                        <div className="overflow-y-auto flex-1 px-8 py-10 bg-white dark:bg-zinc-900">
                            <div className="max-w-2xl mx-auto">
                                {results.map((item) => (
                                    <div key={item.id} className="mb-10 flex flex-col gap-4">

                                        {/* Paragraph Number Indicator (Rule 12 compliant) */}
                                        {/* <div className="flex items-center gap-3 opacity-40 select-none">
                                            <span className="text-[10px] font-bold dark:text-zinc-500 text-zinc-400 uppercase tracking-widest">
                                                Paragraph {item.id}
                                            </span>
                                            <div className="h-px flex-1 bg-zinc-100 dark:bg-zinc-800" />
                                        </div> */}

                                        {/* E2R Layout: Rule 15 (Spacing), 17 (Large Font), 18 (Left Align) */}
                                        <div
                                            className="
                        prose-e2r
                        text-lg md:text-xl
                        leading-[1.8] 
                        text-left 
                        dark:text-zinc-100 text-zinc-900
                        font-normal
                        transition-colors
                    "
                                            dangerouslySetInnerHTML={{ __html: item.text }}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="px-8 py-5 border-t dark:border-zinc-800 border-zinc-200 bg-zinc-50 dark:bg-zinc-950 flex justify-end items-center gap-4">
                            <button
                                onClick={exportFile}
                                className="flex items-center gap-2 bg-zinc-900 dark:bg-white text-white dark:text-black px-6 py-3 rounded-xl text-md font-bold hover:opacity-90 active:scale-[0.98] transition-all shadow-lg"
                            >
                                <Download size={18} />
                                Save Document
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
