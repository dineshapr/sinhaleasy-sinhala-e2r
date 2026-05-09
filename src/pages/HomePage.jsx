import { useState, useCallback, useRef, useEffect } from "react";
import { callE2R, callE2RBatch, checkE2RHealth } from "../services/e2rService";
import { saveAs } from "file-saver";
import jsPDF from "jspdf";
import Papa from "papaparse";
import mammoth from "mammoth";
import {
    Upload, FileText, CheckCircle, X, Download,
    RefreshCw, Wifi, WifiOff, Zap,
} from "lucide-react";

// ─── PDF.js lazy-loaded with correct worker ───────────────────────────────────
let pdfjsLib = null;

const getPdfJs = async () => {
    if (pdfjsLib) return pdfjsLib;

    // Dynamic import so webpack doesn't try to bundle the worker
    const pdfjs = await import("pdfjs-dist");

    // Use unpkg which mirrors every npm version including .mjs workers for v4+
    pdfjs.GlobalWorkerOptions.workerSrc =
        `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

    pdfjsLib = pdfjs;
    return pdfjsLib;
};

// ─── Text extraction ──────────────────────────────────────────────────────────
const extractText = async (file) => {
    const type = file.type;

    if (type === "text/plain") {
        return await file.text();
    }

    if (type.includes("csv") || file.name.endsWith(".csv")) {
        return new Promise((resolve, reject) => {
            Papa.parse(file, {
                complete: (res) => resolve(res.data.flat().filter(Boolean).join(" ")),
                error: (err) => reject(err),
            });
        });
    }

    if (type === "application/pdf") {
        try {
            const pdfjs = await getPdfJs();
            const arrayBuffer = await file.arrayBuffer();
            const loadingTask = pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) });
            const pdf = await loadingTask.promise;

            let fullText = "";
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const content = await page.getTextContent();

                // Reconstruct text with proper spacing — items can have transform data
                const pageText = content.items
                    .map((item) => {
                        // TextItem has a 'str' field; TextMarkedContent may not
                        return "str" in item ? item.str : "";
                    })
                    .join(" ")
                    .replace(/\s{2,}/g, " ")
                    .trim();

                fullText += pageText + "\n\n";
            }
            return fullText.trim();
        } catch (err) {
            console.error("PDF extraction failed:", err);
            throw new Error(`PDF extraction failed: ${err.message}`);
        }
    }

    if (
        type ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
        try {
            const arrayBuffer = await file.arrayBuffer();
            const result = await mammoth.convertToHtml({
                arrayBuffer,
                convertImage: mammoth.images.imgElement(async (image) => {
                    const imageBuffer = await image.read("base64");
                    return {
                        src: `data:${image.contentType};base64,${imageBuffer}`,
                    };
                }),
            });
            return result.value;
        } catch (err) {
            console.error("DOCX extraction failed:", err);
            throw new Error(`DOCX extraction failed: ${err.message}`);
        }
    }

    throw new Error(`Unsupported file type: ${type}`);
};

// ─── Text preprocessing ───────────────────────────────────────────────────────

/**
 * Strip HTML tags that mammoth produces for DOCX files.
 * Converts <br>, <p>, <li> block elements to spaces so sentence
 * boundaries are preserved, then removes all remaining tags.
 */
const stripHtml = (html) =>
    html
        .replace(/<br\s*\/?>/gi, " ")
        .replace(/<\/?(p|li|div|h[1-6]|tr|td|th)[^>]*>/gi, " ")
        .replace(/<[^>]+>/g, "")          // strip remaining tags
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"');

/**
 * General-purpose cleanup applied to every extracted string:
 *  - collapses whitespace / newlines
 *  - removes zero-width and control characters
 *  - trims
 */
const cleanWhitespace = (text) =>
    text
        // ── Null bytes and C0/C1 control chars (except \t \n) ──────────────
        .replace(/\u0000/g, "")                         // null byte — kills API calls
        .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "") // other ASCII controls
        .replace(/[\x80-\x9F]/g, "")                    // C1 control block
        // ── Invisible / formatting Unicode ─────────────────────────────────
        .replace(/[\u200B-\u200D\uFEFF\u00AD\u2028\u2029]/g, "") // zero-width + line/para sep
        .replace(/[\uFFF0-\uFFFF]/g, "")                // specials block
        // ── Whitespace normalisation ────────────────────────────────────────
        .replace(/\r\n|\r/g, "\n")                      // normalise line endings
        .replace(/[ \t\u00A0\u3000]+/g, " ")            // collapse spaces (incl. NBSP, ideographic)
        .replace(/\n{3,}/g, "\n\n")                     // max 2 consecutive newlines
        .trim();

/**
 * Split a clean plain-text string into individual sentences.
 *
 * Handles:
 *  - ASCII sentence enders: . ! ?
 *  - Sinhala full stop: ෴  and ideographic full stop: 。
 *  - Devanagari danda: ।  (used in some Sinhala typing systems)
 *
 * Each sentence keeps its terminal punctuation and is trimmed.
 * Empty / whitespace-only strings are filtered out.
 * Minimum length of 3 chars guards against lone punctuation fragments.
 */
const splitIntoSentences = (text) => {
    if (!text || !text.trim()) return [];

    // Split AFTER sentence-ending punctuation, keeping the delimiter
    const raw = text
        .split(/(?<=[.!?෴。।])\s+/)          // look-behind: split after punctuation
        .flatMap((chunk) =>
            // Fallback: if a chunk is very long with no punctuation, split on newlines
            chunk.length > 400
                ? chunk.split(/\n+/)
                : [chunk]
        )
        .map((s) => s.trim())
        .filter((s) => s.length >= 3);

    return raw;
};

/**
 * Full pipeline for file-extracted text:
 *  1. Strip HTML (DOCX produces it)
 *  2. Clean whitespace
 *  3. Split into sentences
 *  4. Return array of sentence strings ready for the batch API
 */
const preprocessExtracted = (raw) => {
    const noHtml = stripHtml(raw);
    const clean = cleanWhitespace(noHtml);
    const sentences = splitIntoSentences(clean);
    return sentences;
};

// ─── API status indicator ─────────────────────────────────────────────────────
const ApiStatus = ({ status }) => {
    const map = {
        checking: {
            icon: <RefreshCw size={13} className="animate-spin" />,
            label: "Checking…",
            cls: "text-zinc-400",
        },
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
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [progress, setProgress] = useState({ done: 0, total: 0 });
    const [showModal, setShowModal] = useState(false);
    const [apiStatus, setApiStatus] = useState("idle");
    const [dragOver, setDragOver] = useState(false);
    const [inputMode, setInputMode] = useState("file"); // "file" | "text"
    const [pastedText, setPastedText] = useState("");
    const [error, setError] = useState(null);
    const fileInputRef = useRef(null);

    // Pre-warm the PDF.js worker on mount so the first upload isn't slow
    useEffect(() => {
        getPdfJs().catch(() => {
            // Silent — worker will still load lazily on first PDF upload
        });
    }, []);

    // ── API health ping ────────────────────────────────────────────────────────
    const pingApi = useCallback(async () => {
        setApiStatus("checking");
        const ok = await checkE2RHealth();
        setApiStatus(ok ? "online" : "offline");
    }, []);

    // ── File selection ─────────────────────────────────────────────────────────
    const handleFile = (f) => {
        if (!f) return;
        setError(null);
        const allowedTypes = [
            "text/plain",
            "text/csv",
            "application/pdf",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ];
        const isAllowed =
            allowedTypes.includes(f.type) || f.name.endsWith(".csv");
        if (!isAllowed) {
            setError("Unsupported file type. Please upload a PDF, DOCX, TXT, or CSV.");
            return;
        }
        setFile(f);
        setResults([]);
    };

    const onFileInput = (e) => handleFile(e.target.files[0]);
    const onDrop = (e) => {
        e.preventDefault();
        setDragOver(false);
        handleFile(e.dataTransfer.files[0]);
    };
    const onDragOver = (e) => { e.preventDefault(); setDragOver(true); };
    const onDragLeave = () => setDragOver(false);

    // ── Conversion ─────────────────────────────────────────────────────────────
    const handleConvert = async () => {
        const hasContent =
            inputMode === "file" ? !!file : pastedText.trim().length > 0;
        if (!hasContent || loading) return;

        setLoading(true);
        setResults([]);
        setError(null);
        setProgress({ done: 0, total: 0 });

        try {
            let chunks = [];

            if (inputMode === "file") {
                // ── File path: extract → preprocess → split into sentences ──
                const raw = await extractText(file);

                if (!raw || !raw.trim()) {
                    throw new Error("No text could be extracted from this file. The file may be empty, scanned, or image-based.");
                }

                // Log raw extraction for debugging
                console.debug("[E2R] Raw extracted length:", raw.length);
                console.debug("[E2R] Raw preview:", raw.slice(0, 300));

                chunks = preprocessExtracted(raw);

                if (chunks.length === 0) {
                    throw new Error("Text was extracted but could not be split into sentences. Please check the file content.");
                }

                console.debug("[E2R] Sentence chunks:", chunks.length, chunks.slice(0, 5));

            } else {
                // ── Paste path: same preprocessing pipeline as file ──
                chunks = preprocessExtracted(pastedText);
            }

            // Final JSON-safe pass — stringify round-trip catches any remaining
            // non-printable chars that regex may miss (e.g. \u0000 inside surrogates)
            const safeChunks = chunks.map((s) => {
                try {
                    return JSON.parse(JSON.stringify(s)).replace(/\u0000/g, "").trim();
                } catch {
                    return s.replace(/\u0000/g, "").trim();
                }
            }).filter((s) => s.length >= 3);

            if (safeChunks.length === 0) {
                throw new Error("Text was extracted but all sentences were empty after cleaning.");
            }

            setProgress({ done: 0, total: safeChunks.length });

            const simplified = await callE2RBatch(safeChunks);

            const output = simplified.map((text, i) => {
                setProgress((p) => ({ ...p, done: i + 1 }));
                return {
                    id: i + 1,
                    text: (text && text.trim()) ? text : safeChunks[i],
                    imageUrl: null,
                };
            });

            setResults(output);
            setShowModal(true);
        } catch (err) {
            console.error("Conversion error:", err);
            setError(err.message || "Something went wrong. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    // ── Export ─────────────────────────────────────────────────────────────────
    const exportFile = () => {
        const text = results.map((r) => r.text).join("\n\n");

        if (file?.type === "application/pdf") {
            const pdf = new jsPDF();
            let y = 15;
            results.forEach((r) => {
                const lines = pdf.splitTextToSize(r.text, 180);
                if (y + lines.length * 8 > 280) {
                    pdf.addPage();
                    y = 15;
                }
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

    // ─────────────────────────────────────────────────────────────────────────
    const canConvert = inputMode === "file" ? !!file : !!pastedText.trim();

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
                    <button
                        onClick={pingApi}
                        className="text-xs text-zinc-600 hover:text-zinc-300 underline underline-offset-2 transition-colors"
                    >
                        Check API
                    </button>
                </div>
            </div>

            {/* ── Mode Switcher ── */}
            <div className="flex bg-zinc-100 dark:bg-zinc-900 p-1 rounded-xl mb-6 w-full max-w-xl">
                {["file", "text"].map((mode) => (
                    <button
                        key={mode}
                        onClick={() => { setInputMode(mode); setError(null); }}
                        className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${inputMode === mode
                                ? "bg-white dark:bg-zinc-800 shadow-sm dark:text-white text-zinc-900"
                                : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                            }`}
                    >
                        {mode === "file" ? "Upload File" : "Paste Text"}
                    </button>
                ))}
            </div>

            <div className="w-full max-w-xl">

                {/* ── Input Area ── */}
                {inputMode === "file" ? (
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
                                : "dark:border-zinc-800 border-zinc-200 dark:bg-zinc-900 bg-white hover:border-zinc-400 dark:hover:border-zinc-600"
                            }
                        `}
                    >
                        <div className={`p-4 rounded-full transition-colors ${dragOver ? "dark:bg-white bg-blue-500" : "dark:bg-zinc-800 bg-zinc-100"}`}>
                            <Upload
                                size={28}
                                className={dragOver ? "dark:text-black text-white" : "dark:text-zinc-400 text-zinc-500"}
                            />
                        </div>
                        <div className="text-center">
                            <p className="dark:text-white text-zinc-900 font-semibold">
                                {dragOver ? "Drop to upload" : "Click or drag a file here"}
                            </p>
                            <p className="dark:text-zinc-600 text-zinc-500 text-xs mt-1">
                                PDF · DOCX · TXT · CSV
                            </p>
                        </div>
                        <input
                            ref={fileInputRef}
                            type="file"
                            className="hidden"
                            accept=".txt,.csv,.pdf,.docx"
                            onChange={onFileInput}
                        />
                    </div>
                ) : (
                    <div className="group relative">
                        <textarea
                            value={pastedText}
                            onChange={(e) => setPastedText(e.target.value)}
                            placeholder="Paste your Sinhala paragraph here..."
                            className="w-full h-56 p-6 rounded-2xl border-2 border-dashed
                                dark:bg-zinc-900 bg-white dark:border-zinc-800 border-zinc-200
                                dark:text-zinc-100 text-zinc-900 text-lg leading-relaxed
                                focus:border-blue-500 dark:focus:border-zinc-600 outline-none transition-all
                                resize-none"
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

                {/* ── File pill ── */}
                {inputMode === "file" && file && (
                    <div className="mt-3 flex items-center justify-between dark:bg-zinc-900 bg-white border dark:border-zinc-800 border-zinc-200 rounded-xl px-4 py-3 shadow-sm">
                        <div className="flex items-center gap-3">
                            <FileText size={18} className="dark:text-blue-400 text-blue-600 shrink-0" />
                            <div>
                                <p className="text-sm dark:text-white text-zinc-900 font-medium leading-none truncate max-w-[200px]">
                                    {file.name}
                                </p>
                                <p className="text-xs dark:text-zinc-500 text-zinc-500 mt-0.5">
                                    {(file.size / 1024).toFixed(1)} KB
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={() => { setFile(null); setResults([]); setError(null); }}
                            className="dark:text-zinc-600 text-zinc-400 hover:text-rose-500 transition-colors p-1"
                        >
                            <X size={16} />
                        </button>
                    </div>
                )}

                {/* ── Error banner ── */}
                {error && (
                    <div className="mt-3 flex items-start gap-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-400 rounded-xl px-4 py-3 text-sm">
                        <X size={16} className="shrink-0 mt-0.5" />
                        <span>{error}</span>
                    </div>
                )}

                {/* ── Progress bar ── */}
                {loading && progress.total > 0 && (
                    <div className="mt-4">
                        <div className="flex justify-between text-xs dark:text-zinc-500 text-zinc-500 mb-1.5 font-medium">
                            <span>{inputMode === "file" ? "Processing sentences…" : "Processing paragraphs…"}</span>
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

                {/* ── Convert button ── */}
                <button
                    disabled={loading || !canConvert}
                    onClick={handleConvert}
                    className={`
                        w-full mt-4 py-3.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2
                        transition-all duration-200
                        ${loading || !canConvert
                            ? "dark:bg-zinc-800 bg-zinc-200 dark:text-zinc-600 text-zinc-400 cursor-not-allowed"
                            : "dark:bg-white bg-zinc-900 dark:text-black text-white hover:opacity-90 active:scale-[0.99] shadow-lg"
                        }
                    `}
                >
                    {loading
                        ? <><RefreshCw size={16} className="animate-spin" /> Processing…</>
                        : <><CheckCircle size={16} /> Convert to E2R</>
                    }
                </button>
            </div>

            {/* ── Results modal ── */}
            {showModal && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-0 sm:p-6">
                    <div className="bg-white dark:bg-zinc-900 w-full sm:max-w-4xl h-full sm:h-[90vh] sm:rounded-3xl flex flex-col overflow-hidden shadow-2xl border dark:border-zinc-800 border-zinc-200">

                        {/* Modal header */}
                        <div className="flex items-center justify-between px-8 py-5 border-b dark:border-zinc-800 border-zinc-200 bg-zinc-50 dark:bg-zinc-950">
                            <div>
                                <h2 className="text-xl font-bold dark:text-white text-zinc-900">
                                    Converted Document
                                </h2>
                                <p className="text-xs dark:text-zinc-500 text-zinc-500 mt-1">
                                    E2R Compliant Layout Applied
                                </p>
                            </div>
                            <button
                                onClick={() => setShowModal(false)}
                                className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-full transition-colors"
                            >
                                <X size={24} className="dark:text-white text-zinc-900" />
                            </button>
                        </div>

                        {/* Modal content */}
                        <div className="overflow-y-auto flex-1 px-8 py-10 bg-white dark:bg-zinc-900">
                            <div className="max-w-2xl mx-auto">
                                {results.map((item) => (
                                    <div key={item.id} className="mb-10 flex flex-col gap-4">
                                        <div
                                            className="text-lg md:text-xl leading-[1.8] text-left dark:text-zinc-100 text-zinc-900 font-normal transition-colors"
                                            dangerouslySetInnerHTML={{ __html: item.text }}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Modal footer */}
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