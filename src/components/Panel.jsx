export default function Panel({ label, children }) {
  return (
    <div className="mt-6 p-4 bg-zinc-900 border border-zinc-700 rounded">
      <h3 className="mb-3 text-gray-300">{label}</h3>
      {children}
    </div>
  );
}