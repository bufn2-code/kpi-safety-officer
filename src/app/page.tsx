import Link from "next/link";

export default function HomePage() {
  const daftarHalaman = [
    { nama: "Login", href: "/login" },
    { nama: "Ganti Password", href: "/ganti-password" },
    { nama: "Dashboard KPI", href: "/dashboard" },
    { nama: "Kartu KPI", href: "/kartu-kpi" },
    { nama: "Admin - Data KPI", href: "/admin/data-kpi" },
    { nama: "Admin - Master BUFN & Smelter", href: "/admin/master" },
    { nama: "Admin - Parameter & Matriks", href: "/admin/parameter" },
    { nama: "Admin - Karyawan", href: "/admin/karyawan" },
    { nama: "Admin - Pengguna (Super Admin)", href: "/admin/pengguna" },
  ];

  return (
    <main className="min-h-screen bg-slate-50 p-8 text-slate-900">
      <div className="mx-auto max-w-2xl rounded-lg border bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold">Sistem KPI Safety Officer</h1>
        <p className="mt-2 text-sm text-slate-600">
          Tahap 1 berhasil: Kerangka proyek dan struktur halaman sudah siap.
        </p>

        <div className="mt-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">
            Daftar Halaman (Placeholder)
          </h2>
          <ul className="space-y-2">
            {daftarHalaman.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="block rounded-md border px-4 py-2 text-sm font-medium text-blue-600 hover:bg-slate-50"
                >
                  {item.nama} <span className="text-slate-400">({item.href})</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </main>
  );
}