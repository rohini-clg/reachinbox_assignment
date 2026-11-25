"use client"
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Clock, Send, Plus, Mail, Activity } from 'lucide-react';
import { useSession } from 'next-auth/react';

const Sidebar = () => {
    const pathname = usePathname();

    const { data: session } = useSession();
    const navItems = [
        { name: 'Scheduled', icon: Clock, path: '/dashboard' },
        { name: 'Sent', icon: Send, path: '/dashboard/sent' },
        { name: 'Queue', icon: Activity, path: '/dashboard/queue' },
    ];
    const user = session?.user;
    const initials = user?.name?.trim().charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase() || '?';

    return (
        <div className="w-64 h-screen border-r border-gray-100 p-6 flex flex-col gap-8 bg-[#fcfcfc]">
            <div className="flex items-center gap-2 px-2">
                <Mail className="w-8 h-8 text-[#00a854]" />
                <span className="text-2xl font-bold">ReachInbox</span>
            </div>

            <div className="flex flex-col gap-1">
                <div className="bg-gray-50 rounded-lg p-3 flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center text-green-700 font-semibold">
                        {initials}
                    </div>
                    <div>
                        <p className="font-semibold text-sm">{user?.name || 'Signed in user'}</p>
                        <p className="text-xs text-gray-500">{user?.email}</p>
                    </div>
                </div>

                <Link
                    href="/dashboard/compose"
                    className="flex items-center justify-center gap-2 bg-white border border-[#00a854] text-[#00a854] py-2 rounded-full hover:bg-green-50 transition-all font-medium mb-8"
                >
                    <Plus size={18} /> Compose
                </Link>

                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-2 mb-2">Core</p>

                {navItems.map((item) => (
                    <Link
                        key={item.name}
                        href={item.path}
                        className={`flex items-center justify-between px-3 py-2 rounded-md transition-colors ${pathname === item.path ? 'bg-green-50 text-[#00a854]' : 'text-gray-600 hover:bg-gray-50'
                            }`}
                    >
                        <div className="flex items-center gap-3">
                            <item.icon size={18} />
                            <span className="font-medium">{item.name}</span>
                        </div>
                    </Link>
                ))}
            </div>
        </div>
    );
};

export default Sidebar;
