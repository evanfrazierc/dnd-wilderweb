import "./App.css";
import Dashboard from "./components/Dashboard.jsx";
import CalendarView from "./components/CalendarView.jsx";
import Settlements from "./components/Settlements.jsx";
import Garrison from "./components/Garrison.jsx";
import Timeline from "./components/Timeline.jsx";
import Codex from "./components/Codex.jsx";
import StatusBar from "./components/StatusBar.jsx";
import Icon from "./components/Icon.jsx";
import { usePageRoute } from "./lib/usePageRoute.js";

const PAGES = [
  { key: "dashboard", label: "Dashboard", icon: "Atlas", Component: Dashboard },
  { key: "calendar", label: "Calendar", icon: "Calendar", Component: CalendarView },
  { key: "settlements", label: "Settlements", icon: "Settlements", Component: Settlements },
  { key: "garrison", label: "Garrison", icon: "Weapons", Component: Garrison },
  { key: "timeline", label: "Timeline", icon: "History", Component: Timeline },
  { key: "codex", label: "Codex", icon: "Codex", Component: Codex },
];

const PAGE_KEYS = PAGES.map((p) => p.key);

function App() {
  const [page, navigate] = usePageRoute(PAGE_KEYS, "dashboard");
  const active = PAGES.find((p) => p.key === page);
  const Active = active.Component;

  return (
    <div className="app-shell">
      <nav className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <Icon name="Atlas" size={22} />
          </span>
          <div>
            <h1 className="sidebar-title">Wilderweb</h1>
            <p className="sidebar-subtitle">Stirling Reach campaign atlas</p>
          </div>
        </div>
        <ul className="nav-list">
          {PAGES.map((p) => (
            <li key={p.key}>
              <a
                href={`/${p.key}`}
                className={`nav-item${page === p.key ? " active" : ""}`}
                onClick={(e) => {
                  e.preventDefault();
                  navigate(p.key);
                }}
              >
                <Icon name={p.icon} size={17} />
                <span className="nav-label">{p.label}</span>
              </a>
            </li>
          ))}
        </ul>
        <div className="sidebar-foot text-faint">Chronicled from the Discord annals</div>
      </nav>
      <div className="content-column">
        <StatusBar />
        <main className="main-content">
          <Active key={page} />
        </main>
      </div>
    </div>
  );
}

export default App;
