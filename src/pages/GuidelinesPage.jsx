import { GUIDELINES } from "../constants/guidelines";

export default function GuidelinesPage() {
  const syntactic = GUIDELINES.filter((g) => !g.layout);
  const layout = GUIDELINES.filter((g) => g.layout);

  const GuidelineCard = ({ item }) => (
    <div className="dark:bg-zinc-900 bg-white border dark:border-zinc-800 border-zinc-200 p-5 rounded-xl transition-all duration-200 shadow-sm">
      <h3 className="dark:text-zinc-100 text-zinc-900 font-semibold mb-2">{item.rule}</h3>
      <p className="dark:text-zinc-400 text-zinc-600 text-sm leading-relaxed">{item.desc.en}</p>
      <p className="dark:text-zinc-400 text-zinc-600 text-sm leading-relaxed">{item.desc.si}</p>
      <p className="dark:text-zinc-400 text-zinc-600 text-sm leading-relaxed">{item.desc.ta}</p>
    </div>
  );

  return (
    <div className="min-h-screen dark:bg-zinc-950 bg-zinc-50 p-6 md:p-12">
      <div className="max-w-5xl mx-auto">
        <header className="mb-10">
          <h1 className="text-3xl font-bold dark:text-white text-zinc-900 mb-2">Guidelines</h1>
          <p className="text-zinc-500">Standardizing the Sinhala language adaptation process.</p>
        </header>

        {/* Syntactic Section */}
        <section className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <h2 className="text-xl font-medium dark:text-white text-zinc-800">Syntactic Rules</h2>
            <div className="h-px bg-zinc-800 flex-grow"></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {syntactic.map((g) => (
              <GuidelineCard key={g.id} item={g} />
            ))}
          </div>
        </section>

        {/* Layout Section */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <h2 className="text-xl font-medium dark:text-white text-zinc-800">Layout Rules</h2>
            <div className="h-px bg-zinc-800 flex-grow"></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {layout.map((g) => (
              <GuidelineCard key={g.id} item={g} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}