import { Header } from "~/app/_components/Header";
import { SidebarProvider } from "~/app/_components/FloatingSidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider>
      <div className="min-h-screen bg-gray-50">
        <Header />
        <main className="relative">
          {children}
        </main>
      </div>
    </SidebarProvider>
  );
}