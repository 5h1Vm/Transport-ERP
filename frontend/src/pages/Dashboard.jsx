import React, { useEffect, useState } from 'react';
import { getTrips, getTransporters } from '../api';
import { Link } from 'react-router-dom';

export default function Dashboard() {
  const [trips, setTrips] = useState([]);
  const [transporters, setTransporters] = useState([]);

  useEffect(() => {
    getTrips().then(r => setTrips(r.data));
    getTransporters().then(r => setTransporters(r.data));
  }, []);

  const open      = trips.filter(t => t.status === 'open').length;
  const delivered = trips.filter(t => t.status === 'delivered').length;
  const closed    = trips.filter(t => t.status === 'closed').length;
  const totalFreight = trips.filter(t => t.status === 'closed').reduce((s, t) => s + t.freightTotal, 0);

  return (
    <div>
      <div className="page-header"><h1>Dashboard</h1></div>
      <div className="stats">
        <div className="stat"><div className="stat-label">Open Trips</div><div className="stat-value">{open}</div></div>
        <div className="stat"><div className="stat-label">Delivered</div><div className="stat-value">{delivered}</div></div>
        <div className="stat"><div className="stat-label">Closed</div><div className="stat-value">{closed}</div></div>
        <div className="stat"><div className="stat-label">Total Freight (Closed)</div><div className="stat-value amount">₹{totalFreight.toLocaleString('en-IN')}</div></div>
        <div className="stat"><div className="stat-label">Transporters</div><div className="stat-value">{transporters.length}</div></div>
      </div>

      <div className="card">
        <h3>Recent Trips</h3>
        <table>
          <thead><tr><th>Date</th><th>Vehicle</th><th>Route</th><th>Freight</th><th>Status</th></tr></thead>
          <tbody>
            {trips.slice(0, 8).map(t => (
              <tr key={t.id}>
                <td>{new Date(t.tripDate).toLocaleDateString('en-IN')}</td>
                <td><Link to={`/trips/${t.id}`}>{t.vehicle?.vehicleNumber}</Link></td>
                <td>{t.route?.origin} → {t.route?.destination}</td>
                <td className="amount">₹{t.freightTotal.toLocaleString('en-IN')}</td>
                <td><span className={`badge badge-${t.status}`}>{t.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
