import React, { useEffect, useState } from 'react';
import { getTransporters } from '../api';
import { Link } from 'react-router-dom';

export default function TransporterList() {
  const [transporters, setTransporters] = useState([]);
  useEffect(() => { getTransporters().then(r => setTransporters(r.data)); }, []);

  return (
    <div>
      <div className="page-header"><h1>Transporters</h1></div>
      <div className="card">
        <table>
          <thead>
            <tr><th>Firm Name</th><th>Commission</th><th>Bank</th><th>Rate Cards</th><th></th></tr>
          </thead>
          <tbody>
            {transporters.map(t => (
              <tr key={t.id}>
                <td><strong>{t.firmName}</strong>{t.contactName && <span style={{ color: 'var(--color-muted)', fontSize: '0.8rem', display: 'block' }}>{t.contactName}</span>}</td>
                <td>{t.commissionType === 'percentage' ? `${t.commissionValue}%` : `₹${t.commissionValue}`}</td>
                <td>{t.bankName || '—'}</td>
                <td>
                  {t.ratecards?.map(rc => (
                    <span key={rc.id} style={{ display: 'block', fontSize: '0.8rem', color: 'var(--color-muted)' }}>
                      {rc.route?.origin} → {rc.route?.destination}: ₹{rc.ratePerUnit}/T
                    </span>
                  ))}
                </td>
                <td><Link to={`/ledger/${t.id}`} className="btn btn-sm btn-secondary">View Ledger</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
