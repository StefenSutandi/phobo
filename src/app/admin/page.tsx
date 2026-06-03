import Link from "next/link";

export default function Admin() {
  return (
    <main className="admin-page">
      <div className="admin-header">
        <div>
          <span className="mock-badge">MOCK</span>
          <h1>Admin Dashboard</h1>
        </div>
        <Link href="/" className="admin-button">
          Exit Admin
        </Link>
      </div>

      <section className="admin-card">
        <h2>Phobo Photobox Kiosk System</h2>
        <p>Current admin tools are mock controls for development and kiosk setup checks.</p>
      </section>

      <section className="admin-card">
        <h2>Tools</h2>
        <p>
          <Link href="/hardware-check">Hardware Status Check (MOCK)</Link>
        </p>
        <p>Settings: Coming soon</p>
        <p>Session Logs: Coming soon</p>
      </section>
    </main>
  );
}
