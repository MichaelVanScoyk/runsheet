import { BrowserRouter as Router, Routes, Route, NavLink } from 'react-router-dom';
import IncidentsPage from './pages/IncidentsPage';
import PersonnelPage from './pages/PersonnelPage';
import ApparatusPage from './pages/ApparatusPage';
import MunicipalitiesPage from './pages/MunicipalitiesPage';
import AdminPage from './pages/AdminPage';
import ReportsPage from './pages/ReportsPage';
import './App.css';
import NerisCodesPage from './components/NerisCodesPage';

function App() {
  return (
    <Router>
      <div className="app">
        <nav className="sidebar">
          <div className="logo">
            <h1>RunSheet</h1>
            <span>Station 48</span>
          </div>
          <ul className="nav-links">
            <li>
              <NavLink to="/" className={({ isActive }) => isActive ? 'active' : ''}>
                📋 Incidents
              </NavLink>
            </li>
            <li>
              <NavLink to="/reports" className={({ isActive }) => isActive ? 'active' : ''}>
                📊 Reports
              </NavLink>
            </li>
            <li>
              <NavLink to="/personnel" className={({ isActive }) => isActive ? 'active' : ''}>
                👥 Personnel
              </NavLink>
            </li>
            <li>
              <NavLink to="/apparatus" className={({ isActive }) => isActive ? 'active' : ''}>
                🚒 Apparatus
              </NavLink>
            </li>
            <li>
              <NavLink to="/municipalities" className={({ isActive }) => isActive ? 'active' : ''}>
                🏘️ Municipalities
              </NavLink>
            </li>
            <li>
              <NavLink to="/admin" className={({ isActive }) => isActive ? 'active' : ''}>
                🔧 Admin
              </NavLink>
            </li>
          </ul>
        </nav>
        <main className="content">
          <Routes>
            <Route path="/" element={<IncidentsPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/personnel" element={<PersonnelPage />} />
            <Route path="/apparatus" element={<ApparatusPage />} />
            <Route path="/municipalities" element={<MunicipalitiesPage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/admin/neris" element={<NerisCodesPage />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
