import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getTransporters, getVehicles, getDrivers, getRoutes, getRateCard, createTrip } from '../api';

const ORG_ID = 'org-demo-001';

export default function TripCreate() {
  const navigate = useNavigate();
  const [transporters, setTransporters] = useState([]);
  const [vehicles, setVehicles]         = useState([]);
  const [drivers, setDrivers]           = useState([]);
  const [routes, setRoutes]             = useState([]);
  const [form, setForm] = useState({
    transporterId: '', vehicleId: '', driverId: '', routeId: '',
    quantity: '', paymentMode: 'bank', notes: '',
  });
  const [ratePerUnit, setRatePerUnit] = useState(null);
  const [freightPreview, setFreightPreview] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getTransporters().then(r => setTransporters(r.data));
    getVehicles().then(r => setVehicles(r.data));
    getDrivers().then(r => setDrivers(r.data));
    getRoutes().then(r => setRoutes(r.data));
  }, []);

  // Auto-fetch rate card when transporter + route selected
  useEffect(() => {
    if (form.transporterId && form.routeId) {
      getRateCard(form.transporterId, form.routeId)
        .then(r => {
          const rc = r.data[0];
          if (rc) { setRatePerUnit(rc.ratePerUnit); }
          else    { setRatePerUnit(null); }
        })
        .catch(() => setRatePerUnit(null));
    }
  }, [form.transporterId, form.routeId]);

  useEffect(() => {
    if (ratePerUnit && form.quantity) {
      setFreightPreview(ratePerUnit * parseFloat(form.quantity));
    } else {
      setFreightPreview(0);
    }
  }, [ratePerUnit, form.quantity]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await createTrip({ ...form, orgId: ORG_ID });
      navigate(`/trips/${res.data.id}`);
    } catch (err) {
      alert('Error creating trip: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="page-header"><h1>New Trip</h1></div>
      <div className="card">
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label>Transporter</label>
              <select value={form.transporterId} onChange={e => set('transporterId', e.target.value)} required>
                <option value="">Select transporter...</option>
                {transporters.map(t => <option key={t.id} value={t.id}>{t.firmName}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Route</label>
              <select value={form.routeId} onChange={e => set('routeId', e.target.value)} required>
                <option value="">Select route...</option>
                {routes.map(r => <option key={r.id} value={r.id}>{r.origin} → {r.destination}</option>)}
              </select>
            </div>
          </div>

          {ratePerUnit && (
            <div style={{ background: '#e8f4f4', padding: '8px 12px', borderRadius: 6, marginBottom: 16, fontSize: '0.875rem', color: 'var(--color-primary)' }}>
              Rate: ₹{ratePerUnit.toLocaleString('en-IN')} / tonne
            </div>
          )}
          {form.transporterId && form.routeId && !ratePerUnit && (
            <div style={{ background: '#fff3cd', padding: '8px 12px', borderRadius: 6, marginBottom: 16, fontSize: '0.875rem' }}>
              ⚠️ No rate card found for this transporter + route. Freight will be ₹0.
            </div>
          )}

          <div className="form-row">
            <div className="form-group">
              <label>Vehicle</label>
              <select value={form.vehicleId} onChange={e => set('vehicleId', e.target.value)} required>
                <option value="">Select vehicle...</option>
                {vehicles.map(v => <option key={v.id} value={v.id}>{v.vehicleNumber} ({v.capacity}T)</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Driver</label>
              <select value={form.driverId} onChange={e => set('driverId', e.target.value)} required>
                <option value="">Select driver...</option>
                {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Quantity (Tonnes)</label>
              <input type="number" step="0.01" min="0" value={form.quantity} onChange={e => set('quantity', e.target.value)} required />
            </div>
            <div className="form-group">
              <label>Payment Mode</label>
              <select value={form.paymentMode} onChange={e => set('paymentMode', e.target.value)}>
                <option value="bank">Bank Transfer</option>
                <option value="road">Road (Cash)</option>
              </select>
            </div>
          </div>

          {freightPreview > 0 && (
            <div style={{ background: '#f0fdf4', padding: '12px 16px', borderRadius: 6, marginBottom: 16 }}>
              <strong>Freight Total: ₹{freightPreview.toLocaleString('en-IN')}</strong>
              {ratePerUnit && <span style={{ color: 'var(--color-muted)', fontSize: '0.8rem', marginLeft: 8 }}>({form.quantity} T × ₹{ratePerUnit})</span>}
            </div>
          )}

          <div className="form-group">
            <label>Notes</label>
            <input type="text" value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Optional notes..." />
          </div>

          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Create Trip'}</button>
            <button type="button" className="btn btn-secondary" onClick={() => navigate('/trips')}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}
