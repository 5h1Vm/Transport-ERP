import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getTrip, updateTripStatus, uploadPOD } from '../api';

export default function TripDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [trip, setTrip] = useState(null);
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = () => getTrip(id).then(r => setTrip(r.data));
  useEffect(() => { load(); }, [id]);

  const changeStatus = async (status) => {
    setLoading(true);
    await updateTripStatus(id, status);
    await load();
    setLoading(false);
  };

  const submitPOD = async () => {
    if (!file) return alert('Please select a file first');
    setLoading(true);
    const fd = new FormData();
    fd.append('pod', file);
    await uploadPOD(id, fd);
    await load();
    setLoading(false);
  };

  if (!trip) return <div style={{ padding: 32 }}>Loading...</div>;

  const { transporter, vehicle, driver, route, party } = trip;

  return (
    <div>
      <div className="page-header">
        <h1>{vehicle?.vehicleNumber} — {route?.origin} → {route?.destination}</h1>
        <span className={`badge badge-${trip.status}`}>{trip.status}</span>
      </div>

      <div className="card">
        <h3>Trip Details</h3>
        <table>
          <tbody>
            <tr><td><strong>Date</strong></td><td>{new Date(trip.tripDate).toLocaleDateString('en-IN')}</td></tr>
            <tr><td><strong>Transporter</strong></td><td>{transporter?.firmName}</td></tr>
            <tr><td><strong>Vehicle</strong></td><td>{vehicle?.vehicleNumber} ({vehicle?.capacity}T)</td></tr>
            <tr><td><strong>Driver</strong></td><td>{driver?.name} · {driver?.mobileNumber}</td></tr>
            <tr><td><strong>Route</strong></td><td>{route?.origin} → {route?.destination}</td></tr>
            <tr><td><strong>Party</strong></td><td>{party?.partyName || '—'}</td></tr>
            <tr><td><strong>Quantity</strong></td><td>{trip.quantity} Tonnes</td></tr>
            <tr><td><strong>Freight Total</strong></td><td className="amount"><strong>₹{trip.freightTotal.toLocaleString('en-IN')}</strong></td></tr>
            <tr><td><strong>Payment Mode</strong></td><td style={{ textTransform: 'capitalize' }}>{trip.paymentMode}</td></tr>
            <tr><td><strong>Notes</strong></td><td>{trip.notes || '—'}</td></tr>
            {trip.podFileUrl && <tr><td><strong>POD</strong></td><td><a href={trip.podFileUrl} target="_blank" rel="noreferrer">View POD</a></td></tr>}
          </tbody>
        </table>
      </div>

      {/* POD Upload */}
      {trip.status === 'open' && (
        <div className="card">
          <h3>Upload Proof of Delivery (POD)</h3>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <input type="file" accept="image/*,application/pdf" onChange={e => setFile(e.target.files[0])} />
            <button className="btn btn-primary btn-sm" onClick={submitPOD} disabled={loading}>Upload & Mark Delivered</button>
          </div>
        </div>
      )}

      {/* Status Actions */}
      <div className="card">
        <h3>Update Status</h3>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {trip.status === 'open' && (
            <button className="btn btn-secondary" onClick={() => changeStatus('delivered')} disabled={loading}>Mark as Delivered</button>
          )}
          {(trip.status === 'open' || trip.status === 'delivered') && (
            <button className="btn btn-primary" onClick={() => changeStatus('closed')} disabled={loading}>
              Close Trip → Post to Ledger
            </button>
          )}
          {trip.status === 'closed' && (
            <button className="btn btn-secondary" onClick={() => navigate(`/ledger/${trip.transporterId}`)}>View Ledger →</button>
          )}
        </div>
        {trip.status === 'closed' && trip.ledgerEntry && (
          <div style={{ marginTop: 16, background: '#f0fdf4', padding: 16, borderRadius: 8, fontSize: '0.875rem' }}>
            <strong>Ledger Posted</strong><br />
            Freight: ₹{trip.ledgerEntry.freightCredited.toLocaleString('en-IN')} &nbsp;|&nbsp;
            Commission: ₹{trip.ledgerEntry.commissionDeducted.toLocaleString('en-IN')} &nbsp;|&nbsp;
            Net Payable: ₹{trip.ledgerEntry.netPayable.toLocaleString('en-IN')}
          </div>
        )}
      </div>

      <div style={{ marginTop: 8 }}>
        <button className="btn btn-secondary btn-sm" onClick={() => navigate('/trips')}>← Back to Trips</button>
      </div>
    </div>
  );
}
