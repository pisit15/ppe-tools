import Sidebar from './Sidebar';

export default function PPELayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1">
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
