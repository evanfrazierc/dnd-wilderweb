import { useState } from "react";
import "./App.css";
import Dashboard from "./components/Dashboard.jsx";
import CalendarView from "./components/CalendarView.jsx";
import Settlements from "./components/Settlements.jsx";
import History from "./components/History.jsx";
import Codex from "./components/Codex.jsx";

const PAGES = [
  { key: "dashboard", label: "Kingdom Dashboard", Component: Dashboard },
  { key: "calendar", label: "Calendar", Component: CalendarView },
  { key: "settlements", label: "Settlements", Component: Settlements },
  { key: "history", label: "History Log", Component: History },
  { key: "codex", label: "Codex", Component: Codex },
];

function App() {
  const [page, setPage] = useState("dashboard");
  const Active = PAGES.find((p) => p.key === page).Component;

  return (
    <div className="app-shell">
      <nav className="sidebar">
        <div>
          <h1 className="sidebar-title">Wilderweb</h1>
          <p className="sidebar-subtitle">Stirling Reach campaign tracker</p>
        </div>
        <ul className="nav-list">
          {PAGES.map((p) => (
            <li key={p.key}>
              <button
                className={`nav-item${page === p.key ? " active" : ""}`}
                onClick={() => setPage(p.key)}
              >
                {p.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <main className="main-content">
        <Active />
      </main>
    </div>
  );
}

export default App;
