import { Header } from "~/app/_components/Header";
import { SidebarProvider } from "~/app/_components/FloatingSidebar";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
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