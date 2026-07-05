import React, { useEffect, useState } from 'react';
import { getTrips } from '../api';
import { Link } from 'react-router-dom';

export default function TripList() {
  const [trips, setTrips] = useState([]);
  const [filter, setFilter] = useState('all');

  useEffect(() => { getTrips().then(r => setTrips(r.data)); }, []);

  const filtered = filter === 'all' ? trips : trips.filter(t => t.status === filter);

  return (
    <div>
      <div className="page-header">
        <h1>All Trips</h1>
        <Link to="/trips/new" className="btn btn-primary">+ New Trip</Link>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {['all','open','delivered','closed'].map(s => (
          <button key={s} className={`btn btn-sm ${filter===s ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFilter(s)}>
            {s.charAt(0).toUpperCase()+s.slice(1)}
          </button>
        ))}
      </div>

      <div className="card">
        <table>
          <thead>
            <tr><th>#</th><th>Date</th><th>Transporter</th><th>Vehicle</th><th>Driver</th><th>Route</th><th>Qty</th><th>Freight</th><th>Status</th></tr>
          </thead>
          <tbody>
            {filtered.map((t, i) => (
              <tr key={t.id}>
                <td>{i + 1}</td>
                <td>{new Date(t.tripDate).toLocaleDateString('en-IN')}</td>
                <td>{t.transporter?.firmName}</td>
                <td><Link to={`/trips/${t.id}`}>{t.vehicle?.vehicleNumber}</Link></td>
                <td>{t.driver?.name}</td>
                <td>{t.route?.origin} → {t.route?.destination}</td>
                <td>{t.quantity} T</td>
                <td className="amount">₹{t.freightTotal.toLocaleString('en-IN')}</td>
                <td><span className={`badge badge-${t.status}`}>{t.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <p style={{ padding: '24px', color: 'var(--color-muted)', textAlign: 'center' }}>No trips found.</p>}
      </div>
    </div>
  );
}
