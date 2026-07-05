import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getTransporters, getLedger, recordPayment } from '../api';

export default function LedgerView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [transporters, setTransporters]   = useState([]);
  const [selectedId, setSelectedId]       = useState(id || '');
  const [ledger, setLedger]               = useState(null);
  const [payAmt, setPayAmt]               = useState('');
  const [payMode, setPayMode]             = useState('bank');
  const [payRef, setPayRef]               = useState('');
  const [paying, setPaying]               = useState(false);

  useEffect(() => { getTransporters().then(r => setTransporters(r.data)); }, []);
  useEffect(() => { if (id) setSelectedId(id); }, [id]);

  const loadLedger = (tid) => {
    if (!tid) return;
    getLedger(tid).then(r => setLedger(r.data));
  };

  useEffect(() => { loadLedger(selectedId); }, [selectedId]);

  const handleTransporterChange = (e) => {
    setSelectedId(e.target.value);
    navigate(`/ledger/${e.target.value}`, { replace: true });
  };

  const handlePayment = async () => {
    if (!payAmt || parseFloat(payAmt) <= 0) return alert('Enter a valid amount');
    setPaying(true);
    await recordPayment(selectedId, { amount: parseFloat(payAmt), mode: payMode, bankReference: payRef });
    await loadLedger(selectedId);
    setPayAmt(''); setPayRef('');
    setPaying(false);
  };

  const selectedTransporter = transporters.find(t => t.id === selectedId);

  return (
    <div>
      <div className="page-header"><h1>Transporter Ledger</h1></div>

      <div className="card">
        <div className="form-group" style={{ maxWidth: 320 }}>
          <label>Select Transporter</label>
          <select value={selectedId} onChange={handleTransporterChange}>
            <option value="">Choose transporter...</option>
            {transporters.map(t => <option key={t.id} value={t.id}>{t.firmName}</option>)}
          </select>
        </div>
      </div>

      {ledger && selectedTransporter && (
        <>
          <div className="stats">
            <div className="stat">
              <div className="stat-label">Outstanding Balance</div>
              <div className="stat-value amount" style={{ color: ledger.totalOutstanding > 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>
                ₹{ledger.totalOutstanding.toLocaleString('en-IN')}
              </div>
            </div>
            <div className="stat">
              <div className="stat-label">Total Trips</div>
              <div className="stat-value">{ledger.entries.length}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Commission Type</div>
              <div className="stat-value" style={{ fontSize: '1rem' }}>
                {selectedTransporter.commissionType === 'percentage' ? `${selectedTransporter.commissionValue}%` : `₹${selectedTransporter.commissionValue} fixed`}
              </div>
            </div>
          </div>

          <div className="card">
            <h3>Ledger Entries</h3>
            <table>
              <thead>
                <tr>
                  <th>#</th><th>Date</th><th>Route</th>
                  <th>Freight</th><th>Commission</th><th>Net Payable</th>
                  <th>Paid</th><th>Balance</th>
                </tr>
              </thead>
              <tbody>
                {ledger.entries.map((e, i) => (
                  <tr key={e.id}>
                    <td>{i + 1}</td>
                    <td>{new Date(e.entryDate).toLocaleDateString('en-IN')}</td>
                    <td style={{ fontSize: '0.8rem' }}>{e.trip?.route?.origin} → {e.trip?.route?.destination}</td>
                    <td className="amount">₹{e.freightCredited.toLocaleString('en-IN')}</td>
                    <td className="amount amount-debit">−₹{e.commissionDeducted.toLocaleString('en-IN')}</td>
                    <td className="amount"><strong>₹{e.netPayable.toLocaleString('en-IN')}</strong></td>
                    <td className="amount amount-credit">₹{e.paymentReceived.toLocaleString('en-IN')}</td>
                    <td className="amount" style={{ fontWeight: 600, color: e.outstandingBalance > 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>
                      ₹{e.outstandingBalance.toLocaleString('en-IN')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {ledger.entries.length === 0 && <p style={{ padding: 24, color: 'var(--color-muted)', textAlign: 'center' }}>No ledger entries yet. Close a trip to post here.</p>}
          </div>

          {/* Record Payment */}
          <div className="card">
            <h3>Record Payment Received</h3>
            <div className="form-row">
              <div className="form-group">
                <label>Amount (₹)</label>
                <input type="number" min="0" step="1" value={payAmt} onChange={e => setPayAmt(e.target.value)} placeholder="e.g. 50000" />
              </div>
              <div className="form-group">
                <label>Mode</label>
                <select value={payMode} onChange={e => setPayMode(e.target.value)}>
                  <option value="bank">Bank Transfer</option>
                  <option value="cash">Cash</option>
                </select>
              </div>
            </div>
            <div className="form-group">
              <label>Bank Reference / UTR (optional)</label>
              <input type="text" value={payRef} onChange={e => setPayRef(e.target.value)} placeholder="UTR or cheque number" />
            </div>
            <button className="btn btn-primary" onClick={handlePayment} disabled={paying}>
              {paying ? 'Saving...' : 'Record Payment'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
