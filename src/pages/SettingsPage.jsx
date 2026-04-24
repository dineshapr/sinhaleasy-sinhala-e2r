import { Sun, Moon, Monitor, Palette } from "lucide-react";

export default function SettingsPage({ theme, setTheme }) {
    const themes = [
        { id: "light", label: "Light", icon: <Sun size={18} /> },
        { id: "dark", label: "Dark", icon: <Moon size={18} /> },
    ];

    return (
        <div className="min-h-screen p-6 md:p-12">
            <div className="max-w-3xl mx-auto">
                <header className="mb-10">
                    <h1 className="text-3xl font-bold dark:text-white text-zinc-900 mb-2">Settings</h1>
                    <p className="dark:text-zinc-500 text-zinc-600">Manage your application preferences.</p>
                </header>

                <section className="bg-white dark:bg-zinc-900 border dark:border-zinc-800 border-zinc-200 rounded-2xl overflow-hidden shadow-sm">
                    <div className="p-6 border-b dark:border-zinc-800 border-zinc-100 flex items-center gap-3">
                        <Palette className="text-blue-500" size={20} />
                        <h2 className="text-lg font-semibold dark:text-white text-zinc-900">Appearance</h2>
                    </div>

                    <div className="p-6">
                        <p className="text-sm dark:text-zinc-400 text-zinc-600 mb-4">Choose how SINHALEASY looks to you.</p>

                        <div className="grid grid-cols-2 gap-4">
                            {themes.map((t) => (
                                <button
                                    key={t.id}
                                    onClick={() => setTheme(t.id)}
                                    className={`
                    flex items-center justify-center gap-3 p-4 rounded-xl border-2 transition-all
                    ${theme === t.id
                                            ? "border-blue-500 bg-blue-50 dark:bg-blue-500/10 dark:text-blue-400 text-blue-600"
                                            : "border-transparent bg-zinc-100 dark:bg-zinc-800 dark:text-zinc-400 text-zinc-600 hover:bg-zinc-200 dark:hover:bg-zinc-700"}
                  `}
                                >
                                    {t.icon}
                                    <span className="font-medium">{t.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
}