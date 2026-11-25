"use client"
import { LogOut, Search } from 'lucide-react';
import { signOut, useSession } from 'next-auth/react';

const Header = () => {
    const { data: session } = useSession();

    return (
        <div className="flex items-center justify-between px-8 py-4 border-b border-gray-100 bg-white">
            <form action="/dashboard" method="GET" className="flex-1 max-w-2xl relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                    type="text"
                    name="search"
                    placeholder="Search"
                    className="w-full pl-10 pr-4 py-2 bg-gray-50 border-none rounded-full focus:ring-1 focus:ring-green-500 outline-none text-sm"
                />
            </form>

            <div className="flex items-center gap-4">
                {session?.user?.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={session.user.image} alt="" className="h-9 w-9 rounded-full" />
                )}
                <div className="hidden text-right sm:block">
                    <p className="text-sm font-semibold text-gray-800">{session?.user?.name}</p>
                    <p className="text-xs text-gray-500">{session?.user?.email}</p>
                </div>
                <button
                    type="button"
                    onClick={() => void signOut({ callbackUrl: '/login' })}
                    className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800"
                >
                    <LogOut size={18} />
                    <span>Logout</span>
                </button>
            </div>
        </div>
    );
};

export default Header;
