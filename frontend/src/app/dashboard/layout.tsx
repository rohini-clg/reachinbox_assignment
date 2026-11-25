import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) redirect('/login');

    return (
        <div className="flex h-screen bg-white text-gray-900 overflow-hidden">
            <Sidebar />
            <div className="flex-1 flex flex-col">
                <Header />
                <main className="flex-1 overflow-y-auto bg-white">{children}</main>
            </div>
        </div>
    );
}
