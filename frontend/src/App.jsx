import React from 'react';
import { Routes, Route, NavLink } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import TripList from './pages/TripList';
import TripCreate from './pages/TripCreate';
import TripDetail from './pages/TripDetail';
import LedgerView from './pages/LedgerView';
import TransporterList from './pages/TransporterList';

export default function App() {
  return (
    <div className="layout">
      <nav className="sidebar">
        <div className="sidebar-logo">🚛 Transport ERP</div>
        <NavLink to="/"               end>Dashboard</NavLink>
        <NavLink to="/trips">Trips</NavLink>
        <NavLink to="/trips/new">+ New Trip</NavLink>
        <NavLink to="/transporters">Transporters</NavLink>
        <NavLink to="/ledger">Ledger</NavLink>
      </nav>
      <main className="main">
        <Routes>
          <Route path="/"                element={<Dashboard />} />
          <Route path="/trips"           element={<TripList />} />
          <Route path="/trips/new"       element={<TripCreate />} />
          <Route path="/trips/:id"       element={<TripDetail />} />
          <Route path="/transporters"    element={<TransporterList />} />
          <Route path="/ledger"          element={<LedgerView />} />
          <Route path="/ledger/:id"      element={<LedgerView />} />
        </Routes>
      </main>
    </div>
  );
}
